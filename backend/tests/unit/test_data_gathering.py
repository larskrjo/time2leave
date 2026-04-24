"""Unit tests for the pure helpers in `app.job.data_gathering`."""

from __future__ import annotations

from datetime import date, datetime
from zoneinfo import ZoneInfo

import pytest

from app.config import Settings
from app.job import data_gathering as dg
from app.services.trips import Trip

TZ = ZoneInfo("America/Los_Angeles")


def _settings(**overrides) -> Settings:
    return Settings(
        app_env="local",
        commute_window_start_hour=6,
        commute_window_end_hour=21,
        commute_interval_minutes=15,
        commute_days_per_week=7,
        commute_throttle_every=0,
        max_weekly_routes_calls=overrides.pop("max_weekly_routes_calls", 10_000),
        **overrides,
    )


def test_next_week_monday_skips_to_next_week() -> None:
    # Tuesday 2025-11-11 → next Monday is 2025-11-17.
    assert dg.next_week_monday(date(2025, 11, 11)) == date(2025, 11, 17)


def test_next_week_monday_from_sunday() -> None:
    # Sunday 2025-11-16 → next Monday is still 2025-11-17.
    assert dg.next_week_monday(date(2025, 11, 16)) == date(2025, 11, 17)


def test_current_week_monday_from_wednesday() -> None:
    assert dg.current_week_monday(date(2025, 11, 12)) == date(2025, 11, 10)


def test_slots_per_trip_per_week_default_window() -> None:
    settings = _settings()
    # (21-6) * 60 / 15 = 60 slots/day; 60 * 7 * 2 directions = 840.
    assert dg.slots_per_trip_per_week(settings) == 840


def test_slots_for_day_is_start_inclusive_end_exclusive() -> None:
    settings = _settings()
    day = date(2025, 11, 10)  # Monday
    slots = dg._slots_for_day(day, settings)

    assert slots[0] == datetime(2025, 11, 10, 6, 0, tzinfo=TZ)
    assert slots[-1] == datetime(2025, 11, 10, 20, 45, tzinfo=TZ)
    assert len(slots) == 60


def test_duration_string_parsing() -> None:
    assert dg._duration_string_to_seconds("1234s") == 1234
    assert dg._duration_string_to_seconds("0s") == 0
    assert dg._duration_string_to_seconds(None) is None
    assert dg._duration_string_to_seconds("") is None
    assert dg._duration_string_to_seconds("garbage") is None


def test_origin_destination_flips_for_return() -> None:
    trip = Trip(
        id=1,
        user_id=1,
        name=None,
        origin_address="A",
        destination_address="B",
        created_at=None,
    )
    assert dg._origin_destination(trip, "outbound") == ("A", "B")
    assert dg._origin_destination(trip, "return") == ("B", "A")


def test_plan_and_run_no_trips_is_a_noop(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    settings = _settings()
    provider_calls: list[tuple] = []

    class FakeProvider:
        def fetch(self, *args, **kwargs):  # noqa: ARG002
            provider_calls.append(args)

    with caplog.at_level("INFO"):
        dg._plan_and_run(
            trips=[],
            week_start=date(2025, 11, 10),
            provider=FakeProvider(),
            settings=settings,
            enforce_ceiling=True,
        )

    assert provider_calls == []
    assert any("nothing to do" in rec.message for rec in caplog.records)


def test_plan_and_run_enforces_ceiling(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    """Budget above the ceiling should abort before any DB/provider call."""
    settings = _settings(max_weekly_routes_calls=500)
    trip = Trip(
        id=1,
        user_id=1,
        name="T",
        origin_address="A",
        destination_address="B",
        created_at=None,
    )

    calls: list[str] = []
    monkeypatch.setattr(
        dg, "_upsert_empty_slots", lambda **_kw: calls.append("upsert") or 0
    )
    monkeypatch.setattr(
        dg,
        "_fill_in_slots_for_trip",
        lambda **_kw: calls.append("fill") or {"updated": 0, "errors": 0},
    )

    class DummyProvider:
        def fetch(self, *args, **kwargs):  # noqa: ARG002
            raise AssertionError("should not be called")

    with caplog.at_level("ERROR"):
        dg._plan_and_run(
            trips=[trip],
            week_start=date(2025, 11, 10),
            provider=DummyProvider(),
            settings=settings,
            enforce_ceiling=True,
        )

    assert calls == []  # neither upsert nor fill invoked
    assert any(
        "exceeds MAX_WEEKLY_ROUTES_CALLS" in rec.message for rec in caplog.records
    )


def test_plan_and_run_bypasses_ceiling_for_backfill(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """`enforce_ceiling=False` should still run when the nominal budget is high."""
    settings = _settings(max_weekly_routes_calls=1)
    trip = Trip(
        id=7,
        user_id=1,
        name="T",
        origin_address="A",
        destination_address="B",
        created_at=None,
    )

    upserts: list[int] = []
    fills: list[int] = []
    monkeypatch.setattr(
        dg,
        "_upsert_empty_slots",
        lambda **kw: upserts.append(kw["trip_id"]) or 0,
    )
    monkeypatch.setattr(
        dg,
        "_fill_in_slots_for_trip",
        lambda **kw: fills.append(kw["trip"].id) or {"updated": 0, "errors": 0},
    )

    class DummyProvider:
        def fetch(self, *args, **kwargs):  # noqa: ARG002
            return None

    dg._plan_and_run(
        trips=[trip],
        week_start=date(2025, 11, 10),
        provider=DummyProvider(),
        settings=settings,
        enforce_ceiling=False,
    )

    assert upserts == [7]
    assert fills == [7]
