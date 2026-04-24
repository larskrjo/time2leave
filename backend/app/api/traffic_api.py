"""
Public commute heatmap endpoints.

The router exposes aggregated commute durations for the frontend heatmap.
The MySQL pool is accessed through a FastAPI dependency so tests can
override it without monkey-patching imports.
"""

from __future__ import annotations

import warnings
from typing import Any

import numpy as np
import pandas as pd
from fastapi import APIRouter, Depends, HTTPException
from mysql.connector import Error

from app.db.db import get_pool

# Suppress pandas warning about mysql-connector compatibility.
warnings.filterwarnings(
    "ignore",
    message=".*SQLAlchemy connectable.*",
    category=UserWarning,
    module="pandas",
)

traffic_router = APIRouter(prefix="/api/v1", tags=["Traffic Commute API"])


def get_connection_pool() -> Any:
    """FastAPI dependency that returns the shared MySQL connection pool."""
    return get_pool()


def parse_duration_minutes(val: Any) -> float:
    """Convert a Google-style duration string like '3720s' into minutes.

    Returns NaN for anything that cannot be parsed.
    """
    if isinstance(val, str) and val.endswith("s"):
        try:
            return int(val[:-1]) / 60.0
        except Exception:
            return np.nan
    return np.nan


def get_commute_data_from_db(pool: Any) -> pd.DataFrame:
    """Fetch commute rows from MySQL as a DataFrame."""
    connection = pool.get_connection()
    try:
        query = """
        SELECT
            date_local,
            local_departure_time,
            departure_time_rfc3339,
            direction,
            distance_meters,
            duration,
            `condition`,
            status_code,
            status_message
        FROM commute_slots
        WHERE duration IS NOT NULL
          AND duration != ''
        ORDER BY departure_time_rfc3339
        """
        df = pd.read_sql(query, connection)
        return df
    except Error as e:
        raise HTTPException(
            status_code=500, detail=f"Database error: {str(e)}"
        ) from e
    finally:
        if connection.is_connected():
            connection.close()


def process_commute_data(df: pd.DataFrame) -> dict[str, dict]:
    """Pivot the raw commute rows into the nested dict the frontend expects."""
    if df.empty:
        return {}

    df["minutes"] = df["duration"].apply(parse_duration_minutes)
    df = df[df["minutes"].notna()]

    # `departure_time_rfc3339` mixes UTC offsets (`-08:00` for PST rows and
    # `-07:00` for PDT rows within the same dataset), so we must parse with
    # `utc=True` to unify them, then convert back to the canonical local zone
    # so weekday/hour bucketing is on wall-clock time instead of UTC.
    df["ts"] = pd.to_datetime(
        df["departure_time_rfc3339"], errors="coerce", utc=True
    ).dt.tz_convert("America/Los_Angeles")
    df = df[df["ts"].notna()]

    df["direction"] = df["direction"].replace(
        {"H2W": "Home → Work", "W2H": "Work → Home"}
    )

    weekday_map = {0: "Mon", 1: "Tue", 2: "Wed", 3: "Thu", 4: "Fri", 5: "Sat", 6: "Sun"}
    df["weekday_num"] = df["ts"].dt.weekday
    df["weekday"] = df["weekday_num"].map(weekday_map)
    df["time_hm"] = df["ts"].dt.strftime("%H:%M")

    weekday_order = ["Mon", "Tue", "Wed", "Thu", "Fri"]
    result: dict[str, dict] = {}

    for direction_label in sorted(df["direction"].dropna().unique()):
        ddir = df[df["direction"] == direction_label].copy()
        if ddir.empty:
            continue

        monday = ddir["ts"].dt.date.min()
        friday = ddir["ts"].dt.date.max()
        date_range = f"{monday:%b. %d} – {friday:%b. %d}"

        hours = ddir["ts"].dt.hour
        period_label = "Morning" if hours.max() <= 14 else "Evening"

        times_sorted = sorted(ddir["time_hm"].unique())
        pivot = ddir.pivot_table(
            index="weekday", columns="time_hm", values="minutes", aggfunc="median"
        )
        pivot = pivot.reindex(index=weekday_order, columns=times_sorted)

        heatmap_data: dict[str, dict[str, float | None]] = {}
        for weekday in weekday_order:
            if weekday in pivot.index:
                heatmap_data[weekday] = {}
                for time_hm in times_sorted:
                    if time_hm in pivot.columns:
                        value = pivot.loc[weekday, time_hm]
                        heatmap_data[weekday][time_hm] = (
                            float(value) if not pd.isna(value) else None
                        )

        result[direction_label] = {
            "period": period_label,
            "date_range": date_range,
            "heatmap_data": heatmap_data,
            "weekdays": weekday_order,
            "times": times_sorted,
        }

    return result


@traffic_router.get("/")
async def root():
    """Root endpoint."""
    return {"message": "Traffic Commute API", "version": "1.0.0"}


@traffic_router.get("/commute/heatmap")
async def get_commute_heatmap_data(
    direction: str | None = None,
    pool: Any = Depends(get_connection_pool),
):
    """Return the commute heatmap payload, optionally filtered by direction."""
    try:
        df = get_commute_data_from_db(pool)
        result = process_commute_data(df)

        if direction:
            if direction not in result:
                raise HTTPException(
                    status_code=404, detail=f"Direction '{direction}' not found"
                )
            return {direction: result[direction]}

        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Error processing data: {str(e)}"
        ) from e


@traffic_router.get("/commute/directions")
async def get_directions(pool: Any = Depends(get_connection_pool)):
    """Return the list of direction labels present in the dataset."""
    try:
        df = get_commute_data_from_db(pool)
        result = process_commute_data(df)
        return {"directions": list(result.keys())}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}") from e
