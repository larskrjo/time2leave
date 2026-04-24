"""Unit tests for `app.auth.sessions`: JWT round-trip + cookie plumbing."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import jwt
import pytest
from fastapi import Response

from app.auth.sessions import (
    InvalidSessionError,
    clear_session_cookie,
    issue_session_token,
    set_session_cookie,
    verify_session_token,
)
from app.config import Settings


@pytest.fixture
def settings() -> Settings:
    return Settings(
        app_env="local",
        session_secret="unit-test-secret",
        session_cookie_name="tlh_session",
        session_ttl_hours=1,
    )


def test_round_trip_returns_same_claims(settings: Settings) -> None:
    token, expires = issue_session_token(
        user_id=42, email="USER@Example.com", settings=settings
    )
    claims = verify_session_token(token, settings)

    assert claims.user_id == 42
    assert claims.email == "user@example.com"
    assert claims.expires_at == expires.replace(microsecond=0)


def test_expired_token_rejected(settings: Settings) -> None:
    long_ago = datetime.now(UTC) - timedelta(hours=2)
    token, _ = issue_session_token(
        user_id=1, email="a@b.test", settings=settings, now=long_ago
    )
    with pytest.raises(InvalidSessionError):
        verify_session_token(token, settings)


def test_wrong_secret_rejected(settings: Settings) -> None:
    token, _ = issue_session_token(
        user_id=1, email="a@b.test", settings=settings
    )
    tampered = Settings(
        app_env="local", session_secret="other-secret", session_cookie_name="x"
    )
    with pytest.raises(InvalidSessionError):
        verify_session_token(token, tampered)


def test_unknown_algorithm_rejected(settings: Settings) -> None:
    # Forge a token with the right secret but a different algorithm.
    bad = jwt.encode(
        {"uid": 1, "email": "a@b.test", "exp": 9999999999},
        settings.session_secret,
        algorithm="HS512",
    )
    with pytest.raises(InvalidSessionError):
        verify_session_token(bad, settings)


def test_missing_fields_rejected(settings: Settings) -> None:
    incomplete = jwt.encode(
        {"exp": 9999999999},
        settings.session_secret,
        algorithm="HS256",
    )
    with pytest.raises(InvalidSessionError):
        verify_session_token(incomplete, settings)


def test_set_and_clear_session_cookie(settings: Settings) -> None:
    token, expires = issue_session_token(
        user_id=7, email="c@d.test", settings=settings
    )
    response = Response()
    set_session_cookie(response, token, expires, settings)

    cookies = response.headers.getlist("set-cookie")
    assert len(cookies) == 1
    assert cookies[0].startswith("tlh_session=")
    assert "HttpOnly" in cookies[0]
    assert "samesite=lax" in cookies[0].lower()

    cleared = Response()
    clear_session_cookie(cleared, settings)
    cleared_cookies = cleared.headers.getlist("set-cookie")
    assert any("tlh_session=" in c and "Max-Age=0" in c for c in cleared_cookies)


def test_prod_cookie_is_secure() -> None:
    settings = Settings(
        app_env="prod",
        session_secret="s",
        session_cookie_name="tlh_session",
        session_ttl_hours=1,
    )
    token, expires = issue_session_token(
        user_id=1, email="e@e.test", settings=settings
    )
    response = Response()
    set_session_cookie(response, token, expires, settings)
    assert "Secure" in response.headers.getlist("set-cookie")[0]
