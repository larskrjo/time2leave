"""FastAPI dependencies that turn a session cookie into a User row.

Route handlers use one of:
    * `current_user` — require a logged-in user; 401 otherwise.
    * `admin_user`   — require a logged-in user whose email is in `admin_emails`.
    * `optional_user` — accept anonymous callers; returns `None` if so.
"""

from __future__ import annotations

from fastapi import Cookie, Depends, HTTPException, status

from app.auth.sessions import (
    InvalidSessionError,
    SessionClaims,
    verify_session_token,
)
from app.config import Settings, get_settings
from app.services.users import User, get_user_by_id


def _cookie_name() -> str:
    return get_settings().session_cookie_name


def _session_claims_from_cookie(
    cookie_value: str | None, settings: Settings
) -> SessionClaims | None:
    if not cookie_value:
        return None
    try:
        return verify_session_token(cookie_value, settings)
    except InvalidSessionError:
        return None


def get_optional_user(
    tlh_session: str | None = Cookie(default=None),
    settings: Settings = Depends(get_settings),
) -> User | None:
    """Return the current user if the session cookie is valid, else None.

    Note: the `tlh_session` parameter name must match
    `Settings.session_cookie_name`. We keep the default name in sync via
    tests; changing the setting at runtime would also need a matching
    parameter here if you want anonymous callers to be identified.
    """
    claims = _session_claims_from_cookie(tlh_session, settings)
    if claims is None:
        return None
    return get_user_by_id(claims.user_id)


def get_current_user(user: User | None = Depends(get_optional_user)) -> User:
    """Require an authenticated user; raise 401 otherwise."""
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        )
    return user


def is_admin(user: User, settings: Settings) -> bool:
    """Return True iff `user.email` is in `settings.admin_emails`.

    Single source of truth for admin checks — used by `get_admin_user`,
    by `_serialize_user` (to expose `is_admin` to the SPA), and by the
    trip-quota path (admins get a higher per-user trip cap).
    """
    return user.email.lower() in {a.lower() for a in settings.admin_emails}


def get_admin_user(
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> User:
    """Require an authenticated user whose email is in `admin_emails`."""
    if not is_admin(user, settings):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required",
        )
    return user
