"""Unit tests for `app.services.trips`: soft_delete plus the week helpers.

`soft_delete_trip` contract: HTTP DELETE-style idempotency — deleting
an already-soft-deleted trip should silently succeed instead of
raising, while deleting a trip that never existed for the user should
still raise. This matters because the trips list page commits its
undo-window deletion via two paths (the snackbar autoHide and a
component-unmount cleanup) and any race between them used to surface
a misleading "Trip not found" banner.

`next_week_start` / `is_week_fully_populated` underpin the "next-week
toggle" the trip detail page renders once the upcoming week's data
has fully landed.
"""

from __future__ import annotations

from datetime import date
from unittest.mock import MagicMock, patch

import pytest

from app.services.trips import (
    TripNotFoundError,
    _generate_slug,
    create_trip,
    get_trip_for_user_by_slug,
    is_week_fully_populated,
    next_week_start,
    soft_delete_trip,
)


def _patched_database():
    """Yield (cursor_mock, context_patch) so each test can assert SQL."""
    cursor = MagicMock()

    class FakeDatabase:
        def __enter__(self):
            return cursor

        def __exit__(self, *exc) -> None:
            return None

    return cursor, patch(
        "app.services.trips.Database", return_value=FakeDatabase()
    )


def _executed_sql(cursor: MagicMock) -> list[str]:
    return [c.args[0] for c in cursor.execute.call_args_list]


def test_soft_delete_active_trip_runs_select_then_update_then_cascade():
    """Active trip path: SELECT, UPDATE, then DELETE from commute_samples.

    The cascade lives in the same transaction as the soft-delete so a
    half-applied "trip looks deleted but its samples linger" state can
    never be observed by the heatmap query.
    """
    cursor, ctx = _patched_database()
    cursor.fetchone.return_value = (None,)  # deleted_at is currently NULL

    with ctx:
        soft_delete_trip(trip_id=42, user_id=99)

    sql = _executed_sql(cursor)
    assert any("SELECT deleted_at" in s for s in sql)
    assert any(
        "UPDATE trips" in s and "SET deleted_at" in s for s in sql
    )
    assert any(
        "DELETE FROM commute_samples" in s and "trip_id" in s for s in sql
    )


def test_soft_delete_already_deleted_trip_is_idempotent_noop():
    """Trip exists but `deleted_at` is set: silently succeed, no writes.

    Critically, we also do NOT re-issue the cascade DELETE — it ran the
    first time the trip was deleted, and a no-op DELETE on an empty set
    of samples is just a wasted round-trip.
    """
    cursor, ctx = _patched_database()
    cursor.fetchone.return_value = ("2026-04-30 09:50:00",)

    with ctx:
        soft_delete_trip(trip_id=42, user_id=99)

    sql = _executed_sql(cursor)
    assert any("SELECT deleted_at" in s for s in sql)
    assert not any("UPDATE trips" in s for s in sql)
    assert not any("DELETE FROM commute_samples" in s for s in sql)


def test_soft_delete_nonexistent_trip_raises():
    """No row at all for `(trip_id, user_id)` is the only 404 case."""
    cursor, ctx = _patched_database()
    cursor.fetchone.return_value = None

    with ctx:
        with pytest.raises(TripNotFoundError):
            soft_delete_trip(trip_id=42, user_id=99)

    sql = _executed_sql(cursor)
    assert any("SELECT deleted_at" in s for s in sql)
    assert not any("UPDATE trips" in s for s in sql)
    assert not any("DELETE FROM commute_samples" in s for s in sql)


# ---------------------------------------------------------------------------
# Week math + populated-flag helpers
# ---------------------------------------------------------------------------


def test_next_week_start_is_seven_days_after_current_week_start():
    # Thursday 2025-11-13 (current week starts Mon 2025-11-10 PT)
    # → next week starts Mon 2025-11-17.
    assert next_week_start(date(2025, 11, 13)) == date(2025, 11, 17)


def test_next_week_start_from_sunday_still_lands_on_upcoming_monday():
    # Sunday 2025-11-16 is still in the week that started Mon 2025-11-10,
    # so "next week" is Mon 2025-11-17 — same as from any other day in
    # that week.
    assert next_week_start(date(2025, 11, 16)) == date(2025, 11, 17)


def test_next_week_start_from_monday_returns_following_monday():
    # On a Monday itself, the *current* week starts today; "next week"
    # is exactly seven days from now.
    assert next_week_start(date(2025, 11, 10)) == date(2025, 11, 17)


def _is_week_fully_populated_with_status(total: int, ready: int) -> bool:
    """Helper: drive `is_week_fully_populated` with a stubbed status dict."""
    with patch(
        "app.services.trips.sample_status_for_trip",
        return_value={"total": total, "ready": ready},
    ):
        return is_week_fully_populated(trip_id=1, week_start=date(2025, 11, 10))


def test_is_week_fully_populated_true_when_total_equals_ready():
    assert _is_week_fully_populated_with_status(total=840, ready=840) is True


def test_is_week_fully_populated_false_when_partial():
    assert _is_week_fully_populated_with_status(total=840, ready=839) is False


def test_is_week_fully_populated_false_when_no_rows_seeded():
    """`total == 0` means the week hasn't been touched yet — not "ready"."""
    assert _is_week_fully_populated_with_status(total=0, ready=0) is False


# ---------------------------------------------------------------------------
# Slug generation + slug-based lookup
#
# The slug is the *only* trip identifier the SPA / URL bar / API
# response ever sees. The integer PK never leaks. These tests pin down
# the contract that supports both.
# ---------------------------------------------------------------------------


def test_generate_slug_is_ten_lowercase_hex_chars():
    """Slug shape: 10 lowercase hex chars, like a git short SHA."""
    slug = _generate_slug()
    assert len(slug) == 10
    assert all(c in "0123456789abcdef" for c in slug)


def test_generate_slug_returns_random_values():
    """Two consecutive calls should differ with overwhelming probability."""
    samples = {_generate_slug() for _ in range(50)}
    # 50 samples × ~1.1e12 keyspace → no realistic chance of dup.
    assert len(samples) == 50


def test_create_trip_persists_a_slug_on_insert():
    """`create_trip` must INSERT with the slug and return a Trip with one."""
    cursor, ctx = _patched_database()
    # Cap-check counts come back zero, then INSERT, then SELECT-for-row.
    cursor.fetchone.side_effect = [
        (0,),  # count_trips_for_user
        (0,),  # count_trips_total
        # SELECT … FROM trips WHERE id = %s after insert.
        (1, "abcd012345", 99, "Commute", "A", "B", None),
    ]
    cursor.lastrowid = 1

    with ctx:
        trip = create_trip(
            user_id=99,
            name="Commute",
            origin_address="A",
            destination_address="B",
            per_user_cap=10,
            total_cap=10,
        )

    assert trip.slug == "abcd012345"
    sql = _executed_sql(cursor)
    assert any(
        "INSERT INTO trips" in s and "slug" in s for s in sql
    ), f"slug must be set at insert time. SQL: {sql}"


def test_get_trip_for_user_by_slug_filters_by_user_and_active():
    """The slug lookup MUST also pin user_id and `deleted_at IS NULL`.

    Otherwise one user's slug guess could surface another user's trip,
    or a soft-deleted trip could resurface in the SPA.
    """
    cursor, ctx = _patched_database()
    cursor.fetchone.return_value = (
        7, "abcd012345", 99, "Commute", "A", "B", None,
    )

    with ctx:
        trip = get_trip_for_user_by_slug(slug="abcd012345", user_id=99)

    assert trip.id == 7
    assert trip.slug == "abcd012345"
    sql = _executed_sql(cursor)[0]
    assert "WHERE slug = %s" in sql
    assert "AND user_id = %s" in sql
    assert "deleted_at IS NULL" in sql


def test_get_trip_for_user_by_slug_raises_on_unknown_slug():
    cursor, ctx = _patched_database()
    cursor.fetchone.return_value = None

    with ctx:
        with pytest.raises(TripNotFoundError):
            get_trip_for_user_by_slug(slug="deadbeef99", user_id=99)
