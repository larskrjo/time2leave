"""Google ID token verification.

The frontend uses Google Identity Services (GSI) to obtain an ID token
and posts it to `POST /api/v1/auth/google`. We verify it here with
`google-auth` using the configured OAuth client id as the audience.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

from google.auth.transport import requests as google_requests
from google.oauth2 import id_token

from app.config import Settings

logger = logging.getLogger(__name__)


class InvalidGoogleIdTokenError(Exception):
    """Raised when a Google ID token cannot be verified."""


@dataclass(frozen=True)
class GoogleIdentity:
    """Claims we care about from a verified Google ID token."""

    sub: str
    email: str
    email_verified: bool
    name: str | None
    picture: str | None


_ALLOWED_ISSUERS = ("accounts.google.com", "https://accounts.google.com")


def verify_google_id_token(token: str, settings: Settings) -> GoogleIdentity:
    """Validate a Google ID token and return the claims we trust.

    Raises `InvalidGoogleIdTokenError` on any problem so callers can 401
    without leaking which check failed.
    """
    if not settings.google_oauth_client_id:
        raise InvalidGoogleIdTokenError(
            "GOOGLE_OAUTH_CLIENT_ID is not configured on the backend"
        )

    try:
        claims = id_token.verify_oauth2_token(
            token,
            google_requests.Request(),
            settings.google_oauth_client_id,
        )
    except Exception as exc:
        logger.info("Rejecting Google ID token: %s", exc)
        raise InvalidGoogleIdTokenError(str(exc)) from exc

    issuer = claims.get("iss")
    if issuer not in _ALLOWED_ISSUERS:
        raise InvalidGoogleIdTokenError(f"Unexpected issuer: {issuer!r}")

    email = claims.get("email")
    sub = claims.get("sub")
    if not email or not sub:
        raise InvalidGoogleIdTokenError("ID token missing email or sub")

    return GoogleIdentity(
        sub=str(sub),
        email=str(email).lower(),
        email_verified=bool(claims.get("email_verified", False)),
        name=claims.get("name"),
        picture=claims.get("picture"),
    )
