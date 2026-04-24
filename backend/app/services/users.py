"""User repository helpers: upsert on login, lookup by id."""

from __future__ import annotations

from dataclasses import dataclass

from app.auth.google import GoogleIdentity
from app.db.db import Database


@dataclass(frozen=True)
class User:
    id: int
    google_sub: str
    email: str
    name: str | None
    picture_url: str | None


def get_user_by_id(user_id: int) -> User | None:
    """Lookup a user by primary key. Returns None if not found."""
    query = (
        "SELECT id, google_sub, email, name, picture_url "
        "FROM users WHERE id = %s"
    )
    with Database() as cursor:
        cursor.execute(query, (user_id,))
        row = cursor.fetchone()
    return _row_to_user(row) if row else None


def get_user_by_email(email: str) -> User | None:
    """Lookup a user by lowercased email."""
    query = (
        "SELECT id, google_sub, email, name, picture_url "
        "FROM users WHERE email = %s"
    )
    with Database() as cursor:
        cursor.execute(query, (email.lower(),))
        row = cursor.fetchone()
    return _row_to_user(row) if row else None


def upsert_user_from_google(identity: GoogleIdentity) -> User:
    """Insert (or refresh) the user row tied to a verified Google identity.

    Re-uses an existing row when we've seen the same `google_sub` or email
    before. Google's `sub` is the stable identifier across email changes
    so we match on that first, then fall back to email.
    """
    email = identity.email.lower()

    with Database() as cursor:
        cursor.execute(
            "SELECT id FROM users WHERE google_sub = %s OR email = %s LIMIT 1",
            (identity.sub, email),
        )
        row = cursor.fetchone()

        if row is None:
            cursor.execute(
                """
                INSERT INTO users (google_sub, email, name, picture_url)
                VALUES (%s, %s, %s, %s)
                """,
                (identity.sub, email, identity.name, identity.picture),
            )
        else:
            cursor.execute(
                """
                UPDATE users
                SET google_sub  = %s,
                    email       = %s,
                    name        = COALESCE(%s, name),
                    picture_url = COALESCE(%s, picture_url)
                WHERE id = %s
                """,
                (identity.sub, email, identity.name, identity.picture, row[0]),
            )

        cursor.execute(
            "SELECT id, google_sub, email, name, picture_url "
            "FROM users WHERE google_sub = %s",
            (identity.sub,),
        )
        refreshed = cursor.fetchone()

    assert refreshed is not None, "user row disappeared mid-upsert"
    return _row_to_user(refreshed)


def _row_to_user(row: tuple) -> User:
    return User(
        id=int(row[0]),
        google_sub=row[1],
        email=row[2],
        name=row[3],
        picture_url=row[4],
    )
