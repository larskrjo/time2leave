"""Trip repository + heatmap projection.

Trips belong to a user and carry two addresses. Samples live in the
`commute_samples` table and are keyed by `(trip_id, direction,
departure_time_rfc3339)`. This module owns the SQL so route handlers
stay focused on HTTP-level concerns.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Literal
from zoneinfo import ZoneInfo

from app.db.db import Database

TZ = ZoneInfo("America/Los_Angeles")

Direction = Literal["outbound", "return"]
WEEKDAY_ORDER = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
WEEKDAY_NUM_TO_LABEL = dict(enumerate(WEEKDAY_ORDER))


@dataclass(frozen=True)
class Trip:
    id: int
    user_id: int
    name: str | None
    origin_address: str
    destination_address: str
    created_at: datetime | None


class TripNotFoundError(Exception):
    """Raised when a trip lookup targets a non-existent or soft-deleted row."""


class TripQuotaExceededError(Exception):
    """Raised when creating a trip would breach per-user or global caps."""


def current_week_start(today: date | None = None) -> date:
    """Return the Monday on/before `today` (Pacific)."""
    today = today or datetime.now(TZ).date()
    return today - timedelta(days=today.weekday())


def list_trips_for_user(user_id: int) -> list[Trip]:
    """All of a user's active (non-deleted) trips, newest first."""
    with Database() as cursor:
        cursor.execute(
            """
            SELECT id, user_id, name, origin_address, destination_address, created_at
            FROM trips
            WHERE user_id = %s AND deleted_at IS NULL
            ORDER BY created_at DESC, id DESC
            """,
            (user_id,),
        )
        rows = cursor.fetchall()
    return [_row_to_trip(r) for r in rows]


def count_trips_for_user(user_id: int) -> int:
    """Count non-deleted trips a user currently owns."""
    with Database() as cursor:
        cursor.execute(
            "SELECT COUNT(*) FROM trips WHERE user_id = %s AND deleted_at IS NULL",
            (user_id,),
        )
        row = cursor.fetchone()
    return int(row[0]) if row else 0


def count_trips_total() -> int:
    """Global, system-wide count of non-deleted trips."""
    with Database() as cursor:
        cursor.execute("SELECT COUNT(*) FROM trips WHERE deleted_at IS NULL")
        row = cursor.fetchone()
    return int(row[0]) if row else 0


def get_trip_for_user(*, trip_id: int, user_id: int) -> Trip:
    """Fetch a trip belonging to `user_id`; 404-style error otherwise."""
    with Database() as cursor:
        cursor.execute(
            """
            SELECT id, user_id, name, origin_address, destination_address, created_at
            FROM trips
            WHERE id = %s AND user_id = %s AND deleted_at IS NULL
            """,
            (trip_id, user_id),
        )
        row = cursor.fetchone()
    if row is None:
        raise TripNotFoundError(f"Trip {trip_id} not found for user {user_id}")
    return _row_to_trip(row)


def create_trip(
    *,
    user_id: int,
    name: str | None,
    origin_address: str,
    destination_address: str,
    per_user_cap: int,
    total_cap: int,
) -> Trip:
    """Insert a new trip after checking caps. Raises `TripQuotaExceededError`."""
    if count_trips_for_user(user_id) >= per_user_cap:
        raise TripQuotaExceededError(
            f"Per-user trip cap of {per_user_cap} reached"
        )
    if count_trips_total() >= total_cap:
        raise TripQuotaExceededError(
            f"Global trip cap of {total_cap} reached"
        )

    with Database() as cursor:
        cursor.execute(
            """
            INSERT INTO trips
                (user_id, name, origin_address, destination_address)
            VALUES (%s, %s, %s, %s)
            """,
            (user_id, name, origin_address, destination_address),
        )
        new_id = cursor.lastrowid
        cursor.execute(
            """
            SELECT id, user_id, name, origin_address, destination_address, created_at
            FROM trips WHERE id = %s
            """,
            (new_id,),
        )
        row = cursor.fetchone()
    assert row is not None
    return _row_to_trip(row)


def soft_delete_trip(*, trip_id: int, user_id: int) -> None:
    """Mark a trip deleted; samples cascade on hard delete later."""
    with Database() as cursor:
        cursor.execute(
            """
            UPDATE trips
            SET deleted_at = CURRENT_TIMESTAMP
            WHERE id = %s AND user_id = %s AND deleted_at IS NULL
            """,
            (trip_id, user_id),
        )
        if int(cursor.rowcount or 0) == 0:
            raise TripNotFoundError(
                f"Trip {trip_id} not found for user {user_id}"
            )


def list_active_trips() -> list[Trip]:
    """Every non-deleted trip in the system (used by the weekly job)."""
    with Database() as cursor:
        cursor.execute(
            """
            SELECT id, user_id, name, origin_address, destination_address, created_at
            FROM trips
            WHERE deleted_at IS NULL
            ORDER BY id
            """
        )
        rows = cursor.fetchall()
    return [_row_to_trip(r) for r in rows]


def sample_status_for_trip(trip_id: int, week_start: date) -> dict:
    """Count how many samples have filled-in durations for the given week.

    Used by the frontend to show a "backfill in progress" spinner.
    """
    with Database() as cursor:
        cursor.execute(
            """
            SELECT
                COUNT(*) AS total,
                SUM(CASE WHEN duration_seconds IS NOT NULL THEN 1 ELSE 0 END) AS ready
            FROM commute_samples
            WHERE trip_id = %s AND week_start_date = %s
            """,
            (trip_id, week_start.isoformat()),
        )
        row = cursor.fetchone()
    total = int(row[0] or 0) if row else 0
    ready = int(row[1] or 0) if row else 0
    return {"total": total, "ready": ready}


def get_heatmap_for_trip(trip_id: int, week_start: date) -> dict:
    """Return the nested dict the frontend renders for one trip+week.

    Shape:
        {
          "outbound": { "Mon": { "06:00": 43.2, ... }, ... },
          "return":   { ... },
          "week_start_date": "2025-11-10",
          "window": {"start": "06:00", "end": "21:00", "interval_minutes": 15},
        }
    """
    with Database() as cursor:
        cursor.execute(
            """
            SELECT direction, weekday, hhmm, duration_seconds
            FROM commute_samples
            WHERE trip_id = %s AND week_start_date = %s
            """,
            (trip_id, week_start.isoformat()),
        )
        rows = cursor.fetchall()

    payload: dict[str, dict[str, dict[str, float | None]]] = {
        "outbound": {},
        "return": {},
    }

    for direction, weekday_num, hhmm, duration_seconds in rows:
        weekday = WEEKDAY_NUM_TO_LABEL.get(int(weekday_num))
        if weekday is None:
            continue
        bucket = payload.setdefault(str(direction), {}).setdefault(weekday, {})
        bucket[hhmm] = (
            round(duration_seconds / 60.0, 1)
            if duration_seconds is not None
            else None
        )

    return {
        **payload,
        "week_start_date": week_start.isoformat(),
        "weekdays": WEEKDAY_ORDER,
    }


def _row_to_trip(row: tuple) -> Trip:
    return Trip(
        id=int(row[0]),
        user_id=int(row[1]),
        name=row[2],
        origin_address=row[3],
        destination_address=row[4],
        created_at=row[5],
    )
