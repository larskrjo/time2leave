"""Unit tests for `app.services.trips.soft_delete_trip`.

The interesting contract here is HTTP DELETE-style idempotency:
deleting an already-soft-deleted trip should silently succeed instead
of raising, while deleting a trip that never existed for the user
should still raise. This matters because the trips list page commits
its undo-window deletion via two paths (the snackbar autoHide and a
component-unmount cleanup) and any race between them used to surface
a misleading "Trip not found" banner.
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from app.services.trips import TripNotFoundError, soft_delete_trip


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


def test_soft_delete_active_trip_runs_select_then_update():
    """Trip exists and isn't yet deleted: we look it up, then UPDATE."""
    cursor, ctx = _patched_database()
    cursor.fetchone.return_value = (None,)  # deleted_at is currently NULL

    with ctx:
        soft_delete_trip(trip_id=42, user_id=99)

    sql = _executed_sql(cursor)
    assert any("SELECT deleted_at" in s for s in sql)
    assert any(
        "UPDATE trips" in s and "SET deleted_at" in s for s in sql
    )


def test_soft_delete_already_deleted_trip_is_idempotent_noop():
    """Trip exists but `deleted_at` is set: silently succeed, no UPDATE."""
    cursor, ctx = _patched_database()
    cursor.fetchone.return_value = ("2026-04-30 09:50:00",)

    with ctx:
        soft_delete_trip(trip_id=42, user_id=99)

    sql = _executed_sql(cursor)
    assert any("SELECT deleted_at" in s for s in sql)
    # The original deleted_at is preserved — no second write.
    assert not any("UPDATE trips" in s for s in sql)


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
