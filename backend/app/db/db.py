"""MySQL connection pool wiring.

The pool is created lazily on first use so that importing this module does
not require a reachable database (important for tests and local tooling
that don't need a DB).
"""

from __future__ import annotations

from threading import Lock
from typing import Any

from mysql.connector import pooling

from app.config import get_settings

_pool: pooling.MySQLConnectionPool | None = None
_pool_lock = Lock()


def _build_pool() -> pooling.MySQLConnectionPool:
    settings = get_settings()
    dbconfig: dict[str, Any] = {
        "host": settings.mysql_host,
        "port": settings.mysql_port,
        "user": settings.mysql_user,
        "password": settings.mysql_password,
        "database": settings.mysql_database,
        "autocommit": True,
    }
    return pooling.MySQLConnectionPool(
        pool_name="traffic-bay-area",
        pool_size=settings.mysql_pool_size,
        **dbconfig,
    )


def get_pool() -> pooling.MySQLConnectionPool:
    """Return the process-wide connection pool, creating it on first call."""
    global _pool
    if _pool is None:
        with _pool_lock:
            if _pool is None:
                _pool = _build_pool()
    return _pool


def reset_pool_for_tests() -> None:
    """Drop the cached pool. Tests only."""
    global _pool
    _pool = None


class _PoolProxy:
    """Backwards-compat proxy so legacy `from app.db.db import pool` works."""

    def get_connection(self):
        return get_pool().get_connection()


pool: _PoolProxy = _PoolProxy()


class Database:
    """Context manager that yields a cursor backed by a pooled connection."""

    conn: Any | None
    cursor: Any | None

    def __init__(self) -> None:
        self.conn = None
        self.cursor = None

    def __enter__(self) -> Any:
        self.conn = get_pool().get_connection()
        self.cursor = self.conn.cursor()
        self.cursor.execute("SET time_zone = '+00:00'")
        return self.cursor

    def __exit__(self, exc_type, exc_val, exc_tb) -> None:
        if self.conn is not None:
            if exc_type:
                self.conn.rollback()
            else:
                self.conn.commit()
        if self.cursor is not None:
            self.cursor.close()
        if self.conn is not None:
            self.conn.close()
