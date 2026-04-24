"""Apply table DDL from `db/init/001_schema.sql` at app startup.

The schema is authored to be idempotent (every `CREATE TABLE` uses
`IF NOT EXISTS`), so we can safely run it on every boot. That buys us:

  * Prod cutovers: pointing `MYSQL_DATABASE` at a freshly-created
    database (e.g. operator runs `CREATE DATABASE time2leave;`) no
    longer needs a separate schema-apply step. The app creates the
    tables itself on first boot.
  * Dev resilience: adding a new table no longer requires `make clean`
    to wipe the MySQL volume and re-run the container's
    `/docker-entrypoint-initdb.d` scripts.

Contract: **the database itself must already exist.** Creating it is
the operator's job (in dev: docker-mysql does it from `MYSQL_DATABASE`;
in prod: a one-time `CREATE DATABASE` by whoever has root). The app
user from AWS Secrets Manager only needs DDL on tables inside that
database, not the global `CREATE` privilege. We strip any
`CREATE DATABASE` / `USE` statements out of the schema before
executing — they're kept in the file for human readers and for
docker-mysql's first-boot path.

We intentionally do NOT apply the `002_seed.sql` fixture from here —
that's local-dev data (a hardcoded `dev@example.com` user plus 840
fixture commute samples) and has no business in prod.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

import mysql.connector

from app.config import Settings, get_settings

logger = logging.getLogger(__name__)

_SCHEMA_FILE = (
    Path(__file__).resolve().parents[2] / "db" / "init" / "001_schema.sql"
)


_SKIP_PREFIXES = ("CREATE DATABASE", "USE ")


def split_sql_statements(text: str) -> list[str]:
    """Split a semicolon-delimited SQL file into individual statements.

    The parser is intentionally minimal: it strips line comments
    (`-- ...`) and blank lines, then splits on `;`. It doesn't handle
    semicolons inside string literals, stored procedures, or triggers
    — none of which appear in `001_schema.sql`.
    """
    cleaned: list[str] = []
    for line in text.splitlines():
        stripped = line.strip()
        if stripped.startswith("--") or not stripped:
            continue
        cleaned.append(line)
    joined = "\n".join(cleaned)
    return [s.strip() for s in joined.split(";") if s.strip()]


def _table_only_statements(text: str) -> list[str]:
    """Drop `CREATE DATABASE` / `USE` lines; the DB is the operator's job."""
    return [
        s
        for s in split_sql_statements(text)
        if not s.upper().lstrip().startswith(_SKIP_PREFIXES)
    ]


def _connect(settings: Settings) -> Any:
    """Open a connection scoped to the configured database."""
    return mysql.connector.connect(
        host=settings.mysql_host,
        port=settings.mysql_port,
        user=settings.mysql_user,
        password=settings.mysql_password,
        database=settings.mysql_database,
        autocommit=True,
    )


def ensure_schema(settings: Settings | None = None) -> None:
    """Apply the table DDL to MySQL. Idempotent and safe to retry.

    The target database (`settings.mysql_database`) must already exist;
    we connect with `database=...` and only run the table-level DDL.
    """
    settings = settings or get_settings()
    if not _SCHEMA_FILE.exists():
        logger.warning(
            "Schema file %s not found; skipping schema bootstrap", _SCHEMA_FILE
        )
        return

    statements = _table_only_statements(_SCHEMA_FILE.read_text())
    if not statements:
        return

    logger.info(
        "Applying schema from %s (%d statements) to %s@%s:%s/%s",
        _SCHEMA_FILE.name,
        len(statements),
        settings.mysql_user,
        settings.mysql_host,
        settings.mysql_port,
        settings.mysql_database,
    )
    conn = _connect(settings)
    try:
        cursor = conn.cursor()
        try:
            for stmt in statements:
                cursor.execute(stmt)
        finally:
            cursor.close()
    finally:
        conn.close()
    logger.info(
        "Schema bootstrap complete; %s is ready", settings.mysql_database
    )
