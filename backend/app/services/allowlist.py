"""Access-control allowlist backed by the `auth_allowlist` table."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime

from app.config import Settings
from app.db.db import Database

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class AllowlistEntry:
    id: int
    email: str
    added_by: str | None
    created_at: datetime | None


def is_email_allowed(email: str, *, settings: Settings) -> bool:
    """Return True iff `email` is on the allowlist or an admin."""
    email = email.lower()
    if email in {a.lower() for a in settings.admin_emails}:
        return True

    with Database() as cursor:
        cursor.execute(
            "SELECT 1 FROM auth_allowlist WHERE email = %s LIMIT 1",
            (email,),
        )
        row = cursor.fetchone()
    return row is not None


def add_email(email: str, *, added_by: str | None) -> AllowlistEntry:
    """Add `email` to the allowlist. Idempotent."""
    email = email.lower()
    with Database() as cursor:
        cursor.execute(
            "INSERT IGNORE INTO auth_allowlist (email, added_by) VALUES (%s, %s)",
            (email, added_by),
        )
        cursor.execute(
            "SELECT id, email, added_by, created_at "
            "FROM auth_allowlist WHERE email = %s",
            (email,),
        )
        row = cursor.fetchone()

    assert row is not None
    return AllowlistEntry(
        id=int(row[0]), email=row[1], added_by=row[2], created_at=row[3]
    )


def remove_email(email: str) -> bool:
    """Drop `email` from the allowlist. Returns True if a row was deleted."""
    email = email.lower()
    with Database() as cursor:
        cursor.execute("DELETE FROM auth_allowlist WHERE email = %s", (email,))
        deleted = int(cursor.rowcount or 0) > 0
    return deleted


def list_entries() -> list[AllowlistEntry]:
    """Return every allowlist entry, newest first."""
    with Database() as cursor:
        cursor.execute(
            "SELECT id, email, added_by, created_at FROM auth_allowlist "
            "ORDER BY created_at DESC, id DESC"
        )
        rows = cursor.fetchall()
    return [
        AllowlistEntry(
            id=int(r[0]), email=r[1], added_by=r[2], created_at=r[3]
        )
        for r in rows
    ]


def bootstrap_from_settings(settings: Settings) -> int:
    """Ensure every email in AUTH_ALLOWLIST_BOOTSTRAP / ADMIN_EMAILS is on the list.

    Returns the number of rows inserted. Missing DB is tolerated (logged).
    """
    targets = {
        e.lower() for e in (*settings.auth_allowlist_bootstrap, *settings.admin_emails)
    }
    if not targets:
        return 0

    inserted = 0
    try:
        with Database() as cursor:
            for email in targets:
                cursor.execute(
                    "INSERT IGNORE INTO auth_allowlist (email, added_by) "
                    "VALUES (%s, 'bootstrap')",
                    (email,),
                )
                if cursor.rowcount == 1:
                    inserted += 1
    except Exception:
        logger.exception("Allowlist bootstrap failed (DB not ready?)")
        return 0

    if inserted:
        logger.info("Bootstrapped %s email(s) onto the allowlist", inserted)
    return inserted
