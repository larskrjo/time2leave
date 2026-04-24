"""Unit tests for the pure helpers in app.api.traffic_api."""

from __future__ import annotations

import math

import pandas as pd
import pytest

from app.api.traffic_api import parse_duration_minutes, process_commute_data


class TestParseDurationMinutes:
    def test_parses_seconds_suffix(self):
        assert parse_duration_minutes("3600s") == 60.0
        assert parse_duration_minutes("90s") == 1.5

    def test_zero(self):
        assert parse_duration_minutes("0s") == 0.0

    def test_missing_suffix_returns_nan(self):
        assert math.isnan(parse_duration_minutes("3600"))

    def test_non_string_returns_nan(self):
        assert math.isnan(parse_duration_minutes(None))
        assert math.isnan(parse_duration_minutes(42))

    def test_garbage_returns_nan(self):
        assert math.isnan(parse_duration_minutes("abcs"))


class TestProcessCommuteData:
    def test_empty_df(self):
        df = pd.DataFrame(
            columns=[
                "departure_time_rfc3339",
                "direction",
                "duration",
            ]
        )
        assert process_commute_data(df) == {}

    def test_pivots_by_direction(self, sample_commute_df: pd.DataFrame):
        result = process_commute_data(sample_commute_df)
        assert set(result.keys()) == {"Home → Work", "Work → Home"}

    def test_h2w_is_morning(self, sample_commute_df: pd.DataFrame):
        result = process_commute_data(sample_commute_df)
        assert result["Home → Work"]["period"] == "Morning"
        assert result["Work → Home"]["period"] == "Evening"

    def test_heatmap_values_are_median_minutes(
        self, sample_commute_df: pd.DataFrame
    ):
        result = process_commute_data(sample_commute_df)
        h2w = result["Home → Work"]["heatmap_data"]
        assert h2w["Mon"]["07:00"] == pytest.approx(40.0)
        assert h2w["Mon"]["08:00"] == pytest.approx(80.0)
        assert h2w["Tue"]["07:00"] == pytest.approx(45.0)

    def test_missing_cells_are_none(self, sample_commute_df: pd.DataFrame):
        result = process_commute_data(sample_commute_df)
        h2w = result["Home → Work"]["heatmap_data"]
        assert h2w["Mon"]["07:00"] is not None
        assert h2w["Tue"].get("08:00") is None  # No row for Tue 08:00.

    def test_weekday_order_is_mon_to_fri(self, sample_commute_df: pd.DataFrame):
        result = process_commute_data(sample_commute_df)
        assert result["Home → Work"]["weekdays"] == ["Mon", "Tue", "Wed", "Thu", "Fri"]

    def test_drops_unparseable_durations(self):
        df = pd.DataFrame(
            [
                {
                    "date_local": "2025-11-10",
                    "local_departure_time": "2025-11-10 07:00:00",
                    "departure_time_rfc3339": "2025-11-10T07:00:00-08:00",
                    "direction": "H2W",
                    "distance_meters": 1000,
                    "duration": "not-a-duration",
                    "condition": "N",
                    "status_code": "OK",
                    "status_message": "",
                },
            ]
        )
        assert process_commute_data(df) == {}

    def test_handles_mixed_utc_offsets(self):
        """Real data mixes PST (-08:00) and PDT (-07:00) offsets; pandas 2.x
        raises if we don't normalize to a common tz first."""
        df = pd.DataFrame(
            [
                {
                    "date_local": "2025-03-03",
                    "local_departure_time": "2025-03-03 07:00:00",
                    "departure_time_rfc3339": "2025-03-03T07:00:00-08:00",
                    "direction": "H2W",
                    "distance_meters": 1000,
                    "duration": "1800s",
                    "condition": "N",
                    "status_code": "OK",
                    "status_message": "",
                },
                {
                    "date_local": "2025-04-07",
                    "local_departure_time": "2025-04-07 07:00:00",
                    "departure_time_rfc3339": "2025-04-07T07:00:00-07:00",
                    "direction": "H2W",
                    "distance_meters": 1000,
                    "duration": "2400s",
                    "condition": "N",
                    "status_code": "OK",
                    "status_message": "",
                },
            ]
        )
        result = process_commute_data(df)
        assert "Home → Work" in result
        h2w = result["Home → Work"]["heatmap_data"]
        assert h2w["Mon"]["07:00"] == pytest.approx(35.0)
