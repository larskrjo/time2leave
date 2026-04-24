"""Weekly multi-trip commute-data gathering.

What runs on the Friday 23:00 PT cron (`main()`):

    1. Enumerate every active trip.
    2. For each trip, in both directions, for each day Mon-Sun, generate
       slots at 15-minute intervals from 06:00-21:00 local time.
    3. Fail-closed abort if the total call count for the week would exceed
       `Settings.max_weekly_routes_calls`. Better to skip than accidentally
       burn through the Google Routes Matrix budget.
    4. Upsert empty samples first so the frontend immediately sees a
       "0 / N ready" status for the upcoming week.
    5. Fill them in by calling the configured `CommuteProvider`.

What runs when a user creates a trip (`backfill_trip_current_week`):

    Same as above but for exactly one trip and the *current* week, so
    the heatmap starts populating right away instead of waiting until
    Friday.
"""

from __future__ import annotations

import logging
import time
from datetime import date, datetime, timedelta
from typing import Literal

from mysql.connector import Error

from app.config import Settings, get_settings
from app.db.db import Database, get_pool
from app.job.providers import CommuteProvider, get_provider
from app.services.trips import TZ, Trip, list_active_trips

logger = logging.getLogger(__name__)

Direction = Literal["outbound", "return"]
DIRECTIONS: tuple[Direction, Direction] = ("outbound", "return")


def _monday_of_week(target: date) -> date:
    return target - timedelta(days=target.weekday())


def next_week_monday(today: date | None = None) -> date:
    today = today or datetime.now(TZ).date()
    return _monday_of_week(today) + timedelta(days=7)


def current_week_monday(today: date | None = None) -> date:
    today = today or datetime.now(TZ).date()
    return _monday_of_week(today)


def _slots_for_day(day: date, settings: Settings) -> list[datetime]:
    start = datetime.combine(
        day, datetime.min.time().replace(hour=settings.commute_window_start_hour), TZ
    )
    end = datetime.combine(
        day, datetime.min.time().replace(hour=settings.commute_window_end_hour), TZ
    )
    out: list[datetime] = []
    cursor = start
    step = timedelta(minutes=settings.commute_interval_minutes)
    while cursor < end:
        out.append(cursor)
        cursor += step
    return out


def slots_per_trip_per_week(settings: Settings) -> int:
    """How many API calls one trip needs for a full week (both directions)."""
    slots_per_day = (
        (settings.commute_window_end_hour - settings.commute_window_start_hour)
        * 60
        // settings.commute_interval_minutes
    )
    return slots_per_day * settings.commute_days_per_week * len(DIRECTIONS)


def _origin_destination(trip: Trip, direction: Direction) -> tuple[str, str]:
    if direction == "outbound":
        return trip.origin_address, trip.destination_address
    return trip.destination_address, trip.origin_address


def _upsert_empty_slots(
    *, trip_id: int, week_start: date, settings: Settings
) -> int:
    """Create blank samples for every (day × time × direction) in `week_start`.

    Idempotent via the `uniq_sample_slot` unique key.
    Returns the number of rows freshly inserted (vs bumped).
    """
    days = [week_start + timedelta(days=i) for i in range(settings.commute_days_per_week)]
    inserted = 0

    insert_query = """
    INSERT INTO commute_samples
        (trip_id, week_start_date, direction, date_local, weekday, hhmm,
         local_departure_time, departure_time_rfc3339)
    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
    ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP
    """

    with Database() as cursor:
        for day in days:
            for ts in _slots_for_day(day, settings):
                for direction in DIRECTIONS:
                    values = (
                        trip_id,
                        week_start.isoformat(),
                        direction,
                        ts.date().isoformat(),
                        ts.weekday(),
                        ts.strftime("%H:%M"),
                        ts.strftime("%Y-%m-%d %H:%M:%S %Z"),
                        ts.isoformat(),
                    )
                    try:
                        cursor.execute(insert_query, values)
                        if int(cursor.rowcount or 0) == 1:
                            inserted += 1
                    except Error as exc:
                        logger.warning(
                            "Slot insert failed trip=%s dir=%s ts=%s: %s",
                            trip_id,
                            direction,
                            ts.isoformat(),
                            exc,
                        )
    return inserted


def _fetch_pending_slots(trip_id: int, week_start: date) -> list[dict]:
    """Rows that still need a duration filled in, ordered for cache locality."""
    pool = get_pool()
    connection = pool.get_connection()
    try:
        cur = connection.cursor(dictionary=True)
        cur.execute(
            """
            SELECT id, trip_id, direction, departure_time_rfc3339
            FROM commute_samples
            WHERE trip_id = %s AND week_start_date = %s
              AND (status_code IS NULL OR status_code = '' OR duration_seconds IS NULL)
            ORDER BY direction, departure_time_rfc3339
            """,
            (trip_id, week_start.isoformat()),
        )
        rows = cur.fetchall()
        cur.close()
    finally:
        connection.close()
    return list(rows)


def _duration_string_to_seconds(value: str | None) -> int | None:
    """Parse Google's `"1234s"` duration string into integer seconds."""
    if not value:
        return None
    if isinstance(value, str) and value.endswith("s"):
        try:
            return int(value[:-1])
        except ValueError:
            return None
    return None


def _fill_in_slots_for_trip(
    *,
    trip: Trip,
    week_start: date,
    provider: CommuteProvider,
    settings: Settings,
) -> dict[str, int]:
    """Call the provider for every pending slot of this trip + week."""
    pending = _fetch_pending_slots(trip.id, week_start)
    if not pending:
        return {"updated": 0, "errors": 0}

    update_query = """
    UPDATE commute_samples
    SET distance_meters = %s,
        duration_seconds = %s,
        `condition` = %s,
        status_code = %s,
        status_message = %s,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = %s
    """

    updated = 0
    errors = 0

    with Database() as cursor:
        for idx, row in enumerate(pending):
            direction: Direction = row["direction"]
            origin, destination = _origin_destination(trip, direction)
            try:
                result = provider.fetch(
                    origin, destination, row["departure_time_rfc3339"], direction
                )
            except Exception:
                logger.exception(
                    "Provider raised for trip=%s slot=%s", trip.id, row["id"]
                )
                errors += 1
                continue

            seconds = _duration_string_to_seconds(result.duration)

            values = (
                result.distance_meters,
                seconds,
                result.condition,
                result.status_code,
                result.status_message,
                row["id"],
            )
            try:
                cursor.execute(update_query, values)
                updated += 1
            except Error as exc:
                logger.warning("Update failed slot=%s: %s", row["id"], exc)
                errors += 1

            if (
                settings.commute_throttle_every
                and (idx + 1) % settings.commute_throttle_every == 0
            ):
                time.sleep(settings.commute_throttle_seconds)

    return {"updated": updated, "errors": errors}


def _plan_and_run(
    *,
    trips: list[Trip],
    week_start: date,
    provider: CommuteProvider,
    settings: Settings,
    enforce_ceiling: bool,
) -> None:
    if not trips:
        logger.info("No active trips; nothing to do for week %s", week_start)
        return

    per_trip = slots_per_trip_per_week(settings)
    budget = per_trip * len(trips)
    logger.info(
        "Week %s: %s active trip(s), %s calls planned (cap=%s)",
        week_start,
        len(trips),
        budget,
        settings.max_weekly_routes_calls,
    )
    if enforce_ceiling and budget > settings.max_weekly_routes_calls:
        logger.error(
            "Skipping week %s: planned %s calls exceeds MAX_WEEKLY_ROUTES_CALLS=%s",
            week_start,
            budget,
            settings.max_weekly_routes_calls,
        )
        return

    total_updated = 0
    total_errors = 0

    for trip in trips:
        inserted = _upsert_empty_slots(
            trip_id=trip.id, week_start=week_start, settings=settings
        )
        logger.info(
            "Trip %s (%s): %s empty slots seeded for week %s",
            trip.id,
            trip.name or "(unnamed)",
            inserted,
            week_start,
        )
        stats = _fill_in_slots_for_trip(
            trip=trip, week_start=week_start, provider=provider, settings=settings
        )
        total_updated += stats["updated"]
        total_errors += stats["errors"]
        logger.info(
            "Trip %s: %s slots filled, %s errors", trip.id, stats["updated"], stats["errors"]
        )

    logger.info(
        "Week %s complete: %s slots filled, %s errors across %s trips",
        week_start,
        total_updated,
        total_errors,
        len(trips),
    )


def main(
    provider: CommuteProvider | None = None,
    settings: Settings | None = None,
) -> None:
    """Friday-cron entry point. Refreshes next week's data for every trip."""
    settings = settings or get_settings()
    provider = provider or get_provider(settings)
    trips = list_active_trips()
    _plan_and_run(
        trips=trips,
        week_start=next_week_monday(),
        provider=provider,
        settings=settings,
        enforce_ceiling=True,
    )


def backfill_trip_current_week(
    trip_id: int,
    provider: CommuteProvider | None = None,
    settings: Settings | None = None,
) -> None:
    """Fill this week's heatmap for one trip right now (called from API).

    We intentionally skip the global ceiling here because it's a single
    trip's worth of calls (~840), which is never going to be the problem
    — the Friday fleet-wide run is.
    """
    settings = settings or get_settings()
    provider = provider or get_provider(settings)
    from app.services.trips import (
        list_trips_for_user,  # noqa: F401 (avoid import cycle)
    )

    with Database() as cursor:
        cursor.execute(
            """
            SELECT id, user_id, name, origin_address, destination_address, created_at
            FROM trips
            WHERE id = %s AND deleted_at IS NULL
            """,
            (trip_id,),
        )
        row = cursor.fetchone()

    if row is None:
        logger.warning("backfill_trip_current_week: trip %s not found", trip_id)
        return

    from app.services.trips import Trip as TripModel

    trip = TripModel(
        id=int(row[0]),
        user_id=int(row[1]),
        name=row[2],
        origin_address=row[3],
        destination_address=row[4],
        created_at=row[5],
    )

    _plan_and_run(
        trips=[trip],
        week_start=current_week_monday(),
        provider=provider,
        settings=settings,
        enforce_ceiling=False,
    )


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    main()
