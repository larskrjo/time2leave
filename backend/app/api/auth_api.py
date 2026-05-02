"""HTTP-level auth endpoints: /auth/google, /auth/logout, /auth/dev-login, /me.

The frontend flow:
    1. GSI library produces an ID token client-side.
    2. Frontend POSTs it to /api/v1/auth/google.
    3. We verify it, check the allowlist, upsert the user, and set a
       session cookie. Subsequent requests authenticate via the cookie.
    4. /api/v1/auth/logout clears the cookie.
    5. /api/v1/me returns the logged-in user (or 401 if not).
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response, status
from pydantic import BaseModel, EmailStr, Field

from app.auth.dependencies import get_current_user, get_optional_user, is_admin
from app.auth.google import InvalidGoogleIdTokenError, verify_google_id_token
from app.auth.sessions import (
    clear_session_cookie,
    issue_session_token,
    set_session_cookie,
)
from app.config import Settings, get_settings
from app.services.allowlist import is_email_allowed
from app.services.users import (
    User,
    get_user_by_email,
    upsert_user_from_google,
)

logger = logging.getLogger(__name__)

auth_router = APIRouter(prefix="/api/v1", tags=["Auth"])


class GoogleLoginRequest(BaseModel):
    credential: str = Field(..., description="Google ID token from GSI")


class DevLoginRequest(BaseModel):
    email: EmailStr
    name: str | None = None


class AuthedUserResponse(BaseModel):
    id: int
    email: EmailStr
    name: str | None
    picture_url: str | None
    is_admin: bool
    # Bearer-token fields populated only for clients that opt in via
    # `X-Client: mobile` or `?token=true`. Web clients ignore these and
    # rely on the HttpOnly `tlh_session` cookie instead.
    session_token: str | None = None
    session_expires_at: str | None = None


def _serialize_user(user: User, settings: Settings) -> AuthedUserResponse:
    return AuthedUserResponse(
        id=user.id,
        email=user.email,
        name=user.name,
        picture_url=user.picture_url,
        is_admin=is_admin(user, settings),
    )


def _wants_session_token(
    request: Request, x_client: str | None
) -> bool:
    """Should this login response include the bearer-token fields?

    Mobile clients can opt in either via the explicit `X-Client: mobile`
    header (preferred — works on every request, not just login) or with
    a `?token=true` query param (handy from a browser console for ad-hoc
    testing). Web stays on the cookie path by default."""
    if x_client and x_client.strip().lower() == "mobile":
        return True
    return request.query_params.get("token", "").lower() == "true"


def _attach_session(
    *,
    user: User,
    settings: Settings,
    response: Response,
    include_token_in_body: bool,
) -> AuthedUserResponse:
    """Issue a session JWT, write it to the cookie, and (when the
    caller opted in) echo it back in the response body so a mobile
    client without cookie storage can persist it itself."""
    token, expires_at = issue_session_token(
        user_id=user.id, email=user.email, settings=settings
    )
    set_session_cookie(response, token, expires_at, settings)
    payload = _serialize_user(user, settings)
    if include_token_in_body:
        payload.session_token = token
        payload.session_expires_at = expires_at.isoformat()
    return payload


@auth_router.post("/auth/google")
async def login_with_google(
    body: GoogleLoginRequest,
    request: Request,
    response: Response,
    settings: Settings = Depends(get_settings),
    x_client: str | None = Header(default=None),
) -> AuthedUserResponse:
    """Exchange a Google ID token for a session cookie (web) or a bearer
    token (mobile, via `X-Client: mobile` / `?token=true`)."""
    try:
        identity = verify_google_id_token(body.credential, settings)
    except InvalidGoogleIdTokenError as exc:
        logger.info("Google login rejected: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Google credential",
        ) from exc

    if not identity.email_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Google account email is not verified",
        )

    if not is_email_allowed(identity.email, settings=settings):
        logger.info("Login blocked by allowlist: %s", identity.email)
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "This email is not on the allowlist. Ask the owner to add "
                "you and try again."
            ),
        )

    user = upsert_user_from_google(identity)
    return _attach_session(
        user=user,
        settings=settings,
        response=response,
        include_token_in_body=_wants_session_token(request, x_client),
    )


@auth_router.post("/auth/dev-login")
async def dev_login(
    body: DevLoginRequest,
    request: Request,
    response: Response,
    settings: Settings = Depends(get_settings),
    x_client: str | None = Header(default=None),
) -> AuthedUserResponse:
    """Escape hatch for local dev / tests when no real GSI is available.

    Only mounted when `APP_ENV != "prod"` and `ENABLE_DEV_LOGIN` is truthy.
    Requires the email to already be on the allowlist or a known user, so
    an accidentally-exposed dev endpoint still can't log in a stranger.
    Honors `X-Client: mobile` so the Expo dev build can use the same
    bearer-token round trip as a production login.
    """
    if settings.app_env == "prod" or not settings.enable_dev_login:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Not found"
        )

    email = body.email.lower()
    if not is_email_allowed(email, settings=settings):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Email is not on the dev allowlist",
        )

    user = get_user_by_email(email)
    if user is None:
        # Dev convenience: conjure a user row so the rest of the app works.
        from app.auth.google import GoogleIdentity

        identity = GoogleIdentity(
            sub=f"dev-{email}",
            email=email,
            email_verified=True,
            name=body.name,
            picture=None,
        )
        user = upsert_user_from_google(identity)

    return _attach_session(
        user=user,
        settings=settings,
        response=response,
        include_token_in_body=_wants_session_token(request, x_client),
    )


@auth_router.post("/auth/logout")
async def logout(
    response: Response,
    settings: Settings = Depends(get_settings),
) -> dict[str, str]:
    """Drop the session cookie. Idempotent (safe to call anonymously)."""
    clear_session_cookie(response, settings)
    return {"status": "ok"}


@auth_router.get("/me")
async def get_me(
    user: User | None = Depends(get_optional_user),
    settings: Settings = Depends(get_settings),
) -> AuthedUserResponse | dict[str, None]:
    """Return the authenticated user, or `{"user": null}` for anonymous."""
    if user is None:
        return {"user": None}
    return _serialize_user(user, settings)


@auth_router.get("/auth/config")
async def auth_config(
    settings: Settings = Depends(get_settings),
) -> dict[str, object]:
    """Client-safe OAuth config so the SPA doesn't need a separate env var flow."""
    return {
        "google_oauth_client_id": settings.google_oauth_client_id,
        "dev_login_enabled": settings.enable_dev_login
        and settings.app_env != "prod",
    }


__all__ = ["auth_router", "get_current_user"]
