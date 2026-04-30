"""Unit tests for the pure helpers in `app.job.data_gathering`."""

from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

import pytest

from app.config import Settings
from app.job import data_gathering as dg
from app.services.trips import Trip

TZ = ZoneInfo("America/Los_Angeles")


def _settings(**overrides: Any) -> Settings:
    defaults: dict[str, Any] = {
        "app_env": "local",
        "commute_window_start_hour": 6,
        "commute_window_end_hour": 21,
        "commute_interval_minutes": 15,
        "commute_days_per_week": 7,
        "commute_throttle_every": 0,
        "max_weekly_routes_calls": 10_000,
    }
    defaults.update(overrides)
    return Settings(**defaults)


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


class TestQueryDepartureTime:
    """`_query_departure_time` keeps future slots and shifts past ones forward.

    The shift is by full week multiples so the returned timestamp is the
    same weekday + same hh:mm as the slot, which is what gives a
    week-cyclical traffic prediction.
    """

    def test_future_slot_is_returned_unchanged(self) -> None:
        now = datetime(2026, 4, 30, 9, 49, tzinfo=TZ)  # Thu
        slot = datetime(2026, 5, 2, 14, 0, tzinfo=TZ)  # Sat next week
        assert dg._query_departure_time(slot, now=now) == slot

    def test_past_slot_in_current_week_shifts_one_week(self) -> None:
        now = datetime(2026, 4, 30, 9, 49, tzinfo=TZ)  # Thu
        slot = datetime(2026, 4, 27, 8, 0, tzinfo=TZ)  # Mon this week
        result = dg._query_departure_time(slot, now=now)
        assert result == datetime(2026, 5, 4, 8, 0, tzinfo=TZ)
        assert result.weekday() == slot.weekday()
        assert (result.hour, result.minute) == (slot.hour, slot.minute)

    def test_multi_week_stale_slot_shifts_multiple_weeks(self) -> None:
        # Apr 16 8am (Thu) is two weeks back. Apr 30 8am (today) is
        # also still in the past relative to `now=09:49`, so the
        # smallest forward shift that clears the buffer is +21 days.
        now = datetime(2026, 4, 30, 9, 49, tzinfo=TZ)
        slot = datetime(2026, 4, 16, 8, 0, tzinfo=TZ)
        result = dg._query_departure_time(slot, now=now)
        assert result == datetime(2026, 5, 7, 8, 0, tzinfo=TZ)
        assert result.weekday() == slot.weekday()
        assert (result.hour, result.minute) == (slot.hour, slot.minute)

    def test_slot_equal_to_now_is_shifted_past_buffer(self) -> None:
        # `slot_ts == now` would otherwise sail through and Google would
        # see a past timestamp once the request lands. The 2-minute
        # buffer forces a forward shift.
        now = datetime(2026, 4, 30, 9, 49, tzinfo=TZ)
        slot = now
        result = dg._query_departure_time(slot, now=now)
        assert result == now + timedelta(days=7)

    def test_slot_just_inside_buffer_still_shifts(self) -> None:
        # 1 minute in the future is *inside* the 2-minute safety buffer.
        now = datetime(2026, 4, 30, 9, 49, tzinfo=TZ)
        slot = now + timedelta(minutes=1)
        result = dg._query_departure_time(slot, now=now)
        assert result > now + timedelta(minutes=2)

    def test_slot_just_outside_buffer_is_unchanged(self) -> None:
        now = datetime(2026, 4, 30, 9, 49, tzinfo=TZ)
        slot = now + timedelta(minutes=3)
        assert dg._query_departure_time(slot, now=now) == slot

    def test_default_now_is_used_when_omitted(self) -> None:
        # Stale slot with no explicit `now`: must come back strictly
        # in the future of wall-clock time.
        slot = datetime(2020, 1, 1, 8, 0, tzinfo=TZ)
        result = dg._query_departure_time(slot)
        assert result > datetime.now(TZ)
        # Same weekday + hh:mm preserved across the multi-year shift.
        assert result.weekday() == slot.weekday()
        assert (result.hour, result.minute) == (slot.hour, slot.minute)


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

    def fake_upsert(**_kw):
        calls.append("upsert")
        return 0

    def fake_fill(**_kw):
        calls.append("fill")
        return {"updated": 0, "errors": 0}

    monkeypatch.setattr(dg, "_upsert_empty_slots", fake_upsert)
    monkeypatch.setattr(dg, "_fill_in_slots_for_trip", fake_fill)

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


class TestFillInSlotsAbortsOnSoftDelete:
    """Mid-loop `_trip_is_soft_deleted` flip stops further provider calls.

    The check piggy-backs on the throttle boundary, so with
    `commute_throttle_every=N` the loop runs N slots and *then* notices
    the soft-delete on the post-batch check, exiting the loop. We
    deliberately don't check more often than that to avoid an extra DB
    round-trip per slot.
    """

    @staticmethod
    def _trip() -> Trip:
        return Trip(
            id=42,
            user_id=1,
            name="T",
            origin_address="A",
            destination_address="B",
            created_at=None,
        )

    @staticmethod
    def _pending(n: int) -> list[dict]:
        # Use future timestamps so `_query_departure_time` is a no-op
        # and we don't depend on wall-clock for the test.
        base = datetime.now(TZ) + timedelta(days=14)
        return [
            {
                "id": i + 1,
                "trip_id": 42,
                "direction": "outbound",
                "departure_time_rfc3339": (
                    base + timedelta(minutes=15 * i)
                ).isoformat(),
            }
            for i in range(n)
        ]

    @staticmethod
    def _fake_db_factory():
        class _Cursor:
            def __init__(self) -> None:
                self.executes: list = []
                self.rowcount = 1

            def execute(self, query, values=None) -> None:
                self.executes.append((query, values))

        cursor = _Cursor()

        class _DB:
            def __enter__(self_inner):
                return cursor

            def __exit__(self_inner, *exc) -> None:
                return None

        return _DB, cursor

    def test_loop_breaks_at_throttle_boundary_when_soft_deleted(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        settings = _settings(commute_throttle_every=3, commute_throttle_seconds=0)

        # 10 pending slots: with throttle_every=3, the loop processes
        # slots 1-3, hits the boundary, sees the soft-delete, breaks.
        pending = self._pending(10)
        monkeypatch.setattr(dg, "_fetch_pending_slots", lambda *_a, **_kw: pending)

        db_cls, _cursor = self._fake_db_factory()
        monkeypatch.setattr(dg, "Database", db_cls)

        # Soft-delete is True from the very first check.
        delete_check_calls: list[int] = []

        def fake_check(trip_id: int) -> bool:
            delete_check_calls.append(trip_id)
            return True

        monkeypatch.setattr(dg, "_trip_is_soft_deleted", fake_check)

        # Sleep should never be reached: the abort runs before sleep.
        monkeypatch.setattr(
            dg.time,
            "sleep",
            lambda *_a, **_kw: pytest.fail("sleep called after abort"),
        )

        provider_calls: list[tuple] = []

        class FakeProvider:
            def fetch(self, *args, **kwargs):  # noqa: ARG002
                provider_calls.append(args)
                return type(
                    "R",
                    (),
                    {
                        "distance_meters": 100,
                        "duration": "60s",
                        "condition": "OK",
                        "status_code": "OK",
                        "status_message": None,
                    },
                )()

        result = dg._fill_in_slots_for_trip(
            trip=self._trip(),
            week_start=date(2025, 11, 10),
            provider=FakeProvider(),
            settings=settings,
        )

        # Exactly one throttle-batch worth of provider calls — no more.
        assert len(provider_calls) == 3
        # The soft-delete check fires at the boundary.
        assert delete_check_calls == [42]
        assert result == {"updated": 3, "errors": 0}

    def test_loop_continues_when_not_soft_deleted(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """Negative control: an active trip runs to completion."""
        settings = _settings(commute_throttle_every=3, commute_throttle_seconds=0)
        pending = self._pending(5)
        monkeypatch.setattr(dg, "_fetch_pending_slots", lambda *_a, **_kw: pending)

        db_cls, _cursor = self._fake_db_factory()
        monkeypatch.setattr(dg, "Database", db_cls)

        check_count = 0

        def fake_check(trip_id: int) -> bool:
            nonlocal check_count
            check_count += 1
            return False

        monkeypatch.setattr(dg, "_trip_is_soft_deleted", fake_check)
        monkeypatch.setattr(dg.time, "sleep", lambda *_a, **_kw: None)

        provider_calls: list[int] = []

        class FakeProvider:
            def fetch(self, *_args, **_kwargs):
                provider_calls.append(1)
                return type(
                    "R",
                    (),
                    {
                        "distance_meters": 100,
                        "duration": "60s",
                        "condition": "OK",
                        "status_code": "OK",
                        "status_message": None,
                    },
                )()

        result = dg._fill_in_slots_for_trip(
            trip=self._trip(),
            week_start=date(2025, 11, 10),
            provider=FakeProvider(),
            settings=settings,
        )

        assert len(provider_calls) == 5  # all slots processed
        assert check_count == 1  # one boundary at idx=2 (slots 1-3)
        assert result == {"updated": 5, "errors": 0}


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

    def fake_upsert(**kw):
        upserts.append(kw["trip_id"])
        return 0

    def fake_fill(**kw):
        fills.append(kw["trip"].id)
        return {"updated": 0, "errors": 0}

    monkeypatch.setattr(dg, "_upsert_empty_slots", fake_upsert)
    monkeypatch.setattr(dg, "_fill_in_slots_for_trip", fake_fill)

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
