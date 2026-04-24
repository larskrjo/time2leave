"""
Admin endpoints. Mounted only when APP_ENV != "prod" (see main.create_app).

These exist so that during local development you can trigger the weekly
data-gathering job on demand instead of waiting for the cron.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, BackgroundTasks

from app.job.data_gathering import main as data_gathering_main
from app.job.providers import get_provider

logger = logging.getLogger(__name__)

admin_router = APIRouter(prefix="/api/v1/admin", tags=["Admin"])


def _run_job() -> None:
    logger.info("Admin-triggered data gathering started")
    data_gathering_main(provider=get_provider())
    logger.info("Admin-triggered data gathering completed")


@admin_router.post("/run-data-gathering")
async def trigger_data_gathering(background_tasks: BackgroundTasks):
    """Kick off the data-gathering job in the background.

    Returns immediately; tail the server logs to watch progress.
    """
    background_tasks.add_task(_run_job)
    return {"status": "started"}
