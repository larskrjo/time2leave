"""Route-level tests for `/api/v1/auth/*` and `/api/v1/me`.

All DB and Google network calls are monkey-patched so these run as
fast unit tests against FastAPI's TestClient.
"""

from __future__ import annotations

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from app.auth.google import GoogleIdentity
from app.services.users import User


@pytest.fixture
def patched_app(monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    monkeypatch.setenv("APP_ENV", "local")
    monkeypatch.setenv("GOOGLE_OAUTH_CLIENT_ID", "test-oauth-client")
    monkeypatch.setenv("SESSION_SECRET", "unit-test-secret-1234567890abcdef")
    monkeypatch.setenv("ADMIN_EMAILS", "admin@example.com")

    from app.config import reset_settings_cache

    reset_settings_cache()

    from app.api import auth_api

    store: dict[str, User] = {}

    def fake_is_email_allowed(email: str, *, settings) -> bool:  # noqa: ARG001
        return email.lower() in store or email.lower() == "admin@example.com"

    def fake_upsert(identity: GoogleIdentity) -> User:
        user = User(
            id=len(store) + 1,
            google_sub=identity.sub,
            email=identity.email,
            name=identity.name,
            picture_url=identity.picture,
        )
        store[identity.email.lower()] = user
        return user

    def fake_get_user_by_email(email: str) -> User | None:
        return store.get(email.lower())

    def fake_get_user_by_id(user_id: int) -> User | None:
        for u in store.values():
            if u.id == user_id:
                return u
        return None

    monkeypatch.setattr(auth_api, "is_email_allowed", fake_is_email_allowed)
    monkeypatch.setattr(auth_api, "upsert_user_from_google", fake_upsert)
    monkeypatch.setattr(auth_api, "get_user_by_email", fake_get_user_by_email)

    from app.auth import dependencies as deps_mod

    monkeypatch.setattr(deps_mod, "get_user_by_id", fake_get_user_by_id)

    monkeypatch.setattr(
        auth_api,
        "verify_google_id_token",
        lambda token, settings: GoogleIdentity(  # noqa: ARG005
            sub="google-sub-allow" if token == "good" else "google-sub-denied",
            email=("allowed@example.com" if token == "good" else "stranger@example.com"),
            email_verified=True,
            name="Allowed" if token == "good" else "Stranger",
            picture=None,
        ),
    )
    # Seed the allowlist for our happy-path test email.
    store.setdefault(
        "allowed@example.com",
        User(
            id=1,
            google_sub="pre-seed",
            email="allowed@example.com",
            name="Allowed",
            picture_url=None,
        ),
    )

    from app.main import create_app

    with TestClient(create_app()) as client:
        yield client


def test_me_is_anonymous_without_cookie(patched_app: TestClient) -> None:
    r = patched_app.get("/api/v1/me")
    assert r.status_code == 200
    assert r.json() == {"user": None}


def test_google_login_sets_session_cookie(patched_app: TestClient) -> None:
    r = patched_app.post("/api/v1/auth/google", json={"credential": "good"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["email"] == "allowed@example.com"

    # Session cookie should now be set; /me returns the user.
    r2 = patched_app.get("/api/v1/me")
    assert r2.status_code == 200
    assert r2.json()["email"] == "allowed@example.com"


def test_google_login_respects_allowlist(patched_app: TestClient) -> None:
    r = patched_app.post("/api/v1/auth/google", json={"credential": "stranger"})
    assert r.status_code == 403
    assert "allowlist" in r.json()["detail"].lower()


def test_logout_clears_cookie(patched_app: TestClient) -> None:
    patched_app.post("/api/v1/auth/google", json={"credential": "good"})
    r = patched_app.post("/api/v1/auth/logout")
    assert r.status_code == 200
    # `/me` is anonymous again.
    assert patched_app.get("/api/v1/me").json() == {"user": None}


def test_dev_login_rejects_non_allowlisted(patched_app: TestClient) -> None:
    r = patched_app.post(
        "/api/v1/auth/dev-login", json={"email": "stranger@example.com"}
    )
    assert r.status_code == 403


def test_dev_login_accepts_allowlisted(patched_app: TestClient) -> None:
    r = patched_app.post(
        "/api/v1/auth/dev-login",
        json={"email": "allowed@example.com", "name": "Allowed Dev"},
    )
    assert r.status_code == 200
    assert r.json()["email"] == "allowed@example.com"


def test_auth_config_exposes_client_id(patched_app: TestClient) -> None:
    r = patched_app.get("/api/v1/auth/config")
    assert r.status_code == 200
    body = r.json()
    assert body["google_oauth_client_id"] == "test-oauth-client"
    assert body["dev_login_enabled"] is True
