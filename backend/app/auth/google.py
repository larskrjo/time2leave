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

    Accepts the token's `aud` claim against *any* of the configured
    OAuth client IDs (web, iOS, Android), so the same backend can
    serve all three clients off a single Google Cloud project. Raises
    `InvalidGoogleIdTokenError` on any problem so callers can 401
    without leaking which check failed.
    """
    accepted_audiences = settings.google_oauth_client_ids
    if not accepted_audiences:
        raise InvalidGoogleIdTokenError(
            "GOOGLE_OAUTH_CLIENT_ID is not configured on the backend"
        )

    try:
        # Pass `audience=None` so the google-auth library skips its own
        # audience check; we then verify `aud` against the *list* of
        # accepted client IDs ourselves. Signature, expiry, and issuer
        # checks still happen inside `verify_oauth2_token`.
        claims = id_token.verify_oauth2_token(
            token,
            google_requests.Request(),
            audience=None,
        )
    except Exception as exc:
        logger.info("Rejecting Google ID token: %s", exc)
        raise InvalidGoogleIdTokenError(str(exc)) from exc

    issuer = claims.get("iss")
    if issuer not in _ALLOWED_ISSUERS:
        raise InvalidGoogleIdTokenError(f"Unexpected issuer: {issuer!r}")

    aud = claims.get("aud")
    if aud not in accepted_audiences:
        # `aud` is a single string for ID tokens (per OIDC spec); we
        # never receive an array here, so no need to handle that case.
        raise InvalidGoogleIdTokenError(
            f"Token audience {aud!r} is not in the configured client ID list"
        )

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
