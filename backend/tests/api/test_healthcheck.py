"""Tests for the healthcheck router.

The `Database` context manager is stubbed so /healthcheck doesn't require MySQL.
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient


class _FakeCursor:
    def __init__(self, ok: bool) -> None:
        self._ok = ok

    def execute(self, *_a: object, **_k: object) -> None:
        if not self._ok:
            raise RuntimeError("db exploded")

    def fetchone(self) -> tuple | None:
        return (1,) if self._ok else None

    def close(self) -> None:
        pass


class _FakeDatabaseCM:
    def __init__(self, ok: bool = True) -> None:
        self._ok = ok

    def __enter__(self) -> _FakeCursor:
        return _FakeCursor(self._ok)

    def __exit__(self, *exc: object) -> None:
        return None


def _app_with_fake_db(monkeypatch, ok: bool = True) -> FastAPI:
    import app.api.healthcheck_api as hc_mod
    from app.main import create_app

    monkeypatch.setattr(hc_mod.db, "Database", lambda: _FakeDatabaseCM(ok=ok))
    return create_app()


def test_healthcheck_ok(monkeypatch):
    app = _app_with_fake_db(monkeypatch, ok=True)
    with TestClient(app) as c:
        r = c.get("/healthcheck")
    assert r.status_code == 200
    assert r.json()["status"] == "healthy"


def test_healthcheck_db_failure(monkeypatch):
    app = _app_with_fake_db(monkeypatch, ok=False)
    with TestClient(app) as c:
        r = c.get("/healthcheck")
    assert r.status_code == 500
    assert r.json()["status"] == "unhealthy"


def test_scheduler_status_reports_running_state(monkeypatch):
    app = _app_with_fake_db(monkeypatch, ok=True)
    with TestClient(app) as c:
        r = c.get("/healthcheck/scheduler")
    assert r.status_code == 200
    body = r.json()
    assert "scheduler_running" in body
    assert "timezone" in body
    assert isinstance(body["jobs"], list)
