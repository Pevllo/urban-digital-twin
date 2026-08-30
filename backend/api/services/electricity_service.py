"""
Electricity Prediction Service for Urban Digital Twin.

Bridges the simulation payload to the electricity prediction model.
Follows the same sys.path injection pattern used by simulator_service.py.
"""

import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[2]
PROJECT_ROOT = BACKEND_DIR.parent
ELECTRICITY_MODEL_DIR = PROJECT_ROOT / "models" / "electricity-model" / "src"

if str(ELECTRICITY_MODEL_DIR) not in sys.path:
    sys.path.insert(0, str(ELECTRICITY_MODEL_DIR))

from predict_egypt import predict_egypt, predict_egypt_mixed_use, predict_egypt_annual  # noqa: E402

# Default mixed-use decomposition: 40% Office, 30% Residential, 30% Commercial
DEFAULT_MIXED_USE_SPLIT = {
    "office": 0.40,
    "residential_compound": 0.30,
    "mall": 0.30,
}

MIXED_USE_TYPE_MAP = {
    "office": "Office",
    "residential_compound": "Lodging/residential",
    "mall": "Entertainment/public assembly",
}


def _derive_gfa(properties: dict, footprint_area: float, floors: int) -> float:
    """
    Derive gross floor area from available data.

    Priority:
    1. gross_floor_area_sqm (explicit)
    2. gross_leasable_area_sqm * 1.2 (mall GLA to GFA)
    3. footprint_area * floors (fallback)
    """
    gfa = properties.get("gross_floor_area_sqm")
    if gfa and gfa > 0:
        return float(gfa)

    gla = properties.get("gross_leasable_area_sqm")
    if gla and gla > 0:
        return float(gla) * 1.2

    if footprint_area and footprint_area > 0:
        f = floors if floors and floors > 0 else 1
        return float(footprint_area) * f

    return 0.0


def run_electricity_prediction(
    dev_type: str,
    latitude: float | None = None,
    longitude: float | None = None,
    properties: dict | None = None,
    simulation_hour: int = 8,
    footprint_area: float = 0.0,
    floors: int = 1,
) -> dict:
    """
    Run electricity prediction for a development.

    Parameters:
    -----------
    dev_type : str
        Development type (office, school, hospital, hotel, mall, residential_compound, mixed_use)
    latitude : float, optional
        WGS84 latitude
    longitude : float, optional
        WGS84 longitude
    properties : dict, optional
        Type-specific properties from the development
    simulation_hour : int
        Hour of day (0-23)
    footprint_area : float
        Building footprint area (width * length)
    floors : int
        Number of floors

    Returns:
    --------
    dict with electricity prediction results
    """
    props = properties or {}

    # Derive GFA
    floor_area = _derive_gfa(props, footprint_area, floors)

    if floor_area <= 0:
        return {
            "electricity_available": False,
            "reason": "Cannot determine gross floor area. Provide 'gross_floor_area_sqm' in properties.",
        }

    # Handle mixed-use decomposition
    if dev_type == "mixed_use":
        return _predict_mixed_use(floor_area, props, latitude, longitude, simulation_hour)

    # Single-type prediction
    try:
        result = predict_egypt(
            development_type=dev_type,
            floor_area=floor_area,
            latitude=latitude,
            longitude=longitude,
            hour=simulation_hour,
            calibration="CAL-3",
        )
        return {
            "electricity_available": True,
            "electricity_kwh": result["electricity_kwh"],
            "building_type": result["building_type"],
            "floor_area_sqm": result["floor_area_sqm"],
            "city": result["city"],
            "timestamp": result["timestamp"],
            "calibration": result["calibration"],
            "uncertainty": result["uncertainty"],
        }
    except Exception as e:
        return {
            "electricity_available": False,
            "reason": str(e),
        }


def _predict_mixed_use(
    total_gfa: float,
    props: dict,
    latitude: float | None,
    longitude: float | None,
    simulation_hour: int,
) -> dict:
    """Predict electricity for mixed-use with default decomposition."""
    components = []
    for dev_type, ratio in DEFAULT_MIXED_USE_SPLIT.items():
        bdg2_type = MIXED_USE_TYPE_MAP[dev_type]
        area = total_gfa * ratio
        components.append({
            "building_type": bdg2_type,
            "gross_floor_area_sqm": area,
        })

    try:
        result = predict_egypt_mixed_use(
            components_list=components,
            latitude=latitude,
            longitude=longitude,
            hour=simulation_hour,
            calibration="CAL-3",
        )
        return {
            "electricity_available": True,
            "electricity_kwh": result["electricity_kwh"],
            "building_type": "mixed_use",
            "total_floor_area_sqm": result["total_floor_area_sqm"],
            "city": result["city"],
            "timestamp": result["timestamp"],
            "calibration": result["calibration"],
            "uncertainty": result["uncertainty"],
            "components": result["components"],
            "decomposition": DEFAULT_MIXED_USE_SPLIT,
        }
    except Exception as e:
        return {
            "electricity_available": False,
            "reason": str(e),
        }
