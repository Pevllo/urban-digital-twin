"""
Egypt Prediction API — Final electricity demand prediction for Egyptian buildings.

Extends the BDG2 Linear Regression model with Egyptian-specific calibration.
Adapted from electricity_model/src/predict_egypt.py for Urban Digital Twin integration.

Public API:
    predict_egypt(...)             — single hourly prediction
    predict_egypt_annual(...)      — annual consumption estimate
    predict_egypt_mixed_use(...)   — mixed-use decomposition
"""

from __future__ import annotations

import os
import sys
import warnings
import numpy as np
import pandas as pd

# Ensure this directory is in sys.path
_DIR = os.path.dirname(os.path.abspath(__file__))
if _DIR not in sys.path:
    sys.path.insert(0, _DIR)

from egypt_config import (
    EGYPTIAN_CITIES, CityClimate,
    CALIBRATION_FACTOR_GLOBAL, SECTOR_ADJUSTMENT,
    HEAT_CORRECTION_THRESHOLD, HEAT_CORRECTION_FACTOR,
    BDG2_TO_EGYPT_SECTOR,
    DEVELOPMENT_TYPE_TO_BDG2,
    SUPPORTED_BDG2_TYPES,
    MODEL_VERSION,
    CAIRO,
)
from predict_new_building import predict_new_building, RESIDUAL_STD_KWH

warnings.filterwarnings("ignore")


# ---------------------------------------------------------------------------
# Weather Generation
# ---------------------------------------------------------------------------

def get_egyptian_weather(city: CityClimate, month: int, hour: int) -> dict:
    """Generate realistic weather input for an Egyptian city from real climate data."""
    idx = month - 1
    temp_mean = city.monthly_temp_mean[idx]
    temp_max = city.monthly_temp_max[idx]
    temp_min = city.monthly_temp_min[idx]
    humidity = city.monthly_humidity[idx]
    wind = city.monthly_wind[idx]

    hour_factor = np.sin(np.pi * (hour - 5) / 14) if 5 <= hour <= 19 else -0.3
    temp_range = temp_max - temp_min
    temp = temp_mean + hour_factor * temp_range * 0.5

    humidity_adj = humidity - (temp - temp_mean) * 1.5
    humidity_adj = max(15, min(90, humidity_adj))

    return {
        "airTemperature": round(temp, 1),
        "dewTemperature": round(temp - 8, 1),
        "relative_humidity": round(humidity_adj, 1),
        "windSpeed": round(wind, 1),
    }


# ---------------------------------------------------------------------------
# Input Validation
# ---------------------------------------------------------------------------

def _resolve_building_type(
    building_type: str | None = None,
    development_type: str | None = None,
) -> str:
    """Resolve a BDG2 building type from either BDG2 type or development_type."""
    if building_type is not None:
        bt = building_type.strip()
        if bt in SUPPORTED_BDG2_TYPES:
            return bt
        for supported in SUPPORTED_BDG2_TYPES:
            if bt.lower() == supported.lower():
                return supported
        raise ValueError(
            f"Unknown building_type: '{bt}'. Supported: {SUPPORTED_BDG2_TYPES}"
        )

    if development_type is not None:
        dt = development_type.strip()
        if dt == "mixed_use":
            raise ValueError(
                "mixed_use cannot be mapped to a single building type. "
                "Use predict_egypt_mixed_use() or provide a building_type."
            )
        if dt in DEVELOPMENT_TYPE_TO_BDG2:
            return DEVELOPMENT_TYPE_TO_BDG2[dt]
        raise ValueError(
            f"Unknown development_type: '{dt}'. "
            f"Supported: {list(DEVELOPMENT_TYPE_TO_BDG2.keys())}"
        )

    raise ValueError("Either building_type or development_type must be provided.")


def _resolve_location(
    city: str | None = None,
    latitude: float | None = None,
    longitude: float | None = None,
) -> tuple[str, CityClimate]:
    """Resolve location to (city_name, CityClimate)."""
    if city is not None:
        if city in EGYPTIAN_CITIES:
            return city, EGYPTIAN_CITIES[city]
        for name in EGYPTIAN_CITIES:
            if city.lower() == name.lower():
                return name, EGYPTIAN_CITIES[name]
        raise ValueError(
            f"Unknown city: '{city}'. Available: {list(EGYPTIAN_CITIES.keys())}"
        )

    if latitude is not None and longitude is not None:
        best_name = None
        best_dist = float("inf")
        for name, c in EGYPTIAN_CITIES.items():
            d = ((latitude - c.latitude) ** 2 + (longitude - c.longitude) ** 2) ** 0.5
            if d < best_dist:
                best_dist = d
                best_name = name
        return best_name, EGYPTIAN_CITIES[best_name]

    return "Cairo", CAIRO


def _parse_timestamp(timestamp: str | None, month: int | None, hour: int | None) -> tuple[int, int, str]:
    """Parse timestamp or month/hour into (month, hour, timestamp_str)."""
    if timestamp is not None:
        dt = pd.to_datetime(timestamp)
        return dt.month, dt.hour, dt.strftime("%Y-%m-%d %H:%M:%S")

    m = month if month is not None else 7
    h = hour if hour is not None else 14
    ts = f"2026-{m:02d}-15 {h:02d}:00:00"
    return m, h, ts


# ---------------------------------------------------------------------------
# Single Hourly Prediction
# ---------------------------------------------------------------------------

def predict_egypt(
    building_type: str | None = None,
    floor_area: float | None = None,
    city: str | None = None,
    month: int | None = None,
    hour: int | None = None,
    timestamp: str | None = None,
    weather: dict | None = None,
    calibration: str = "CAL-3",
    latitude: float | None = None,
    longitude: float | None = None,
    development_type: str | None = None,
    floors: int | None = None,
    occupants: int | None = None,
    return_components: bool = False,
) -> dict:
    """
    Predict electricity demand for an Egyptian building.

    Parameters:
    -----------
    building_type : str, optional
        BDG2 building type (Office, Education, Healthcare, etc.)
    development_type : str, optional
        Urban Digital Twin type (office, school, hospital, etc.)
    floor_area : float
        Building gross floor area in m² (required)
    city : str, optional
        Egyptian city name (Cairo, Alexandria, Luxor, Aswan)
    latitude : float, optional
        Latitude (used to resolve nearest city if city not provided)
    longitude : float, optional
        Longitude (used to resolve nearest city if city not provided)
    month : int, optional
        Month (1-12). Defaults to 7 if timestamp not provided.
    hour : int, optional
        Hour of day (0-23). Defaults to 14 if timestamp not provided.
    timestamp : str, optional
        Full timestamp string (overrides month/hour)
    weather : dict, optional
        Weather dict (overrides auto-generated from city)
    calibration : str
        Calibration method: CAL-0, CAL-1, CAL-2, CAL-3
    return_components : bool
        If True, include breakdown of adjustment components

    Returns:
    --------
    dict with electricity_kwh, uncertainty, and metadata
    """
    if floor_area is None:
        raise ValueError(f"floor_area must be a positive number. Got: {floor_area}")
    try:
        fa_val = float(floor_area)
    except (TypeError, ValueError):
        raise ValueError(f"floor_area must be a positive number. Got: {floor_area}")
    if fa_val != fa_val or fa_val <= 0:
        raise ValueError(f"floor_area must be a positive number. Got: {floor_area}")

    resolved_type = _resolve_building_type(building_type, development_type)
    city_name, city_data = _resolve_location(city, latitude, longitude)
    resolved_month, resolved_hour, timestamp_str = _parse_timestamp(timestamp, month, hour)

    if weather is None:
        weather = get_egyptian_weather(city_data, month=resolved_month, hour=resolved_hour)

    location = {"lat": city_data.latitude, "lng": city_data.longitude, "site_id": city_name.lower()}

    raw_result = predict_new_building(
        building_type=resolved_type,
        floor_area=floor_area,
        timestamp=timestamp_str,
        weather=weather,
        location=location,
        return_uncertainty=True,
    )
    predicted = raw_result["predicted_electricity_kwh"]

    factor = 1.0
    components = {}

    if calibration == "CAL-0":
        factor = 1.0
        components["description"] = "Raw BDG2 model (no calibration)"
    elif calibration == "CAL-1":
        factor = CALIBRATION_FACTOR_GLOBAL
        components["global_factor"] = factor
        components["description"] = "Global Egyptian scale factor"
    elif calibration == "CAL-2":
        factor = 1.0
        temp = weather.get("airTemperature", 22.0) if isinstance(weather, dict) else float(weather)
        if temp > HEAT_CORRECTION_THRESHOLD:
            excess = temp - HEAT_CORRECTION_THRESHOLD
            correction = 1.0 + (HEAT_CORRECTION_FACTOR - 1.0) * (excess / 10.0)
            factor *= correction
            components["heat_correction"] = round(correction, 4)
            components["temperature"] = temp
        components["description"] = "Climate-adjusted (Egyptian weather + heat correction)"
    elif calibration == "CAL-3":
        factor = 1.0
        temp = weather.get("airTemperature", 22.0) if isinstance(weather, dict) else float(weather)
        if temp > HEAT_CORRECTION_THRESHOLD:
            excess = temp - HEAT_CORRECTION_THRESHOLD
            correction = 1.0 + (HEAT_CORRECTION_FACTOR - 1.0) * (excess / 10.0)
            factor *= correction
            components["heat_correction"] = round(correction, 4)
        sector_factor = SECTOR_ADJUSTMENT.get(resolved_type, 0.90)
        factor *= sector_factor
        components["sector_factor"] = sector_factor
        components["sector"] = BDG2_TO_EGYPT_SECTOR.get(resolved_type, "commercial_and_others")
        components["description"] = "Climate + sector adjustment"
    else:
        raise ValueError(f"Unknown calibration: '{calibration}'. Use CAL-0, CAL-1, CAL-2, CAL-3")

    final_kwh = predicted * factor

    result = {
        "electricity_kwh": round(final_kwh, 2),
        "predicted_kwh": round(final_kwh, 2),
        "building_type": resolved_type,
        "floor_area_sqm": floor_area,
        "floor_area_m2": floor_area,
        "city": city_name,
        "latitude": city_data.latitude,
        "longitude": city_data.longitude,
        "timestamp": timestamp_str,
        "month": resolved_month,
        "hour": resolved_hour,
        "calibration": calibration,
        "calibration_factor": round(factor, 4),
        "raw_kwh": round(predicted, 2),
        "weather": weather,
        "uncertainty": {
            "lower_kwh": round(max(0, final_kwh - RESIDUAL_STD_KWH), 2),
            "upper_kwh": round(final_kwh + RESIDUAL_STD_KWH, 2),
            "std_kwh": RESIDUAL_STD_KWH,
        },
        "metadata": {
            "model_version": MODEL_VERSION,
            "model_type": "Linear Regression",
            "training_data": "Real BDG2",
            "synthetic_egyptian_data": "NOT USED",
        },
    }

    if return_components:
        result["components"] = components

    return result


# ---------------------------------------------------------------------------
# Mixed-Use Prediction
# ---------------------------------------------------------------------------

def predict_egypt_mixed_use(
    components_list: list[dict],
    city: str | None = None,
    month: int | None = None,
    hour: int | None = None,
    timestamp: str | None = None,
    weather: dict | None = None,
    calibration: str = "CAL-3",
    latitude: float | None = None,
    longitude: float | None = None,
) -> dict:
    """
    Predict electricity demand for a mixed-use development.

    Parameters:
    -----------
    components_list : list of dict
        Each dict must have 'building_type' and 'gross_floor_area_sqm'.
    """
    if not components_list:
        raise ValueError("components_list must not be empty")

    results = []
    total_kwh = 0.0

    for comp in components_list:
        bt = comp.get("building_type")
        fa = comp.get("gross_floor_area_sqm") or comp.get("floor_area_sqm")
        if bt is None or fa is None:
            raise ValueError(
                f"Each component must have 'building_type' and 'gross_floor_area_sqm'. Got: {comp}"
            )
        r = predict_egypt(
            building_type=bt,
            floor_area=fa,
            city=city,
            month=month,
            hour=hour,
            timestamp=timestamp,
            weather=weather,
            calibration=calibration,
            latitude=latitude,
            longitude=longitude,
        )
        results.append({
            "building_type": bt,
            "floor_area_sqm": fa,
            "electricity_kwh": r["electricity_kwh"],
        })
        total_kwh += r["electricity_kwh"]

    city_name, _ = _resolve_location(city, latitude, longitude)
    _, _, ts = _parse_timestamp(timestamp, month, hour)

    return {
        "electricity_kwh": round(total_kwh, 2),
        "building_type": "mixed_use",
        "total_floor_area_sqm": sum(c.get("gross_floor_area_sqm", 0) for c in components_list),
        "city": city_name,
        "timestamp": ts,
        "calibration": calibration,
        "components": results,
        "uncertainty": {
            "lower_kwh": round(max(0, total_kwh - RESIDUAL_STD_KWH * len(components_list) ** 0.5), 2),
            "upper_kwh": round(total_kwh + RESIDUAL_STD_KWH * len(components_list) ** 0.5, 2),
        },
    }


# ---------------------------------------------------------------------------
# Annual Prediction
# ---------------------------------------------------------------------------

def predict_egypt_annual(
    building_type: str | None = None,
    floor_area: float | None = None,
    city: str = "Cairo",
    calibration: str = "CAL-3",
    development_type: str | None = None,
    latitude: float | None = None,
    longitude: float | None = None,
) -> dict:
    """Predict annual electricity consumption for an Egyptian building."""
    if floor_area is None:
        raise ValueError(f"floor_area must be a positive number. Got: {floor_area}")
    try:
        fa_val = float(floor_area)
    except (TypeError, ValueError):
        raise ValueError(f"floor_area must be a positive number. Got: {floor_area}")
    if fa_val != fa_val or fa_val <= 0:
        raise ValueError(f"floor_area must be a positive number. Got: {floor_area}")

    resolved_type = _resolve_building_type(building_type, development_type)
    city_name, city_data = _resolve_location(city, latitude, longitude)

    monthly_kwh = []
    peak_kwh = 0.0
    peak_ts = ""

    for m in range(1, 13):
        month_total = 0.0
        for h in [6, 9, 12, 15, 18, 21]:
            weather = get_egyptian_weather(city_data, month=m, hour=h)
            ts = f"2026-{m:02d}-15 {h:02d}:00:00"
            r = predict_egypt(
                building_type=resolved_type,
                floor_area=floor_area,
                city=city_name,
                month=m,
                hour=h,
                timestamp=ts,
                weather=weather,
                calibration=calibration,
            )
            hourly_kwh = r["electricity_kwh"]
            month_total += hourly_kwh * (730 / 6)
            if hourly_kwh > peak_kwh:
                peak_kwh = hourly_kwh
                peak_ts = ts
        monthly_kwh.append(round(month_total, 0))

    annual_total = sum(monthly_kwh)
    avg_hourly = annual_total / 8760 if annual_total > 0 else 0

    return {
        "building_type": resolved_type,
        "floor_area_sqm": floor_area,
        "city": city_name,
        "calibration": calibration,
        "monthly_kwh": monthly_kwh,
        "annual_kwh": round(annual_total, 0),
        "average_hourly_kwh": round(avg_hourly, 2),
        "peak_kwh": round(peak_kwh, 2),
        "peak_timestamp": peak_ts,
        "eui_kwh_m2": round(annual_total / floor_area, 1),
    }
