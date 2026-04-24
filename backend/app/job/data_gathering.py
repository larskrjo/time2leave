#!/usr/bin/env python3
"""
Weekly commute-data gathering job.

Generates next week's weekday slots (15-min intervals, morning H2W + evening
W2H), calls a `CommuteProvider` for each, and upserts the results into
`commute_slots`. The provider defaults to the configured `DATA_PROVIDER`
(Google or fixture) but can be injected for tests.
"""

from __future__ import annotations

import logging
import time
from datetime import datetime, timedelta
from datetime import time as dtime
from zoneinfo import ZoneInfo

from mysql.connector import Error

from app.db.db import Database, get_pool
from app.job.providers import CommuteProvider, get_provider

logger = logging.getLogger(__name__)

TZ = ZoneInfo("America/Los_Angeles")

HOME = "4585 Thousand Oaks Dr, San Jose, CA 95136"
WORK = "650 California St, San Francisco, CA 94108"

INTERVAL_MINUTES = 15


def get_next_week_weekdays() -> list[datetime]:
    now = datetime.now(TZ)
    days_ahead = (7 - now.weekday()) % 7
    if days_ahead == 0:
        days_ahead = 7
    next_monday = (now + timedelta(days=days_ahead)).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    return [next_monday + timedelta(days=i) for i in range(5)]


def generate_times(
    day_dt: datetime,
    start: dtime,
    end: dtime,
    interval_minutes: int = INTERVAL_MINUTES,
):
    cursor = day_dt.replace(
        hour=start.hour, minute=start.minute, second=0, microsecond=0
    )
    end_dt = day_dt.replace(hour=end.hour, minute=end.minute, second=0, microsecond=0)
    while cursor < end_dt:
        yield cursor
        cursor += timedelta(minutes=interval_minutes)


def generate_schedule_db(weekdays: list[datetime] | None = None) -> None:
    """Insert empty slots for the upcoming workweek (idempotent)."""
    weekdays = weekdays or get_next_week_weekdays()
    morning_start, morning_end = dtime(5, 0), dtime(13, 0)
    evening_start, evening_end = dtime(12, 0), dtime(20, 0)

    insert_query = """
    INSERT INTO commute_slots
        (date_local, local_departure_time, departure_time_rfc3339, direction,
         distance_meters, duration, `condition`, status_code, status_message)
    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
    ON DUPLICATE KEY UPDATE
        updated_at = CURRENT_TIMESTAMP
    """

    inserted_count = 0
    updated_count = 0

    with Database() as cursor:
        for day in weekdays:
            for direction, start, end in (
                ("H2W", morning_start, morning_end),
                ("W2H", evening_start, evening_end),
            ):
                for ts in generate_times(day, start, end, INTERVAL_MINUTES):
                    values = (
                        ts.date().isoformat(),
                        ts.strftime("%Y-%m-%d %H:%M:%S %Z"),
                        ts.isoformat(),
                        direction,
                        None,
                        None,
                        None,
                        None,
                        None,
                    )
                    try:
                        cursor.execute(insert_query, values)
                        if cursor.rowcount == 1:
                            inserted_count += 1
                        else:
                            updated_count += 1
                    except Error as e:
                        logger.warning("Error inserting slot %s: %s", ts.isoformat(), e)

    logger.info(
        "✅ Schedule generated: %s new slots, %s existing slots updated",
        inserted_count,
        updated_count,
    )


def update_db_with_results(
    provider: CommuteProvider | None = None,
    throttle_every: int = 50,
    throttle_seconds: float = 0.5,
) -> None:
    """Fill in duration/distance/status for slots that still have no status."""
    provider = provider or get_provider()

    select_query = """
    SELECT id, departure_time_rfc3339, direction
    FROM commute_slots
    WHERE status_code IS NULL OR status_code = ''
    ORDER BY departure_time_rfc3339
    """

    pool = get_pool()
    connection = pool.get_connection()
    try:
        cursor = connection.cursor(dictionary=True)
        cursor.execute(select_query)
        rows = cursor.fetchall()
        cursor.close()
    finally:
        connection.close()

    if not rows:
        logger.info("✅ No slots need updating")
        return

    update_query = """
    UPDATE commute_slots
    SET distance_meters = %s,
        duration = %s,
        `condition` = %s,
        status_code = %s,
        status_message = %s,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = %s
    """

    updated_count = 0
    error_count = 0

    with Database() as cursor:
        for idx, row in enumerate(rows):
            direction = row["direction"]
            origin = HOME if direction == "H2W" else WORK
            dest = WORK if direction == "H2W" else HOME
            result = provider.fetch(origin, dest, row["departure_time_rfc3339"])

            values = (
                result.distance_meters,
                result.duration,
                result.condition,
                result.status_code,
                result.status_message,
                row["id"],
            )

            try:
                cursor.execute(update_query, values)
                updated_count += 1
            except Error as e:
                logger.warning("Error updating slot %s: %s", row["id"], e)
                error_count += 1

            if throttle_every and (idx + 1) % throttle_every == 0:
                time.sleep(throttle_seconds)

    logger.info(
        "✅ Database updated: %s slots updated, %s errors",
        updated_count,
        error_count,
    )


def main(provider: CommuteProvider | None = None) -> None:
    """Generate next week's slots and fill them in."""
    generate_schedule_db()
    update_db_with_results(provider=provider)
    logger.info("🎉 Commute sampling completed successfully.")


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    main()
