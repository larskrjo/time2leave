"""Unit tests for `app.auth.google.verify_google_id_token`.

`google.oauth2.id_token.verify_oauth2_token` is monkey-patched so we never
hit the network. We care that:
  - missing/incorrect issuer => rejected
  - missing email/sub        => rejected
  - happy path returns the claims we expose to the app
"""

from __future__ import annotations

import pytest

from app.auth import google as google_auth
from app.auth.google import InvalidGoogleIdTokenError, verify_google_id_token
from app.config import Settings


@pytest.fixture
def settings() -> Settings:
    return Settings(
        app_env="local",
        google_oauth_client_id="test-client-id.apps.googleusercontent.com",
    )


def _patch_verifier(monkeypatch: pytest.MonkeyPatch, claims: dict) -> None:
    def fake(token, request, audience):  # noqa: ARG001
        return claims

    monkeypatch.setattr(google_auth.id_token, "verify_oauth2_token", fake)


def test_rejects_when_no_client_id_configured() -> None:
    bare = Settings(app_env="local", google_oauth_client_id=None)
    with pytest.raises(InvalidGoogleIdTokenError):
        verify_google_id_token("dummy", bare)


def test_rejects_bad_issuer(
    monkeypatch: pytest.MonkeyPatch, settings: Settings
) -> None:
    _patch_verifier(
        monkeypatch,
        {
            "iss": "evil.example.com",
            "sub": "1",
            "email": "a@b.test",
            "email_verified": True,
        },
    )
    with pytest.raises(InvalidGoogleIdTokenError):
        verify_google_id_token("fake", settings)


def test_rejects_missing_email(
    monkeypatch: pytest.MonkeyPatch, settings: Settings
) -> None:
    _patch_verifier(
        monkeypatch,
        {"iss": "accounts.google.com", "sub": "1", "email_verified": True},
    )
    with pytest.raises(InvalidGoogleIdTokenError):
        verify_google_id_token("fake", settings)


def test_happy_path_normalizes_email_casing(
    monkeypatch: pytest.MonkeyPatch, settings: Settings
) -> None:
    _patch_verifier(
        monkeypatch,
        {
            "iss": "https://accounts.google.com",
            "sub": "google-sub-123",
            "email": "User@Example.COM",
            "email_verified": True,
            "name": "User Example",
            "picture": "https://pics/example.png",
        },
    )
    identity = verify_google_id_token("fake", settings)
    assert identity.sub == "google-sub-123"
    assert identity.email == "user@example.com"
    assert identity.email_verified is True
    assert identity.name == "User Example"
    assert identity.picture == "https://pics/example.png"


def test_wraps_library_exceptions(
    monkeypatch: pytest.MonkeyPatch, settings: Settings
) -> None:
    def boom(token, request, audience):  # noqa: ARG001
        raise ValueError("bad signature")

    monkeypatch.setattr(google_auth.id_token, "verify_oauth2_token", boom)
    with pytest.raises(InvalidGoogleIdTokenError):
        verify_google_id_token("x", settings)
