"""Per-user weekly mutation cap for cost-incurring trip operations.

Every trip create + every patch that changes addresses kicks off a
Routes Matrix backfill (~840 API calls / trip / week). To keep the
Google Maps bill bounded we record those operations in
`trip_mutation_log` and refuse new ones once the per-user 7-day count
hits the configured cap.

Operations that DO NOT trigger billing (name-only patches, deletes)
are not logged here and don't count.

Counting model: rolling 7-day window (NOW() - 7 days). This is more
forgiving and harder to game than ISO weeks (which would let a user
do 3 mutations on Sunday and another 3 on Monday).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Literal

from app.config import Settings
from app.db.db import Database

logger = logging.getLogger(__name__)

# Sliding window length. Pinned to 7 days here (instead of being a
# Setting too) because the *rate* is what's tunable (per-user cap),
# not the *period*. Easy to lift to config later if you want monthly.
MUTATION_WINDOW = timedelta(days=7)

MutationKind = Literal["create", "address_change", "swap"]


class TripMutationQuotaExceededError(Exception):
    """Raised when a user has hit their rolling-7-day mutation cap."""

    def __init__(self, *, used: int, limit: int, retry_after_seconds: int):
        self.used = used
        self.limit = limit
        self.retry_after_seconds = retry_after_seconds
        super().__init__(
            f"Trip mutation quota exceeded: {used}/{limit} in the last "
            f"7 days. Try again in ~{max(1, retry_after_seconds // 3600)}h."
        )


@dataclass(frozen=True)
class MutationQuota:
    used: int
    limit: int
    # Seconds until the *oldest* mutation in the window ages out, i.e.
    # how long until `used` decreases by 1. None when the user is at
    # zero usage.
    oldest_age_seconds: int | None


def _window_start(now: datetime | None = None) -> datetime:
    return (now or datetime.now(UTC)) - MUTATION_WINDOW


def count_recent_mutations(user_id: int, now: datetime | None = None) -> int:
    """Return how many billed mutations the user has logged in the window."""
    with Database() as cursor:
        cursor.execute(
            """
            SELECT COUNT(*) FROM trip_mutation_log
            WHERE user_id = %s AND created_at >= %s
            """,
            (user_id, _window_start(now)),
        )
        row = cursor.fetchone()
        return int(row[0]) if row else 0


def quota_for_user(
    user_id: int, settings: Settings, now: datetime | None = None
) -> MutationQuota:
    """Snapshot of the user's weekly mutation budget.

    The `oldest_age_seconds` value lets the SPA tell the user "your next
    edit slot opens in 3 days" instead of just "limit reached".
    """
    now = now or datetime.now(UTC)
    window_start = now - MUTATION_WINDOW
    with Database() as cursor:
        cursor.execute(
            """
            SELECT COUNT(*), MIN(created_at) FROM trip_mutation_log
            WHERE user_id = %s AND created_at >= %s
            """,
            (user_id, window_start),
        )
        row = cursor.fetchone()
        used = int(row[0]) if row else 0
        oldest = row[1] if row else None

    if oldest is None:
        oldest_age = None
    else:
        # Some MySQL drivers return naive datetimes for TIMESTAMPs;
        # treat them as UTC since that's what the column stores.
        if oldest.tzinfo is None:
            oldest = oldest.replace(tzinfo=UTC)
        oldest_age = int((now - oldest).total_seconds())

    return MutationQuota(
        used=used, limit=settings.max_trip_mutations_per_week, oldest_age_seconds=oldest_age
    )


def assert_within_quota(
    user_id: int, settings: Settings, now: datetime | None = None
) -> None:
    """Raise `TripMutationQuotaExceededError` if the user is at the cap.

    Call this BEFORE doing anything that costs money (Geocoding pre-flight,
    Routes Matrix backfill). The trip-row CRUD itself is cheap, but we
    still gate it here so the user's "trip slots" count and the
    "weekly mutation count" stay in sync.
    """
    now = now or datetime.now(UTC)
    q = quota_for_user(user_id, settings, now=now)
    if q.used < q.limit:
        return

    # Compute the time until the oldest in-window mutation falls out.
    # If the oldest is `oldest_age_seconds` old, it'll exit the window
    # in (MUTATION_WINDOW - oldest_age) seconds.
    if q.oldest_age_seconds is None:
        retry_after = int(MUTATION_WINDOW.total_seconds())
    else:
        retry_after = max(
            1,
            int(MUTATION_WINDOW.total_seconds()) - q.oldest_age_seconds,
        )

    raise TripMutationQuotaExceededError(
        used=q.used, limit=q.limit, retry_after_seconds=retry_after
    )


def record_mutation(
    *, user_id: int, trip_id: int, kind: MutationKind
) -> None:
    """Append a row to `trip_mutation_log`.

    Called after a billed operation has been committed (trip created /
    addresses persisted). Wrapped in try-except in the API layer so a
    DB hiccup here doesn't 500 a successful trip mutation — better to
    serve a stale quota than fail the user-visible action.
    """
    with Database() as cursor:
        cursor.execute(
            """
            INSERT INTO trip_mutation_log (user_id, trip_id, kind)
            VALUES (%s, %s, %s)
            """,
            (user_id, trip_id, kind),
        )
