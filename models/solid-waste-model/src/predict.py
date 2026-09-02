"""
Production prediction pipeline for Solid Waste Generation.

Input dict -> validate -> feature engineering -> model -> prediction dict.

This module reproduces EXACTLY the feature representation used during
training (see train_model.py prep()/feature_cols) so that inference
matches the trained model. It does NOT train or retrain any model during
inference.


Example:

    from predict import predict

    out = predict({
        "development_type": "residential_compound",
        "num_residents": 500,
        "month": 6,
        "day_of_week": 2,
        "temp_mean_c": 28,
    })
    # {"waste_generation_kg": ..., "waste_generation_tonnes": ...}
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import joblib

ROOT = Path(__file__).resolve().parents[1]
MODELS_DIR = ROOT / "models"

FEATURE_COLS = [
    "day_of_year", "month", "day_of_week", "is_weekend", "is_summer",
    "dow_sin", "dow_cos", "month_sin", "month_cos", "doy_sin", "doy_cos",
    "temp_mean_c",
    "num_residents", "num_beds", "staff_count", "num_students",
    "num_employees", "gross_leasable_area_sqm",
    "weekend_multiplier_applied", "seasonal_multiplier_applied",
    "log1p_num_residents", "log1p_num_beds", "log1p_num_students",
    "log1p_num_employees", "log1p_gross_leasable_area_sqm",
    "activity_intensity",
    "residential_driver", "hospital_driver", "mall_driver", "school_driver",
    "office_driver",
    "zone_lat", "zone_lon", "development_type_enc",
]

VALID_DEVELOPMENT_TYPES = [
    "residential_compound", "hospital", "mall", "school", "office",
]

LOG1P_COUNT_COLS = [
    "num_residents", "num_beds", "num_students", "num_employees",
    "gross_leasable_area_sqm",
]

_MODEL_BUNDLE = None


class ModelUnavailableError(RuntimeError):
    """Raised when a required trained artifact is missing or unloadable."""


def _resolve_model_paths() -> tuple[Path, Path]:
    model_path = MODELS_DIR / "solid_waste_model.joblib"
    encoder_path = MODELS_DIR / "solid_waste_label_encoder.joblib"
    missing = []
    if not model_path.exists():
        missing.append(str(model_path))
    if not encoder_path.exists():
        missing.append(str(encoder_path))
    if missing:
        raise ModelUnavailableError(
            "Solid waste model artifact(s) unavailable: "
            + "; ".join(missing)
            + ". The trained model and label encoder are gitignored and must "
            "be reproduced before inference is possible."
        )
    return model_path, encoder_path


def _load_model() -> dict:
    """Load (and cache) the trained model and label encoder."""
    global _MODEL_BUNDLE
    if _MODEL_BUNDLE is None:
        model_path, encoder_path = _resolve_model_paths()
        try:
            model = joblib.load(model_path)
            encoder = joblib.load(encoder_path)
        except Exception as exc:  # noqa: BLE001
            raise ModelUnavailableError(
                f"Failed to load solid waste model artifacts: {exc}"
            ) from exc
        _MODEL_BUNDLE = {"model": model, "encoder": encoder}
    return _MODEL_BUNDLE


def validate_input(scenario: dict) -> dict:
    """Validate and normalise the input scenario."""
    if "development_type" not in scenario:
        raise ValueError("Missing required field: 'development_type'")

    dev_type = str(scenario["development_type"]).strip().lower()
    if dev_type not in VALID_DEVELOPMENT_TYPES:
        raise ValueError(
            f"Invalid development_type: '{dev_type}'. Must be one of: "
            f"{VALID_DEVELOPMENT_TYPES}"
        )

    month = int(scenario.get("month", 6))
    day_of_week = int(scenario.get("day_of_week", 2))
    if not (1 <= month <= 12):
        raise ValueError(f"month must be 1-12, got {month}")
    if not (0 <= day_of_week <= 6):
        raise ValueError(f"day_of_week must be 0-6, got {day_of_week}")

    doy = (month - 1) * 30 + 15

    return {
        "development_type": dev_type,
        "month": month,
        "day_of_week": day_of_week,
        "day_of_year": doy,
        "is_weekend": int(day_of_week >= 5),
        "is_summer": int(month in [6, 7, 8]),
        "dow_sin": float(np.sin(2 * np.pi * day_of_week / 7)),
        "dow_cos": float(np.cos(2 * np.pi * day_of_week / 7)),
        "month_sin": float(np.sin(2 * np.pi * (month - 1) / 12)),
        "month_cos": float(np.cos(2 * np.pi * (month - 1) / 12)),
        "doy_sin": float(np.sin(2 * np.pi * doy / 366)),
        "doy_cos": float(np.cos(2 * np.pi * doy / 366)),
        "temp_mean_c": float(scenario.get("temp_mean_c", 25)),
        "num_residents": float(scenario.get("num_residents", 0)),
        "num_beds": float(scenario.get("num_beds", 0)),
        "staff_count": float(scenario.get("staff_count", 0)),
        "num_students": float(scenario.get("num_students", 0)),
        "num_employees": float(scenario.get("num_employees", 0)),
        "gross_leasable_area_sqm": float(
            scenario.get("gross_leasable_area_sqm", 0)
        ),
        "weekend_multiplier_applied": float(
            scenario.get("weekend_multiplier_applied", 1.0)
        ),
        "seasonal_multiplier_applied": float(
            scenario.get("seasonal_multiplier_applied", 1.0)
        ),
        "zone_lat": float(scenario.get("zone_lat", 30.03)),
        "zone_lon": float(scenario.get("zone_lon", 31.77)),
    }


def _engineer_features(scenario: dict, development_type_enc: float) -> dict:
    """Build the full 34-feature vector exactly as in train_model.prep()."""
    r = {f: 0.0 for f in FEATURE_COLS}

    r["month"] = scenario["month"]
    r["day_of_week"] = scenario["day_of_week"]
    r["day_of_year"] = scenario["day_of_year"]
    r["is_weekend"] = scenario["is_weekend"]
    r["is_summer"] = scenario["is_summer"]
    r["dow_sin"] = scenario["dow_sin"]
    r["dow_cos"] = scenario["dow_cos"]
    r["month_sin"] = scenario["month_sin"]
    r["month_cos"] = scenario["month_cos"]
    r["doy_sin"] = scenario["doy_sin"]
    r["doy_cos"] = scenario["doy_cos"]
    r["temp_mean_c"] = scenario["temp_mean_c"]
    r["num_residents"] = scenario["num_residents"]
    r["num_beds"] = scenario["num_beds"]
    r["staff_count"] = scenario["staff_count"]
    r["num_students"] = scenario["num_students"]
    r["num_employees"] = scenario["num_employees"]
    r["gross_leasable_area_sqm"] = scenario["gross_leasable_area_sqm"]
    r["weekend_multiplier_applied"] = scenario["weekend_multiplier_applied"]
    r["seasonal_multiplier_applied"] = scenario["seasonal_multiplier_applied"]
    r["zone_lat"] = scenario["zone_lat"]
    r["zone_lon"] = scenario["zone_lon"]

    for c in LOG1P_COUNT_COLS:
        r[f"log1p_{c}"] = float(np.log1p(r[c]))

    r["activity_intensity"] = sum(
        r[f"log1p_{c}"] for c in LOG1P_COUNT_COLS
    )
    r["residential_driver"] = r["num_residents"]
    r["hospital_driver"] = r["num_beds"]
    r["mall_driver"] = r["gross_leasable_area_sqm"]
    r["school_driver"] = r["num_students"]
    r["office_driver"] = r["num_employees"]
    r["development_type_enc"] = development_type_enc

    return r


def _prep(dev_type: str, vals: dict, development_type_enc: float = 0.0) -> "list":
    """
    Build the feature row for ONE development type.

    Mirrors train_model.py prep() exactly. Returns a list aligned to
    FEATURE_COLS.
    """
    scenario = validate_input({**vals, "development_type": dev_type})
    features = _engineer_features(scenario, development_type_enc)
    return [features[f] for f in FEATURE_COLS]


def is_model_available() -> bool:
    """Return True when both trained artifacts are present and loadable."""
    try:
        _load_model()
        return True
    except ModelUnavailableError:
        return False


def predict(scenario: dict) -> dict:
    """
    Predict daily solid waste generation (kg/day) for a development.

    Parameters
    ----------
    scenario : dict
        Keys (all optional except development_type):
            development_type (required): residential_compound, hospital,
                mall, school, office
            num_residents, num_beds, staff_count, num_students,
            num_employees, gross_leasable_area_sqm,
            month, day_of_week, temp_mean_c,
            weekend_multiplier_applied, seasonal_multiplier_applied,
            zone_lat, zone_lon

    Returns
    -------
    dict
        {
            "waste_generation_kg": ...,
            "waste_generation_tonnes": ...,
            "development_type": ...,
            "model": ...,
        }

    Raises
    ------
    ValueError
        Invalid development type or out-of-range input.
    ModelUnavailableError
        Trained artifacts are missing or unloadable.
    """
    if "development_type" not in scenario:
        raise ValueError("Missing required field: 'development_type'")

    dev_type = str(scenario["development_type"]).strip().lower()
    if dev_type not in VALID_DEVELOPMENT_TYPES:
        raise ValueError(
            f"Invalid development_type: '{dev_type}'. Must be one of: "
            f"{VALID_DEVELOPMENT_TYPES}"
        )

    # Validate value ranges before touching artifacts so that input errors
    # (400) are clearly distinguishable from missing artifacts (503).
    validate_input({**scenario, "development_type": dev_type})

    bundle = _load_model()
    model = bundle["model"]
    encoder = bundle["encoder"]

    try:
        encoded = float(encoder.transform([dev_type])[0])
    except (ValueError, KeyError) as exc:
        raise ValueError(
            f"Development type '{dev_type}' is not known to the trained "
            f"label encoder. Known types: {list(encoder.classes_)}"
        ) from exc

    row = _prep(dev_type, scenario, development_type_enc=encoded)

    import pandas as pd  # imported lazily to mirror original prep() behaviour

    X = pd.DataFrame([row], columns=FEATURE_COLS)
    pred_kg = float(model.predict(X)[0])
    pred_kg = max(0.0, pred_kg)

    return {
        "waste_generation_kg": round(pred_kg, 2),
        "waste_generation_tonnes": round(pred_kg / 1000, 5),
        "development_type": dev_type,
        "model": type(model).__name__,
    }
