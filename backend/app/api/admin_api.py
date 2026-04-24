"""Admin endpoints: data-gathering trigger + allowlist management.

Mounted when `ENABLE_ADMIN_API` is truthy and gated behind the
`get_admin_user` dependency so only emails in `ADMIN_EMAILS` can hit
them. In local dev the dev user is usually an admin so these are usable
right after seeding.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr

from app.auth.dependencies import get_admin_user
from app.job.data_gathering import main as data_gathering_main
from app.job.providers import get_provider
from app.services import allowlist as allowlist_service
from app.services.users import User

logger = logging.getLogger(__name__)

admin_router = APIRouter(prefix="/api/v1/admin", tags=["Admin"])


class AllowlistEntryOut(BaseModel):
    id: int
    email: EmailStr
    added_by: str | None
    created_at: str | None


class AllowlistAdd(BaseModel):
    email: EmailStr


def _entry_to_out(entry: allowlist_service.AllowlistEntry) -> AllowlistEntryOut:
    return AllowlistEntryOut(
        id=entry.id,
        email=entry.email,
        added_by=entry.added_by,
        created_at=(
            entry.created_at.isoformat() if entry.created_at else None
        ),
    )


def _run_job() -> None:
    logger.info("Admin-triggered data gathering started")
    data_gathering_main(provider=get_provider())
    logger.info("Admin-triggered data gathering completed")


@admin_router.post("/run-data-gathering")
async def trigger_data_gathering(
    background_tasks: BackgroundTasks,
    _: User = Depends(get_admin_user),
) -> dict[str, str]:
    """Kick off the multi-trip data-gathering job in the background."""
    background_tasks.add_task(_run_job)
    return {"status": "started"}


@admin_router.get("/allowlist", response_model=list[AllowlistEntryOut])
async def list_allowlist(
    _: User = Depends(get_admin_user),
) -> list[AllowlistEntryOut]:
    """List every email allowed to sign in."""
    return [_entry_to_out(e) for e in allowlist_service.list_entries()]


@admin_router.post(
    "/allowlist",
    response_model=AllowlistEntryOut,
    status_code=status.HTTP_201_CREATED,
)
async def add_to_allowlist(
    body: AllowlistAdd, admin: User = Depends(get_admin_user)
) -> AllowlistEntryOut:
    """Add an email to the allowlist. Idempotent."""
    entry = allowlist_service.add_email(body.email, added_by=admin.email)
    return _entry_to_out(entry)


@admin_router.delete(
    "/allowlist/{email}", status_code=status.HTTP_204_NO_CONTENT
)
async def remove_from_allowlist(
    email: EmailStr, _: User = Depends(get_admin_user)
) -> None:
    """Remove an email from the allowlist. 404 if it wasn't on it."""
    removed = allowlist_service.remove_email(email)
    if not removed:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Email not on allowlist",
        )
