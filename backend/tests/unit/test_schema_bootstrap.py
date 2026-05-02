"""Unit tests for app.db.schema_bootstrap."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from app.config import Settings
from app.db.schema_bootstrap import (
    _ensure_trips_slug_column,
    ensure_schema,
    split_sql_statements,
)


def test_split_sql_statements_strips_comments_and_blanks():
    sql = """
    -- leading comment
    CREATE TABLE foo (
        id INT PRIMARY KEY
    );

    -- another comment

    INSERT INTO foo (id) VALUES (1);
    """

    stmts = split_sql_statements(sql)

    assert len(stmts) == 2
    assert "CREATE TABLE foo" in stmts[0]
    assert "id INT PRIMARY KEY" in stmts[0]
    assert stmts[1] == "INSERT INTO foo (id) VALUES (1)"


def test_split_sql_statements_drops_trailing_empty():
    # A final trailing semicolon shouldn't produce an empty "" statement.
    sql = "CREATE DATABASE foo;\nUSE foo;\n"
    stmts = split_sql_statements(sql)
    assert stmts == ["CREATE DATABASE foo", "USE foo"]


def test_split_sql_statements_empty_input():
    assert split_sql_statements("") == []
    assert split_sql_statements("-- only comments\n\n") == []


def _settings() -> Settings:
    return Settings(
        mysql_host="10.0.0.1",
        mysql_port=3306,
        mysql_user="app",
        mysql_password="secret",
        mysql_database="time2leave",
    )


def test_ensure_schema_connects_with_db_and_runs_only_table_ddl():
    """Contract: the database must exist; we open the connection
    scoped to it and skip CREATE DATABASE / USE lines so the app user
    only needs DDL on tables (not the global CREATE privilege)."""
    with patch(
        "app.db.schema_bootstrap.mysql.connector.connect"
    ) as mock_connect:
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_conn.cursor.return_value = mock_cursor
        mock_connect.return_value = mock_conn

        ensure_schema(_settings())

        kwargs = mock_connect.call_args.kwargs
        assert kwargs["database"] == "time2leave"
        assert kwargs["host"] == "10.0.0.1"
        assert kwargs["user"] == "app"
        assert kwargs["autocommit"] is True

        executed = [c.args[0] for c in mock_cursor.execute.call_args_list]
        assert all(
            not s.upper().lstrip().startswith("CREATE DATABASE")
            for s in executed
        ), "CREATE DATABASE must not be executed; the operator owns DB creation"
        assert all(
            not s.upper().lstrip().startswith("USE ") for s in executed
        ), "USE must not be executed; the connection is already scoped"
        assert any("CREATE TABLE IF NOT EXISTS users" in s for s in executed)
        assert any(
            "CREATE TABLE IF NOT EXISTS commute_samples" in s for s in executed
        )
        mock_cursor.close.assert_called_once()
        mock_conn.close.assert_called_once()


def test_ensure_schema_reraises_on_connection_failure():
    with patch(
        "app.db.schema_bootstrap.mysql.connector.connect",
        side_effect=RuntimeError("db is down"),
    ):
        with pytest.raises(RuntimeError, match="db is down"):
            ensure_schema(_settings())


def test_ensure_schema_closes_connection_when_statement_fails():
    with patch(
        "app.db.schema_bootstrap.mysql.connector.connect"
    ) as mock_connect:
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.execute.side_effect = RuntimeError("bad SQL")
        mock_conn.cursor.return_value = mock_cursor
        mock_connect.return_value = mock_conn

        with pytest.raises(RuntimeError, match="bad SQL"):
            ensure_schema(_settings())

        mock_cursor.close.assert_called_once()
        mock_conn.close.assert_called_once()


def test_ensure_schema_skips_when_file_missing(monkeypatch, tmp_path):
    missing = tmp_path / "nope.sql"
    monkeypatch.setattr("app.db.schema_bootstrap._SCHEMA_FILE", missing)
    with patch(
        "app.db.schema_bootstrap.mysql.connector.connect"
    ) as mock_connect:
        ensure_schema(_settings())
        mock_connect.assert_not_called()


# ---------------------------------------------------------------------------
# In-place `trips.slug` migration
#
# Pre-existing prod DBs were created before the slug column existed.
# `CREATE TABLE IF NOT EXISTS` won't add columns to a table that
# already exists, so the bootstrap has to detect-and-add.
# ---------------------------------------------------------------------------


def test_ensure_trips_slug_column_is_noop_when_column_already_present():
    """Brand-new schemas already have the column → no ALTER, no backfill."""
    cursor = MagicMock()
    cursor.fetchone.return_value = (1,)  # information_schema row exists.

    _ensure_trips_slug_column(cursor)

    sql = [c.args[0] for c in cursor.execute.call_args_list]
    # Exactly one read against information_schema; nothing else.
    assert len(sql) == 1
    assert "information_schema.columns" in sql[0]


def test_ensure_trips_slug_column_adds_backfills_and_locks_constraint():
    """Pre-existing trips table without the column: full three-phase migration.

    Add nullable → backfill every NULL row with a fresh hex slug →
    flip to NOT NULL + UNIQUE. Tested all together because the ordering
    is what makes it safe to apply against a live DB without violating
    the constraint mid-migration.
    """
    cursor = MagicMock()
    cursor.fetchone.return_value = None  # information_schema: not present.
    cursor.fetchall.return_value = [(11,), (12,)]  # two existing trips.

    _ensure_trips_slug_column(cursor)

    sql = [c.args[0] for c in cursor.execute.call_args_list]
    # Phase 1: add nullable.
    assert any("ALTER TABLE trips ADD COLUMN `slug`" in s for s in sql)
    assert any(
        "ALTER TABLE trips ADD COLUMN `slug` VARCHAR(16) NULL" in s
        for s in sql
    )
    # Backfill: one UPDATE per pending row.
    update_calls = [c for c in cursor.execute.call_args_list if "UPDATE trips SET slug" in c.args[0]]
    assert len(update_calls) == 2
    backfilled_ids = sorted(c.args[1][1] for c in update_calls)
    assert backfilled_ids == [11, 12]
    # Phase 3: lock down NOT NULL + UNIQUE.
    assert any(
        "ALTER TABLE trips MODIFY COLUMN `slug` VARCHAR(16) NOT NULL" in s
        for s in sql
    )
    assert any(
        "ALTER TABLE trips ADD UNIQUE KEY `uniq_trips_slug`" in s for s in sql
    )
