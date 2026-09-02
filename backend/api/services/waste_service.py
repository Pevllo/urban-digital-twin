"""
Solid Waste Generation Prediction Service for Urban Digital Twin.

A thin adapter that bridges backend inputs to the standalone Waste
inference module (models/solid-waste-model/src/predict.py).

Responsibilities:
- validate/normalise backend inputs
- construct the scenario the Waste model expects
- call the existing inference function
- return a clean typed result
- handle model-loading errors distinctly from input errors
"""

import importlib.util
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[2]
PROJECT_ROOT = BACKEND_DIR.parent
WASTE_MODEL_SRC = PROJECT_ROOT / "models" / "solid-waste-model" / "src"

# ---------------------------------------------------------------------------
# Load waste model's predict module by explicit path.
# Avoids sys.path shadowing by traffic-model/src predict.py.
# ---------------------------------------------------------------------------

def _load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod

_waste_predict = _load_module("_waste_predict", WASTE_MODEL_SRC / "predict.py")

# Model-native development types supported by the Waste pipeline.
WASTE_DEVELOPMENT_TYPES = ("residential_compound", "hospital", "mall", "school", "office")


class ModelUnavailableError(RuntimeError):
    """Raised when a required trained Waste artifact is missing/unloadable."""


def is_model_available() -> bool:
    try:
        return _waste_predict.is_model_available()
    except Exception:  # noqa: BLE001
        return False


def _to_float(value, default: float = 0.0) -> float:
    if value is None:
        return default
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def run_waste_prediction(
    dev_type: str,
    properties: dict | None = None,
    zone_id: str = "",
    zone_lat: float | None = None,
    zone_lon: float | None = None,
    month: int = 6,
    day_of_week: int = 2,
    temperature_c: float = 25.0,
) -> dict:
    """
    Run a solid waste generation prediction for the given development.

    Parameters
    ----------
    dev_type : str
        Canonical development type accepted by the Waste model.
    properties : dict, optional
        Development properties (num_residents, num_beds, staff_count,
        num_students, num_employees, gross_leasable_area_sqm).
    zone_id : str
        Resolved simulation zone identifier (currently informational).
    zone_lat / zone_lon : float, optional
        Zone centroid coordinates used by the model. When absent, sensible
        defaults for the study area are used.
    month : int
        Month of year (1-12).
    day_of_week : int
        Day of week (0-6, Monday=0).
    temperature_c : float
        Ambient temperature in degrees Celsius.

    Returns
    -------
    dict with waste prediction result.

    Raises
    ------
    ValueError
        Invalid development type or out-of-range input.
    ModelUnavailableError
        Trained artifacts missing or unloadable.
    """
    props = properties or {}

    if dev_type not in WASTE_DEVELOPMENT_TYPES:
        raise ValueError(
            f"development_type '{dev_type}' is not supported by the waste "
            f"model. Supported types: {list(WASTE_DEVELOPMENT_TYPES)}"
        )

    scenario = {
        "development_type": dev_type,
        "month": int(month),
        "day_of_week": int(day_of_week),
        "temp_mean_c": temperature_c,
        "num_residents": _to_float(props.get("num_residents")),
        "num_beds": _to_float(props.get("num_beds")),
        "staff_count": _to_float(props.get("staff_count")),
        "num_students": _to_float(props.get("num_students")),
        "num_employees": _to_float(props.get("num_employees")),
        "gross_leasable_area_sqm": _to_float(props.get("gross_leasable_area_sqm")),
        "weekend_multiplier_applied": _to_float(
            props.get("weekend_multiplier_applied"), 1.0
        ) if props.get("weekend_multiplier_applied") else 1.0,
        "seasonal_multiplier_applied": _to_float(
            props.get("seasonal_multiplier_applied"), 1.0
        ) if props.get("seasonal_multiplier_applied") else 1.0,
    }

    if zone_lat is not None:
        scenario["zone_lat"] = zone_lat
    if zone_lon is not None:
        scenario["zone_lon"] = zone_lon

    try:
        result = _waste_predict.predict(scenario)
    except _waste_predict.ModelUnavailableError as exc:
        raise ModelUnavailableError(str(exc)) from exc
    except ValueError:
        raise
    except Exception as exc:  # noqa: BLE001
        raise ModelUnavailableError(f"Waste model inference failed: {exc}") from exc

    return {
        "waste_generation_kg": result["waste_generation_kg"],
        "waste_generation_tonnes": result["waste_generation_tonnes"],
        "development_type": result["development_type"],
        "model": result["model"],
    }
