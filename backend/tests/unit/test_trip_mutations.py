"""Unit tests for the rolling-7-day mutation cap service.

DB access is monkey-patched so we can drive `count_recent_mutations`,
`quota_for_user`, `assert_within_quota`, and `record_mutation` against an
in-memory list and verify the algebra: counts of recent rows, oldest-age
math, retry-after calculations, and the threshold at which it raises.
"""

from __future__ import annotations

from collections.abc import Iterator
from datetime import UTC, datetime, timedelta

import pytest

from app.config import Settings
from app.services import trip_mutations


@pytest.fixture
def store() -> list[dict]:
    return []


@pytest.fixture
def patched_db(
    monkeypatch: pytest.MonkeyPatch, store: list[dict]
) -> Iterator[None]:
    """Stand in for `Database()` so SQL becomes a list-comprehension query."""

    class _FakeCursor:
        def __init__(self, rows: list[dict]):
            self._rows = rows
            self._result: list = []

        def execute(self, sql: str, params: tuple) -> None:
            sql_lower = sql.lower()
            if "insert into trip_mutation_log" in sql_lower:
                user_id, trip_id, kind = params
                self._rows.append(
                    {
                        "user_id": user_id,
                        "trip_id": trip_id,
                        "kind": kind,
                        "created_at": datetime.now(UTC),
                    }
                )
                self._result = []
                return
            if (
                "select count(*), min(created_at)" in sql_lower
                and "trip_mutation_log" in sql_lower
            ):
                user_id, since = params
                in_window = [
                    r
                    for r in self._rows
                    if r["user_id"] == user_id and r["created_at"] >= since
                ]
                count = len(in_window)
                oldest = min(
                    (r["created_at"] for r in in_window), default=None
                )
                self._result = [(count, oldest)]
                return
            if "select count(*) from trip_mutation_log" in sql_lower:
                user_id, since = params
                count = sum(
                    1
                    for r in self._rows
                    if r["user_id"] == user_id and r["created_at"] >= since
                )
                self._result = [(count,)]
                return
            raise AssertionError(f"unexpected SQL: {sql}")

        def fetchone(self):
            return self._result[0] if self._result else None

    class _FakeDb:
        def __init__(self) -> None:
            self._cursor = _FakeCursor(store)

        def __enter__(self):
            return self._cursor

        def __exit__(self, *_a):
            return False

    monkeypatch.setattr(trip_mutations, "Database", _FakeDb)
    yield


@pytest.fixture
def settings() -> Settings:
    return Settings(max_trip_mutations_per_week=3)


def test_count_recent_mutations_excludes_old_rows(
    store: list[dict], patched_db: None, settings: Settings  # noqa: ARG001
) -> None:
    now = datetime.now(UTC)
    store.extend(
        [
            # In window
            {"user_id": 1, "trip_id": 1, "kind": "create", "created_at": now},
            {
                "user_id": 1,
                "trip_id": 1,
                "kind": "address_change",
                "created_at": now - timedelta(days=2),
            },
            # Outside window (8 days ago)
            {
                "user_id": 1,
                "trip_id": 1,
                "kind": "create",
                "created_at": now - timedelta(days=8),
            },
            # Different user
            {"user_id": 2, "trip_id": 1, "kind": "create", "created_at": now},
        ]
    )
    assert trip_mutations.count_recent_mutations(1, now=now) == 2


def test_quota_reports_zero_when_empty(
    patched_db: None, settings: Settings  # noqa: ARG001
) -> None:
    q = trip_mutations.quota_for_user(99, settings)
    assert q.used == 0
    assert q.limit == 3
    assert q.oldest_age_seconds is None


def test_assert_within_quota_passes_below_cap(
    store: list[dict], patched_db: None, settings: Settings  # noqa: ARG001
) -> None:
    now = datetime.now(UTC)
    store.append(
        {"user_id": 7, "trip_id": 1, "kind": "create", "created_at": now}
    )
    # 1 of 3 used -> no raise.
    trip_mutations.assert_within_quota(7, settings, now=now)


def test_assert_within_quota_raises_at_cap(
    store: list[dict], patched_db: None, settings: Settings  # noqa: ARG001
) -> None:
    now = datetime.now(UTC)
    # Fill to cap.
    for delta_days in (1, 2, 3):
        store.append(
            {
                "user_id": 7,
                "trip_id": 1,
                "kind": "create",
                "created_at": now - timedelta(days=delta_days),
            }
        )
    with pytest.raises(trip_mutations.TripMutationQuotaExceededError) as ei:
        trip_mutations.assert_within_quota(7, settings, now=now)
    exc = ei.value
    assert exc.used == 3
    assert exc.limit == 3
    # Oldest is 3 days old, window is 7 days -> retry in ~4 days.
    assert exc.retry_after_seconds == int(timedelta(days=4).total_seconds())


def test_record_mutation_appends(
    store: list[dict], patched_db: None  # noqa: ARG001
) -> None:
    trip_mutations.record_mutation(user_id=42, trip_id=7, kind="create")
    assert len(store) == 1
    row = store[0]
    assert row["user_id"] == 42
    assert row["trip_id"] == 7
    assert row["kind"] == "create"
