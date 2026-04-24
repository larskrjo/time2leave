"""Per-user trip CRUD + heatmap endpoint.

A logged-in user can list, create, read, and delete their own trips and
fetch the heatmap for the current week. Creating a trip schedules a
one-off background backfill so the heatmap starts populating immediately
instead of waiting for the next Friday cron.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.auth.dependencies import get_current_user
from app.config import Settings, get_settings
from app.services.trips import (
    Trip,
    TripNotFoundError,
    TripQuotaExceededError,
    create_trip,
    current_week_start,
    get_heatmap_for_trip,
    get_trip_for_user,
    list_trips_for_user,
    sample_status_for_trip,
    soft_delete_trip,
)
from app.services.users import User

logger = logging.getLogger(__name__)

trips_router = APIRouter(prefix="/api/v1/trips", tags=["Trips"])


class TripOut(BaseModel):
    id: int
    name: str | None
    origin_address: str
    destination_address: str
    created_at: str | None


class TripCreate(BaseModel):
    name: str | None = Field(default=None, max_length=255)
    origin_address: str = Field(..., min_length=3, max_length=1024)
    destination_address: str = Field(..., min_length=3, max_length=1024)


class BackfillStatus(BaseModel):
    total: int
    ready: int
    percent_complete: float


class TripDetail(TripOut):
    backfill: BackfillStatus


def _trip_to_out(trip: Trip) -> TripOut:
    return TripOut(
        id=trip.id,
        name=trip.name,
        origin_address=trip.origin_address,
        destination_address=trip.destination_address,
        created_at=trip.created_at.isoformat() if trip.created_at else None,
    )


def _backfill_for(trip_id: int) -> BackfillStatus:
    status_dict = sample_status_for_trip(trip_id, current_week_start())
    total = status_dict["total"]
    ready = status_dict["ready"]
    percent = (ready / total * 100.0) if total else 0.0
    return BackfillStatus(
        total=total, ready=ready, percent_complete=round(percent, 1)
    )


def _kickoff_backfill(trip_id: int) -> None:
    """Fire a one-off sample fill for a newly created trip.

    Imported lazily so tests / API-only boot paths don't pay the import
    cost of the data-gathering module.
    """
    from app.job.data_gathering import backfill_trip_current_week

    try:
        backfill_trip_current_week(trip_id)
    except Exception:
        logger.exception("Backfill failed for trip %s", trip_id)


@trips_router.get("", response_model=list[TripOut])
async def list_my_trips(user: User = Depends(get_current_user)) -> list[TripOut]:
    """Return all of the authenticated user's trips, newest first."""
    return [_trip_to_out(t) for t in list_trips_for_user(user.id)]


@trips_router.post("", response_model=TripDetail, status_code=status.HTTP_201_CREATED)
async def create_my_trip(
    body: TripCreate,
    background_tasks: BackgroundTasks,
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> TripDetail:
    """Create a trip and kick off an async backfill for the current week."""
    origin = body.origin_address.strip()
    destination = body.destination_address.strip()
    if origin.lower() == destination.lower():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Origin and destination cannot be the same address",
        )

    try:
        trip = create_trip(
            user_id=user.id,
            name=body.name,
            origin_address=origin,
            destination_address=destination,
            per_user_cap=settings.max_trips_per_user,
            total_cap=settings.max_trips_total,
        )
    except TripQuotaExceededError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail=str(exc)
        ) from exc

    background_tasks.add_task(_kickoff_backfill, trip.id)
    return TripDetail(**_trip_to_out(trip).model_dump(), backfill=_backfill_for(trip.id))


@trips_router.get("/{trip_id}", response_model=TripDetail)
async def get_my_trip(
    trip_id: int, user: User = Depends(get_current_user)
) -> TripDetail:
    """Return a single trip owned by the caller."""
    try:
        trip = get_trip_for_user(trip_id=trip_id, user_id=user.id)
    except TripNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Trip not found"
        ) from exc
    return TripDetail(**_trip_to_out(trip).model_dump(), backfill=_backfill_for(trip.id))


@trips_router.delete("/{trip_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_my_trip(
    trip_id: int, user: User = Depends(get_current_user)
) -> None:
    """Soft-delete a trip. Samples stay until the next cleanup."""
    try:
        soft_delete_trip(trip_id=trip_id, user_id=user.id)
    except TripNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Trip not found"
        ) from exc


@trips_router.get("/{trip_id}/heatmap")
async def get_trip_heatmap(
    trip_id: int, user: User = Depends(get_current_user)
) -> dict:
    """Return the heatmap payload for this trip's current week."""
    try:
        get_trip_for_user(trip_id=trip_id, user_id=user.id)
    except TripNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Trip not found"
        ) from exc
    return get_heatmap_for_trip(trip_id, current_week_start())


@trips_router.get("/{trip_id}/backfill-status", response_model=BackfillStatus)
async def get_trip_backfill_status(
    trip_id: int, user: User = Depends(get_current_user)
) -> BackfillStatus:
    """How much of the current week has been sampled so far."""
    try:
        get_trip_for_user(trip_id=trip_id, user_id=user.id)
    except TripNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Trip not found"
        ) from exc
    return _backfill_for(trip_id)


__all__ = ["trips_router"]
