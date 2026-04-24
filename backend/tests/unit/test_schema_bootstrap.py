"""Unit tests for app.db.schema_bootstrap."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from app.config import Settings
from app.db.schema_bootstrap import ensure_schema, split_sql_statements


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
