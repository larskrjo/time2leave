"""Session JWT issuance + verification + HTTP cookie plumbing.

We keep sessions stateless and small: a signed JWT with user id, email,
and expiry, stored in an HttpOnly cookie. The cookie name, TTL, and
signing secret live in `Settings`.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

import jwt
from fastapi import Response

from app.config import Settings

logger = logging.getLogger(__name__)

JWT_ALGORITHM = "HS256"


class InvalidSessionError(Exception):
    """Raised when a session cookie cannot be decoded or has expired."""


@dataclass(frozen=True)
class SessionClaims:
    """What we carry inside a session JWT."""

    user_id: int
    email: str
    expires_at: datetime


def issue_session_token(
    *, user_id: int, email: str, settings: Settings, now: datetime | None = None
) -> tuple[str, datetime]:
    """Sign a session JWT and return `(token, expires_at)`."""
    issued_at = now or datetime.now(UTC)
    expires_at = issued_at + timedelta(hours=settings.session_ttl_hours)
    payload: dict[str, object] = {
        "sub": str(user_id),
        "uid": user_id,
        "email": email.lower(),
        "iat": int(issued_at.timestamp()),
        "exp": int(expires_at.timestamp()),
    }
    token = jwt.encode(payload, settings.session_secret, algorithm=JWT_ALGORITHM)
    return token, expires_at


def verify_session_token(token: str, settings: Settings) -> SessionClaims:
    """Decode + validate a session JWT. Raises `InvalidSessionError` on any failure."""
    try:
        decoded = jwt.decode(
            token,
            settings.session_secret,
            algorithms=[JWT_ALGORITHM],
            options={"require": ["uid", "email", "exp"]},
        )
    except jwt.PyJWTError as exc:
        raise InvalidSessionError(str(exc)) from exc

    try:
        user_id = int(decoded["uid"])
        email = str(decoded["email"]).lower()
        expires_at = datetime.fromtimestamp(int(decoded["exp"]), tz=UTC)
    except (KeyError, ValueError, TypeError) as exc:
        raise InvalidSessionError(f"Malformed session payload: {exc}") from exc

    return SessionClaims(user_id=user_id, email=email, expires_at=expires_at)


def set_session_cookie(
    response: Response, token: str, expires_at: datetime, settings: Settings
) -> None:
    """Write the session cookie with `Secure + HttpOnly + SameSite=Lax`."""
    max_age = max(0, int((expires_at - datetime.now(UTC)).total_seconds()))
    response.set_cookie(
        key=settings.session_cookie_name,
        value=token,
        max_age=max_age,
        expires=max_age,
        httponly=True,
        secure=settings.app_env == "prod",
        samesite="lax",
        domain=settings.session_cookie_domain,
        path="/",
    )


def clear_session_cookie(response: Response, settings: Settings) -> None:
    """Expire the session cookie so the browser drops it immediately."""
    response.delete_cookie(
        key=settings.session_cookie_name,
        domain=settings.session_cookie_domain,
        path="/",
    )
