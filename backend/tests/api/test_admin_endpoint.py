"""Tests for the admin router."""

from __future__ import annotations

from fastapi.testclient import TestClient


def test_admin_endpoint_mounted_in_local(monkeypatch):
    """In local/dev, POST /api/v1/admin/run-data-gathering should exist."""
    monkeypatch.setenv("APP_ENV", "local")
    import app.api.admin_api as admin_mod
    from app.config import reset_settings_cache
    from app.main import create_app

    called = {"value": False}

    def _fake_main(*_a, **_k):
        called["value"] = True

    monkeypatch.setattr(admin_mod, "data_gathering_main", _fake_main)
    monkeypatch.setattr(admin_mod, "get_provider", lambda *_: None)
    reset_settings_cache()

    app = create_app()
    with TestClient(app) as c:
        r = c.post("/api/v1/admin/run-data-gathering")

    assert r.status_code == 200
    assert r.json() == {"status": "started"}
    assert called["value"] is True


def test_admin_endpoint_not_mounted_in_prod(monkeypatch):
    """Prod must not expose the admin router."""
    monkeypatch.setenv("APP_ENV", "prod")

    # Block the Secrets Manager call that prod mode would trigger.
    import app.config as config_mod

    monkeypatch.setattr(config_mod, "_load_from_aws_secrets_manager", lambda _s: None)
    config_mod.reset_settings_cache()

    from app.main import create_app

    app = create_app()
    with TestClient(app) as c:
        r = c.post("/api/v1/admin/run-data-gathering")
    assert r.status_code == 404
