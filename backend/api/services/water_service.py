"""
Water Demand Prediction Service for Urban Digital Twin.

A thin adapter that bridges backend inputs to the authoritative Water
model inference module (models/water-demand-model/src/predict.py).

Responsibilities:
- validate/normalise backend inputs
- construct the scenario the Water model expects
- call the existing inference function
- return a clean typed result
- handle model-loading errors distinctly from input errors
"""

import importlib.util
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[2]
PROJECT_ROOT = BACKEND_DIR.parent
WATER_MODEL_SRC = PROJECT_ROOT / "models" / "water-demand-model" / "src"

# ---------------------------------------------------------------------------
# Load water model modules by explicit path.
# predict.py does `from config import ...` which uses sys.path.  To avoid
# shadowing by traffic-model/src/config.py, we pre-load the water config
# and register it under the name "config" before loading predict.py.
# ---------------------------------------------------------------------------

def _load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod

# Pre-load water config so predict.py's `from config import ...` resolves here
_water_config = _load_module("config", WATER_MODEL_SRC / "config.py")
# Also pre-load feature_engineering if predict.py imports it transitively
_fe_path = WATER_MODEL_SRC / "feature_engineering.py"
if _fe_path.exists():
    _load_module("feature_engineering", _fe_path)

_water_predict = _load_module("_water_predict", WATER_MODEL_SRC / "predict.py")

# Model-native development types supported by the Water pipeline.
WATER_DEVELOPMENT_TYPES = ("residential_compound", "hospital", "mall", "school", "office")


class ModelUnavailableError(RuntimeError):
    """Raised when the trained water model artifact is missing/unloadable."""


def is_model_available() -> bool:
    try:
        _load_bundle()
        return True
    except ModelUnavailableError:
        return False


def _load_bundle():
    try:
        return _water_predict._load_model()
    except Exception as exc:  # noqa: BLE001
        raise ModelUnavailableError(str(exc)) from exc


def _to_float(value, default: float = 0.0) -> float:
    if value is None:
        return default
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def run_water_prediction(
    dev_type: str,
    zone_id: str = "",
    properties: dict | None = None,
    latitude: float | None = None,
    longitude: float | None = None,
    simulation_hour: int = 8,
    temperature_c: float = 25.0,
    month: int = 7,
    day_of_week: int = 3,
    is_weekend: bool = False,
) -> dict:
    """
    Run a water demand prediction for the given development.

    Parameters
    ----------
    dev_type : str
        Canonical development type accepted by the Water model.
    zone_id : str
        Resolved simulation zone identifier.
    properties : dict, optional
        Development properties (num_residents, num_units, num_beds,
        staff_count, num_students, num_employees, gross_leasable_area_sqm,
        visitor_capacity, gross_floor_area_sqm, floors).
    latitude / longitude : float, optional
        WGS84 coordinates (used for zone lat/lon context if needed).
    simulation_hour : int
        Hour of day (0-23).
    temperature_c : float
        Ambient temperature in degrees Celsius.
    month : int
        Month of year (1-12).
    day_of_week : int
        Day of week (0-6, Monday=0).
    is_weekend : bool
        Whether the simulation day is a weekend.

    Returns
    -------
    dict with water prediction result.

    Raises
    ------
    ValueError
        Invalid development type or out-of-range input.
    ModelUnavailableError
        Trained artifact missing or unloadable.
    """
    props = properties or {}

    if dev_type not in WATER_DEVELOPMENT_TYPES:
        raise ValueError(
            f"development_type '{dev_type}' is not supported by the water "
            f"model. Supported types: {list(WATER_DEVELOPMENT_TYPES)}"
        )

    scenario = {
        "development_type": dev_type,
        "zone_id": zone_id or "Z0000",
        "temperature_c": temperature_c,
        "hour": int(simulation_hour),
        "month": int(month),
        "day_of_week": int(day_of_week),
        "is_weekend": int(is_weekend),
        "num_residents": _to_float(props.get("num_residents")),
        "num_units": _to_float(props.get("num_units")),
        "num_beds": _to_float(props.get("num_beds")),
        "staff_count": _to_float(props.get("staff_count")),
        "num_students": _to_float(props.get("num_students")),
        "num_employees": _to_float(props.get("num_employees")),
        "gross_leasable_area_sqm": _to_float(props.get("gross_leasable_area_sqm")),
        "visitor_capacity": _to_float(props.get("visitor_capacity")),
        "gross_floor_area_sqm": _to_float(props.get("gross_floor_area_sqm")),
        "floors": int(_to_float(props.get("floors"), 1.0)),
    }

    try:
        result = _water_predict.predict(scenario)
    except ValueError:
        raise
    except Exception as exc:  # noqa: BLE001
        raise ModelUnavailableError(
            f"Water model inference failed: {exc}"
        ) from exc

    return {
        "prediction": result["prediction"],
        "unit": result["unit"],
        "prediction_liters": result["prediction_liters"],
        "model": result["model"],
        "scenario": result["scenario"],
    }
