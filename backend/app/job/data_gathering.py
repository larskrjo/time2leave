"""Weekly multi-trip commute-data gathering job.

This module is rewritten in the next commit. It currently ships as a
stub so the routing/API refactor can land independently while keeping
the app bootable.
"""

from __future__ import annotations

import logging

from app.job.providers import CommuteProvider

logger = logging.getLogger(__name__)


def main(provider: CommuteProvider | None = None) -> None:
    """Placeholder. Real implementation rewritten in the next commit.

    Keeping this as a no-op lets the scheduler and admin endpoints remain
    wired up without touching the freshly dropped `commute_slots` table.
    """
    del provider
    logger.warning(
        "data_gathering.main() called but the multi-trip implementation "
        "has not shipped yet; skipping."
    )


def backfill_trip_current_week(
    trip_id: int, provider: CommuteProvider | None = None
) -> None:
    """Placeholder. Real implementation rewritten in the next commit."""
    del provider
    logger.warning(
        "backfill_trip_current_week(%s) called but the multi-trip "
        "implementation has not shipped yet; skipping.",
        trip_id,
    )


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    main()
