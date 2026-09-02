"""
Production prediction pipeline for Water Demand.

Input dict → validate → feature engineering → model → prediction dict.
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))

import numpy as np
import pandas as pd
import joblib
from config import MODELS_DIR, DEVELOPMENT_TYPES

_MODEL_BUNDLE = None


def _load_model():
    global _MODEL_BUNDLE
    if _MODEL_BUNDLE is None:
        _MODEL_BUNDLE = joblib.load(MODELS_DIR / "water_demand_model.joblib")
    return _MODEL_BUNDLE


def validate_input(scenario: dict) -> dict:
    """Validate and normalise input scenario."""
    required = ["development_type", "zone_id"]
    for field in required:
        if field not in scenario:
            raise ValueError(f"Missing required field: '{field}'")

    dev_type = scenario["development_type"]
    if dev_type not in DEVELOPMENT_TYPES:
        raise ValueError(
            f"Invalid development_type: '{dev_type}'. "
            f"Must be one of: {DEVELOPMENT_TYPES}"
        )

    validated = {
        "development_type": dev_type,
        "zone_id": str(scenario.get("zone_id", "Z01")),
        "temperature_c": float(scenario.get("temperature_c", 25.0)),
        "hour": int(scenario.get("hour", 8)),
        "month": int(scenario.get("month", 7)),
        "day_of_week": int(scenario.get("day_of_week", 3)),
        "is_weekend": int(scenario.get("is_weekend", 0)),
        "num_residents": float(scenario.get("num_residents", 0)),
        "num_units": float(scenario.get("num_units", 0)),
        "num_beds": float(scenario.get("num_beds", 0)),
        "staff_count": float(scenario.get("staff_count", 0)),
        "num_students": float(scenario.get("num_students", 0)),
        "num_employees": float(scenario.get("num_employees", 0)),
        "gross_leasable_area_sqm": float(scenario.get("gross_leasable_area_sqm", 0)),
        "visitor_capacity": float(scenario.get("visitor_capacity", 0)),
        "gross_floor_area_sqm": float(scenario.get("gross_floor_area_sqm", 0)),
        "floors": int(scenario.get("floors", 1)),
    }

    if not (0 <= validated["hour"] <= 23):
        raise ValueError(f"hour must be 0-23, got {validated['hour']}")
    if not (1 <= validated["month"] <= 12):
        raise ValueError(f"month must be 1-12, got {validated['month']}")
    if not (0 <= validated["day_of_week"] <= 6):
        raise ValueError(f"day_of_week must be 0-6, got {validated['day_of_week']}")

    return validated


def _engineer_features(scenario: dict) -> dict:
    """Add domain-engineered features to match training pipeline."""
    s = scenario.copy()

    hour = s["hour"]
    temp = s["temperature_c"]

    s["hour_sin"] = np.sin(2 * np.pi * hour / 24)
    s["hour_cos"] = np.cos(2 * np.pi * hour / 24)
    s["dow_sin"] = np.sin(2 * np.pi * s["day_of_week"] / 7)
    s["dow_cos"] = np.cos(2 * np.pi * s["day_of_week"] / 7)
    s["month_sin"] = np.sin(2 * np.pi * (s["month"] - 1) / 12)
    s["month_cos"] = np.cos(2 * np.pi * (s["month"] - 1) / 12)

    s["cooling_degree"] = max(0.0, temp - 22.0)
    s["heating_degree"] = max(0.0, 18.0 - temp)

    residents = s["num_residents"]
    beds = s["num_beds"]
    students = s["num_students"]
    employees = s["num_employees"]
    gla = s["gross_leasable_area_sqm"]
    visitors = s["visitor_capacity"]
    gfa = s["gross_floor_area_sqm"]

    s["log1p_num_residents"] = np.log1p(residents)
    s["log1p_num_beds"] = np.log1p(beds)
    s["log1p_num_students"] = np.log1p(students)
    s["log1p_num_employees"] = np.log1p(employees)
    s["log1p_gross_leasable_area_sqm"] = np.log1p(gla)
    s["log1p_gross_floor_area_sqm"] = np.log1p(gfa)

    s["activity_x_cooling"] = (s["log1p_num_residents"] + s["log1p_num_beds"] +
                                s["log1p_num_students"] + s["log1p_num_employees"]) * s["cooling_degree"]

    s["is_peak_hour_morning"] = int(hour in [7, 8, 9, 10])
    s["is_peak_hour_evening"] = int(hour in [17, 18, 19, 20])
    s["is_peak_hour"] = int((7 <= hour <= 10) or (17 <= hour <= 20))

    total_pop = residents + beds + students + employees + 1
    s["per_capita_gfa"] = gfa / total_pop
    s["per_capita_gla"] = gla / total_pop

    s["temp_x_residents"] = temp * residents
    s["temp_x_beds"] = temp * beds
    s["temp_x_students"] = temp * students
    s["temp_x_employees"] = temp * employees
    s["temp_x_visitors"] = temp * visitors

    s["gfa_x_hour"] = s["log1p_gross_floor_area_sqm"] * hour
    s["gla_x_hour"] = s["log1p_gross_leasable_area_sqm"] * hour

    s["is_weekday_morning"] = int(s["is_weekend"] == 0 and hour in [7, 8, 9, 10])
    s["is_weekday_office_hour"] = int(s["is_weekend"] == 0 and 9 <= hour <= 17)

    if 0 <= hour <= 5:
        s["time_period"] = "night"
    elif 6 <= hour <= 11:
        s["time_period"] = "morning"
    elif 12 <= hour <= 17:
        s["time_period"] = "afternoon"
    else:
        s["time_period"] = "evening"

    for dt in DEVELOPMENT_TYPES:
        s[f"type_{dt}"] = int(s["development_type"] == dt)

    s["type_x_hour"] = s["development_type"] + "_h" + str(hour)
    s["type_x_is_weekend"] = s["development_type"] + "_we" + str(s["is_weekend"])

    # day_of_year placeholder (not available in pure scenario — default to mid-month)
    s["day_of_year"] = (s["month"] - 1) * 30 + 15
    s["week_of_year"] = s["day_of_year"] // 7 + 1

    return s


def predict(scenario: dict) -> dict:
    """
    Predict water demand for a given scenario.

    Parameters
    ----------
    scenario : dict with keys:
        development_type, zone_id, temperature_c, hour, month,
        day_of_week, is_weekend, num_residents, num_beds, etc.

    Returns
    -------
    dict with prediction, model info, and input echo.
    """
    validated = validate_input(scenario)
    features = _engineer_features(validated)

    bundle = _load_model()
    model = bundle["model"]
    num_feats = bundle["numeric_features"]
    cat_feats = bundle["categorical_features"]

    row = {col: features.get(col, 0) for col in num_feats + cat_feats}
    for col in cat_feats:
        row[col] = str(row[col])

    X = pd.DataFrame([row])[num_feats + cat_feats]
    pred_m3 = float(model.predict(X)[0])
    pred_m3 = max(0.0, pred_m3)

    return {
        "model": bundle["model_name"],
        "prediction": round(pred_m3, 4),
        "unit": "m3",
        "prediction_liters": round(pred_m3 * 1000, 2),
        "scenario": validated,
    }
