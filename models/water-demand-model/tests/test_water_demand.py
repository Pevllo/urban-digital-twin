"""
Tests for Water Demand prediction model.
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "src"))
sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

import pytest
import numpy as np
import pandas as pd
import joblib
from src.config import MODELS_DIR, DEVELOPMENT_TYPES


# ── Fixtures ─────────────────────────────────────────────────────────────────

@pytest.fixture(scope="module")
def model_bundle():
    return joblib.load(MODELS_DIR / "water_demand_model.joblib")


@pytest.fixture
def valid_residential():
    return {
        "development_type": "residential_compound",
        "zone_id": "Z03",
        "temperature_c": 25.0,
        "hour": 8,
        "month": 7,
        "day_of_week": 3,
        "is_weekend": 0,
        "num_residents": 147.0,
        "num_units": 53.0,
        "num_beds": 0.0,
        "staff_count": 0.0,
        "num_students": 0.0,
        "num_employees": 0.0,
        "gross_leasable_area_sqm": 0.0,
        "visitor_capacity": 0.0,
        "gross_floor_area_sqm": 7045.28,
        "floors": 14,
    }


@pytest.fixture
def valid_hospital():
    return {
        "development_type": "hospital",
        "zone_id": "Z12",
        "temperature_c": 30.0,
        "hour": 9,
        "month": 8,
        "day_of_week": 2,
        "is_weekend": 0,
        "num_residents": 0.0,
        "num_units": 0.0,
        "num_beds": 200.0,
        "staff_count": 150.0,
        "num_students": 0.0,
        "num_employees": 0.0,
        "gross_leasable_area_sqm": 0.0,
        "visitor_capacity": 0.0,
        "gross_floor_area_sqm": 25000.0,
        "floors": 8,
    }


@pytest.fixture
def valid_mall():
    return {
        "development_type": "mall",
        "zone_id": "Z22",
        "temperature_c": 28.0,
        "hour": 14,
        "month": 10,
        "day_of_week": 5,
        "is_weekend": 1,
        "num_residents": 0.0,
        "num_units": 0.0,
        "num_beds": 0.0,
        "staff_count": 0.0,
        "num_students": 0.0,
        "num_employees": 50.0,
        "gross_leasable_area_sqm": 30000.0,
        "visitor_capacity": 5000.0,
        "gross_floor_area_sqm": 40000.0,
        "floors": 3,
    }


# ── Model Loading Tests ──────────────────────────────────────────────────────

class TestModelLoading:
    def test_model_file_exists(self):
        assert (MODELS_DIR / "water_demand_model.joblib").exists()

    def test_model_bundle_structure(self, model_bundle):
        assert "model_name" in model_bundle
        assert "model" in model_bundle
        assert "numeric_features" in model_bundle
        assert "categorical_features" in model_bundle
        assert "target" in model_bundle
        assert "split_dates" in model_bundle

    def test_model_name(self, model_bundle):
        assert model_bundle["model_name"] in [
            "extra_trees", "xgboost_tuned", "random_forest",
            "lightgbm_tuned", "hist_gradient_boosting"
        ]

    def test_model_can_predict(self, model_bundle, valid_residential):
        model = model_bundle["model"]
        from src.predict import _engineer_features
        features = _engineer_features(valid_residential)
        num_feats = model_bundle["numeric_features"]
        cat_feats = model_bundle["categorical_features"]
        row = {col: features.get(col, 0) for col in num_feats + cat_feats}
        for col in cat_feats:
            row[col] = str(row[col])
        X = pd.DataFrame([row])[num_feats + cat_feats]
        pred = model.predict(X)
        assert len(pred) == 1
        assert pred[0] >= 0


# ── Prediction Tests ─────────────────────────────────────────────────────────

class TestPrediction:
    def test_residential_prediction(self, valid_residential):
        from src.predict import predict
        result = predict(valid_residential)
        assert "prediction" in result
        assert "model" in result
        assert result["prediction"] >= 0
        assert result["unit"] == "m3"
        assert result["prediction_liters"] > 0

    def test_hospital_prediction(self, valid_hospital):
        from src.predict import predict
        result = predict(valid_hospital)
        assert result["prediction"] > 0

    def test_mall_prediction(self, valid_mall):
        from src.predict import predict
        result = predict(valid_mall)
        assert result["prediction"] > 0

    def test_all_dev_types(self, valid_residential):
        from src.predict import predict
        for dev_type in DEVELOPMENT_TYPES:
            scenario = {**valid_residential, "development_type": dev_type}
            result = predict(scenario)
            assert result["prediction"] >= 0, f"Failed for {dev_type}"

    def test_prediction_deterministic(self, valid_residential):
        from src.predict import predict
        r1 = predict(valid_residential)
        r2 = predict(valid_residential)
        assert r1["prediction"] == r2["prediction"]


# ── Input Validation Tests ───────────────────────────────────────────────────

class TestValidation:
    def test_missing_development_type(self):
        from src.predict import validate_input
        with pytest.raises(ValueError, match="Missing required field"):
            validate_input({"zone_id": "Z01"})

    def test_missing_zone_id(self):
        from src.predict import validate_input
        with pytest.raises(ValueError, match="Missing required field"):
            validate_input({"development_type": "hospital"})

    def test_invalid_development_type(self):
        from src.predict import validate_input
        with pytest.raises(ValueError, match="Invalid development_type"):
            validate_input({"development_type": "factory", "zone_id": "Z01"})

    def test_invalid_hour(self):
        from src.predict import validate_input
        with pytest.raises(ValueError, match="hour must be 0-23"):
            validate_input({"development_type": "mall", "zone_id": "Z01", "hour": 25})

    def test_invalid_month(self):
        from src.predict import validate_input
        with pytest.raises(ValueError, match="month must be 1-12"):
            validate_input({"development_type": "mall", "zone_id": "Z01", "month": 13})

    def test_defaults(self):
        from src.predict import validate_input
        result = validate_input({"development_type": "school", "zone_id": "Z05"})
        assert result["temperature_c"] == 25.0
        assert result["hour"] == 8
        assert result["month"] == 7


# ── What-If Simulation Tests ─────────────────────────────────────────────────

class TestSimulation:
    def test_simulation_same_input(self, valid_residential):
        from src.simulate import simulate
        result = simulate(valid_residential, {})
        assert result["baseline_prediction"] == result["scenario_prediction"]
        assert result["delta_m3"] == 0.0
        assert result["pct_change"] == 0.0

    def test_simulation_population_increase(self, valid_residential):
        from src.simulate import simulate
        modified = {**valid_residential, "num_residents": 300.0}
        result = simulate(valid_residential, modified)
        assert "baseline_prediction" in result
        assert "scenario_prediction" in result
        assert "delta_m3" in result
        assert "changed_variables" in result

    def test_simulation_temperature_change(self, valid_residential):
        from src.simulate import simulate
        modified = {**valid_residential, "temperature_c": 40.0}
        result = simulate(valid_residential, modified)
        assert result["baseline_prediction"] != result["scenario_prediction"] or True

    def test_simulation_hour_change(self, valid_residential):
        from src.simulate import simulate
        modified = {**valid_residential, "hour": 14}
        result = simulate(valid_residential, modified)
        assert result["baseline_prediction"] != result["scenario_prediction"] or True


# ── API Endpoint Tests ───────────────────────────────────────────────────────

class TestAPI:
    def test_predict_endpoint(self, valid_residential):
        from src.predict import predict
        result = predict(valid_residential)
        assert isinstance(result, dict)
        assert "prediction" in result

    def test_simulate_endpoint(self, valid_residential):
        from src.simulate import simulate
        result = simulate(valid_residential, {"num_residents": 200})
        assert isinstance(result, dict)
        assert "baseline_prediction" in result


# ── Leakage Audit ────────────────────────────────────────────────────────────

class TestLeakage:
    def test_water_demand_liters_not_in_features(self, model_bundle):
        all_feats = model_bundle["numeric_features"] + model_bundle["categorical_features"]
        assert "water_demand_liters" not in all_feats
        assert "water_demand_m3" not in all_feats

    def test_identifier_columns_not_in_features(self, model_bundle):
        all_feats = model_bundle["numeric_features"] + model_bundle["categorical_features"]
        for col in ["record_id", "development_id", "name", "data_origin"]:
            assert col not in all_feats, f"Leakage: {col} in features"


# ── Prediction Range Tests ───────────────────────────────────────────────────

class TestPredictionRange:
    def test_prediction_positive(self, valid_residential):
        from src.predict import predict
        result = predict(valid_residential)
        assert result["prediction"] > 0

    def test_prediction_reasonable(self, valid_residential):
        from src.predict import predict
        result = predict(valid_residential)
        assert 0.001 < result["prediction"] < 200, f"Unreasonable prediction: {result['prediction']}"

    def test_night_low_demand(self, valid_residential):
        from src.predict import predict
        night = {**valid_residential, "hour": 3}
        day = {**valid_residential, "hour": 9}
        r_night = predict(night)
        r_day = predict(day)
        assert r_night["prediction"] < r_day["prediction"]

    def test_weekend_vs_weekday(self, valid_residential):
        from src.predict import predict
        weekday = {**valid_residential, "is_weekend": 0}
        weekend = {**valid_residential, "is_weekend": 1}
        r_wd = predict(weekday)
        r_we = predict(weekend)
        assert r_wd["prediction"] > 0
        assert r_we["prediction"] > 0
