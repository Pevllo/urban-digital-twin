"""
Inference API for New Building Electricity Demand Prediction.

Loads the trained BDG2 Linear Regression model and provides predict_new_building()
with prediction uncertainty bounds.

Adapted from electricity_model/src/predict_new_building.py for Urban Digital Twin integration.
"""

from __future__ import annotations

import os
import sys

# Ensure models/electricity-model/src is in sys.path
_DIR = os.path.dirname(os.path.abspath(__file__))
if _DIR not in sys.path:
    sys.path.insert(0, _DIR)

import joblib
import numpy as np
import pandas as pd
from datetime import datetime

_PARENT = os.path.dirname(_DIR)
MODEL_PATH = os.path.join(_PARENT, "models", "step5", "electricity_new_building_model_final.joblib")
_MODEL_CACHE = None

# Empirical 1-sigma residual standard deviation from validation
RESIDUAL_STD_KWH = 88.47

# Register feature engineering function so joblib unpickling works
from feature_engineering import add_engineered_features_step5  # noqa: E402

main_module = sys.modules.get("__main__")
if main_module is not None and not hasattr(main_module, "add_engineered_features_step5"):
    setattr(main_module, "add_engineered_features_step5", add_engineered_features_step5)


def load_model():
    """Load and cache the trained model artifact."""
    global _MODEL_CACHE
    if _MODEL_CACHE is None:
        cur_main = sys.modules.get("__main__")
        if cur_main is not None and not hasattr(cur_main, "add_engineered_features_step5"):
            setattr(cur_main, "add_engineered_features_step5", add_engineered_features_step5)

        if os.path.exists(MODEL_PATH):
            _MODEL_CACHE = joblib.load(MODEL_PATH)
        else:
            raise FileNotFoundError(f"Model file not found: {MODEL_PATH}")
    return _MODEL_CACHE


def predict_new_building(
    building_type: str,
    floor_area: float,
    timestamp: datetime | str | None = None,
    weather: dict | float | None = None,
    location: dict | None = None,
    return_uncertainty: bool = True
) -> dict:
    """
    Predict hourly electricity demand (kWh) for a new building development.

    Parameters:
    -----------
    building_type : str
        Space usage category (e.g. 'Office', 'Education', 'Healthcare')
    floor_area : float
        Building gross floor area in square meters (sqm)
    timestamp : datetime or str, optional
        Target prediction time (defaults to current time if None)
    weather : dict or float, optional
        Weather parameters (airTemperature, dewTemperature, relative_humidity, windSpeed).
        If float, interpreted as airTemperature in °C.
    location : dict, optional
        Location identifiers (site_id, lat, lng)
    return_uncertainty : bool, default=True
        Whether to calculate 1-sigma residual uncertainty bounds.

    Returns:
    --------
    dict containing predicted_kwh, lower_bound, upper_bound, and input parameters.
    """
    model = load_model()

    # Parse timestamp
    if timestamp is None:
        dt = pd.to_datetime(datetime.now())
    elif isinstance(timestamp, str):
        dt = pd.to_datetime(timestamp)
    elif isinstance(timestamp, datetime):
        dt = pd.to_datetime(timestamp)
    else:
        dt = pd.to_datetime(timestamp)

    hour = dt.hour
    dow = dt.dayofweek
    month = dt.month
    is_weekend = 1 if dow >= 5 else 0

    # Parse weather
    if weather is None:
        temp = 22.0
        dew_temp = 12.0
        rel_hum = 50.0
        wind_spd = 3.5
    elif isinstance(weather, (int, float)):
        temp = float(weather)
        dew_temp = temp - 10.0
        rel_hum = 55.0
        wind_spd = 3.5
    elif isinstance(weather, dict):
        temp = float(weather.get("airTemperature", 22.0))
        dew_temp = float(weather.get("dewTemperature", 12.0))
        rel_hum = float(weather.get("relative_humidity", 50.0))
        wind_spd = float(weather.get("windSpeed", 3.5))

    # Parse location
    if location is None:
        site_id = "missing"
        lat = 30.0
        lng = 31.0
    else:
        site_id = str(location.get("site_id", "missing"))
        lat = float(location.get("lat", 30.0))
        lng = float(location.get("lng", 31.0))

    # Construct single-row DataFrame matching training input schema
    input_df = pd.DataFrame([{
        "building_id": "new_dev_001",
        "site_id": site_id,
        "sqm": float(floor_area),
        "primaryspaceusage": str(building_type),
        "lat": lat,
        "lng": lng,
        "hour": float(hour),
        "day_of_week": float(dow),
        "month": float(month),
        "is_weekend": float(is_weekend),
        "airTemperature": temp,
        "dewTemperature": dew_temp,
        "relative_humidity": rel_hum,
        "windSpeed": wind_spd
    }])

    # Run inference
    predicted_kwh = float(np.maximum(0.0, model.predict(input_df)[0]))

    res = {
        "building_type": building_type,
        "floor_area_m2": floor_area,
        "timestamp": dt.strftime("%Y-%m-%d %H:%M:%S"),
        "hour": hour,
        "temperature_c": temp,
        "predicted_electricity_kwh": round(predicted_kwh, 2),
        "predicted_kwh": round(predicted_kwh, 2),
        "predicted_demand_kwh": round(predicted_kwh, 2),
    }

    if return_uncertainty:
        lower_bnd = max(0.0, round(predicted_kwh - RESIDUAL_STD_KWH, 2))
        upper_bnd = round(predicted_kwh + RESIDUAL_STD_KWH, 2)
        res["lower_bound_kwh"] = lower_bnd
        res["upper_bound_kwh"] = upper_bnd
        res["uncertainty_std_kwh"] = RESIDUAL_STD_KWH

    return res
