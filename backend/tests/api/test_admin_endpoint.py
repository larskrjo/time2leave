"""Tests for the admin router.

Admin endpoints exist everywhere `ENABLE_ADMIN_API` is true, but are
gated behind `get_admin_user` so callers must supply a session cookie
for an email in `ADMIN_EMAILS`. These tests override the auth dependency
and don't need a database.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.auth.dependencies import get_admin_user
from app.services.users import User


@pytest.fixture
def admin_override() -> User:
    return User(
        id=1,
        google_sub="s",
        apple_sub=None,
        email="admin@example.com",
        name="Admin",
        picture_url=None,
    )


def test_admin_endpoint_requires_auth(monkeypatch: pytest.MonkeyPatch) -> None:
    """Unauthenticated callers get 401."""
    monkeypatch.setenv("APP_ENV", "local")
    from app.config import reset_settings_cache
    from app.main import create_app

    reset_settings_cache()
    app = create_app()
    with TestClient(app) as c:
        r = c.post("/api/v1/admin/run-data-gathering")

    assert r.status_code == 401


def test_admin_endpoint_triggers_background_job(
    monkeypatch: pytest.MonkeyPatch, admin_override: User
) -> None:
    """With an admin override the endpoint schedules the job."""
    monkeypatch.setenv("APP_ENV", "local")
    import app.api.admin_api as admin_mod
    from app.config import reset_settings_cache
    from app.main import create_app

    called = {"value": False}

    def _fake_main(*_a, **_k) -> None:
        called["value"] = True

    monkeypatch.setattr(admin_mod, "data_gathering_main", _fake_main)
    monkeypatch.setattr(admin_mod, "get_provider", lambda *_: None)
    reset_settings_cache()

    app = create_app()
    app.dependency_overrides[get_admin_user] = lambda: admin_override
    with TestClient(app) as c:
        r = c.post("/api/v1/admin/run-data-gathering")

    assert r.status_code == 200
    assert r.json() == {"status": "started"}
    assert called["value"] is True


def test_admin_endpoint_hidden_when_disabled(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Setting `ENABLE_ADMIN_API=false` removes the router entirely."""
    monkeypatch.setenv("APP_ENV", "prod")
    monkeypatch.setenv("ENABLE_ADMIN_API", "false")

    import app.config as config_mod

    monkeypatch.setattr(config_mod, "_load_from_aws_secrets_manager", lambda _s: None)
    config_mod.reset_settings_cache()

    from app.main import create_app

    app = create_app()
    with TestClient(app) as c:
        r = c.post("/api/v1/admin/run-data-gathering")
    assert r.status_code == 404
