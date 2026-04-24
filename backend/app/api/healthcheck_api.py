"""Healthcheck and scheduler status endpoints."""

from datetime import UTC, datetime
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Response

import app.db.db as db

pacific_tz = ZoneInfo("America/Los_Angeles")

healthcheck_router = APIRouter(prefix="/healthcheck", tags=["Healthcheck"])


@healthcheck_router.get("")
async def healthcheck(response: Response):
    """Liveness probe. Returns 200 iff MySQL responds to SELECT 1."""
    try:
        with db.Database() as cur:
            cur.execute("SELECT 1;")
            row = cur.fetchone()
            if row is not None:
                response.status_code = 200
                return {"status": "healthy"}
    except Exception as e:
        response.status_code = 500
        return {"status": "unhealthy", "error": str(e)}

    response.status_code = 500
    return {"status": "unhealthy"}


@healthcheck_router.get("/scheduler")
async def scheduler_status():
    """Report scheduler state and scheduled jobs."""
    from app.main import scheduler

    jobs = []
    if scheduler.running:
        for job in scheduler.get_jobs():
            jobs.append(
                {
                    "id": job.id,
                    "name": job.name,
                    "next_run_time": (
                        job.next_run_time.isoformat() if job.next_run_time else None
                    ),
                    "trigger": str(job.trigger),
                }
            )

    return {
        "scheduler_running": scheduler.running,
        "timezone": str(scheduler.timezone),
        "current_time_utc": datetime.now(UTC).isoformat(),
        "current_time_pacific": datetime.now(pacific_tz).isoformat(),
        "jobs": jobs,
    }
