"""
FastAPI application entrypoint.

Serves the commute heatmap API and schedules the weekly data-gathering job.
"""

import logging
import warnings
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from zoneinfo import ZoneInfo

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.admin_api import admin_router
from app.api.healthcheck_api import healthcheck_router
from app.api.traffic_api import traffic_router
from app.config import get_settings
from app.job.data_gathering import main as data_gathering_main

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# Suppress pandas warning about mysql-connector compatibility.
warnings.filterwarnings(
    "ignore",
    message=".*SQLAlchemy connectable.*",
    category=UserWarning,
    module="pandas",
)

pacific_tz = ZoneInfo("America/Los_Angeles")
scheduler = AsyncIOScheduler(timezone=pacific_tz)


def run_data_gathering() -> None:
    """Wrapper invoked by the scheduler; logs duration + errors."""
    logger.info("🔄 Starting data gathering job...")
    start_time = datetime.now(UTC)
    try:
        data_gathering_main()
        duration = (datetime.now(UTC) - start_time).total_seconds()
        logger.info(
            f"✅ Data gathering job completed successfully in {duration:.2f} seconds"
        )
    except Exception as e:
        duration = (datetime.now(UTC) - start_time).total_seconds()
        logger.error(
            f"❌ Error running data gathering job after {duration:.2f} seconds: {e}",
            exc_info=True,
        )


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage scheduler lifecycle."""
    settings = get_settings()

    if settings.app_env == "prod":
        job = scheduler.add_job(
            run_data_gathering,
            trigger=CronTrigger(
                day_of_week="fri", hour=23, minute=0, timezone=pacific_tz
            ),
            id="weekly_commute_data_gathering",
            replace_existing=True,
        )
        scheduler.start()
        next_run = job.next_run_time
        logger.info(
            "✅ Scheduler started (prod): Fridays 23:00 PT (next run: %s)",
            next_run.isoformat() if next_run else "N/A",
        )
    else:
        logger.info(
            "Scheduler disabled in %s mode. Trigger runs manually via "
            "POST /api/v1/admin/run-data-gathering.",
            settings.app_env,
        )

    try:
        yield
    finally:
        if scheduler.running:
            scheduler.shutdown()
            logger.info("✅ Scheduler stopped")


def create_app() -> FastAPI:
    """Application factory. Exposed for tests and WSGI servers."""
    settings = get_settings()
    app = FastAPI(title="Traffic Commute API", version="1.0.0", lifespan=lifespan)

    app.include_router(healthcheck_router)
    app.include_router(traffic_router)
    if settings.enable_admin_api and settings.app_env != "prod":
        app.include_router(admin_router)

    origins = (
        ["https://traffic.larsjohansen.com"]
        if settings.app_env == "prod"
        else settings.allowed_origins
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.exception_handler(Exception)
    async def _unhandled_exception_handler(
        request: Request, exc: Exception
    ) -> JSONResponse:
        # Keeps 500s flowing through the CORS middleware so the browser sees a
        # real 500 with JSON body instead of reporting a misleading CORS error.
        logger.exception("Unhandled exception on %s %s", request.method, request.url)
        return JSONResponse(
            status_code=500,
            content={"detail": "Internal server error", "error": str(exc)},
        )

    return app


app = create_app()
