"""
FastAPI application entrypoint.

Serves the multi-user trips + heatmap API and schedules the weekly
data-gathering job.
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
from app.api.auth_api import auth_router
from app.api.healthcheck_api import healthcheck_router
from app.api.trips_api import trips_router
from app.config import get_settings
from app.db.schema_bootstrap import ensure_schema
from app.job.data_gathering import main as data_gathering_main
from app.services.allowlist import bootstrap_from_settings

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

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
    logger.info("Starting data gathering job...")
    start_time = datetime.now(UTC)
    try:
        data_gathering_main()
        duration = (datetime.now(UTC) - start_time).total_seconds()
        logger.info(
            "Data gathering job completed successfully in %.2f seconds",
            duration,
        )
    except Exception:
        duration = (datetime.now(UTC) - start_time).total_seconds()
        logger.exception(
            "Error running data gathering job after %.2f seconds", duration
        )


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Ensure schema, bootstrap allowlist, then manage scheduler lifecycle."""
    settings = get_settings()

    # Idempotently create the database + tables before anything else touches
    # the connection pool. Lets us cut prod over to a brand-new DB name
    # without a manual DBA step: the app creates the new DB on first boot.
    try:
        ensure_schema(settings)
    except Exception:
        logger.exception(
            "Schema bootstrap failed; the app will likely fail to serve "
            "requests. Check MySQL reachability and the app user's "
            "CREATE/DDL grants."
        )
        raise

    try:
        bootstrap_from_settings(settings)
    except Exception:
        logger.exception("Allowlist bootstrap raised at startup; continuing")

    if settings.app_env == "prod":
        # Mondays at 01:00 PT, just after the Pacific week rollover.
        # Pairs with the dual-week backfill on trip create/edit so users
        # see both the current and next week populated almost
        # continuously (the only blind window is the ~1h gap between
        # Pacific Monday 00:00 rollover and this cron firing at 01:00).
        job = scheduler.add_job(
            run_data_gathering,
            trigger=CronTrigger(
                day_of_week="mon", hour=1, minute=0, timezone=pacific_tz
            ),
            id="weekly_commute_data_gathering",
            replace_existing=True,
        )
        scheduler.start()
        next_run = job.next_run_time
        logger.info(
            "Scheduler started (prod): Mondays 01:00 PT (next run: %s)",
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
            logger.info("Scheduler stopped")


def create_app() -> FastAPI:
    """Application factory. Exposed for tests and WSGI servers."""
    settings = get_settings()
    app = FastAPI(
        title="time2leave API", version="2.0.0", lifespan=lifespan
    )

    app.include_router(healthcheck_router)
    app.include_router(auth_router)
    app.include_router(trips_router)
    if settings.enable_admin_api:
        app.include_router(admin_router)

    if settings.app_env == "prod":
        origins: list[str] = [
            "https://time2leave.com",
            "https://www.time2leave.com",
        ]
        origin_regex: str | None = None
    else:
        origins = settings.allowed_origins
        # Vite auto-bumps to :5174, :5175, … when a port is already in use
        # on dev machines. Allow any localhost/127.0.0.1 port in non-prod
        # so the dev server Just Works regardless of which port it grabs.
        origin_regex = r"^http://(localhost|127\.0\.0\.1)(:\d+)?$"
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_origin_regex=origin_regex,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    def _origin_allowed(origin: str) -> bool:
        if origin in origins:
            return True
        if origin_regex is not None:
            import re

            return re.match(origin_regex, origin) is not None
        return False

    @app.exception_handler(Exception)
    async def _unhandled_exception_handler(
        request: Request, exc: Exception
    ) -> JSONResponse:
        logger.exception("Unhandled exception on %s %s", request.method, request.url)
        # CORSMiddleware doesn't run on responses produced by exception
        # handlers, so a raw 500 shows up in the browser as a confusing
        # "blocked by CORS policy" instead of the actual error. Echo the
        # headers manually when the request origin would have been allowed.
        headers: dict[str, str] = {}
        origin = request.headers.get("origin")
        if origin and _origin_allowed(origin):
            headers["access-control-allow-origin"] = origin
            headers["access-control-allow-credentials"] = "true"
            headers["vary"] = "Origin"
        return JSONResponse(
            status_code=500,
            content={"detail": "Internal server error", "error": str(exc)},
            headers=headers,
        )

    return app


app = create_app()
