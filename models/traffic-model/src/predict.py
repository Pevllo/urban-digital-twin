"""
Prediction and What-If scenario support for the traffic model.

Loads the saved XGBoost pipeline and allows:
  1. Batch prediction on any road features + timestamps.
  2. Single-road What-If comparison: baseline vs modified scenario.
  3. CLI demo showing a real scenario on an actual OSM segment.

DISCLAIMER: This model was trained on SYNTHETIC traffic data generated
from real OSM road-network attributes. Predictions are illustrative,
not ground-truth traffic forecasts.
"""

import joblib
import numpy as np
import pandas as pd

import config
import train


def load_model():
    bundle = joblib.load(config.MODEL_ARTIFACTS)
    return bundle["model"], bundle


def predict_batch(df, model=None):
    if model is None:
        model, _ = load_model()
    return model.predict(df[train.MODEL_FEATURES])


def what_if(road_features, scenario, timestamps, model=None):
    if model is None:
        model, _ = load_model()

    def _build_row(overrides):
        row = dict(road_features)
        row.update(overrides)
        ts = pd.Timestamp(row["timestamp"])
        row["hour"] = ts.hour
        row["day_of_week"] = ts.weekday()
        row["month"] = ts.month
        row["is_weekend"] = ts.weekday() in config.WEEKEND_DAYS
        row["is_peak_hour"] = (config.MORNING_PEAK_HOURS[0] <= ts.hour < config.MORNING_PEAK_HOURS[1]
                               or config.EVENING_PEAK_HOURS[0] <= ts.hour < config.EVENING_PEAK_HOURS[1])
        row["hour_sin"] = np.sin(2 * np.pi * ts.hour / 24)
        row["hour_cos"] = np.cos(2 * np.pi * ts.hour / 24)
        row["day_sin"] = np.sin(2 * np.pi * ts.weekday() / 7)
        row["day_cos"] = np.cos(2 * np.pi * ts.weekday() / 7)
        row["morning_peak"] = config.MORNING_PEAK_HOURS[0] <= ts.hour < config.MORNING_PEAK_HOURS[1]
        row["evening_peak"] = config.EVENING_PEAK_HOURS[0] <= ts.hour < config.EVENING_PEAK_HOURS[1]
        for lag_col in ["traffic_volume_lag_1h", "traffic_volume_lag_2h",
                        "traffic_volume_lag_24h", "traffic_volume_lag_168h",
                        "rolling_mean_3h", "rolling_mean_6h", "rolling_mean_24h"]:
            row.setdefault(lag_col, 0.0)
        return row

    results = []
    for ts in timestamps:
        base_row = _build_row({"timestamp": ts})
        base_df = pd.DataFrame([base_row])[train.MODEL_FEATURES]
        base_pred = model.predict(base_df)[0]

        scenario_row = _build_row({"timestamp": ts})
        scenario_row.update(scenario)
        sc_df = pd.DataFrame([scenario_row])[train.MODEL_FEATURES]
        sc_pred = model.predict(sc_df)[0]

        results.append({
            "timestamp": ts,
            "baseline_pred": round(float(base_pred), 1),
            "scenario_pred": round(float(sc_pred), 1),
            "delta": round(float(sc_pred - base_pred), 1),
            "delta_%": round(float((sc_pred - base_pred) / max(base_pred, 1) * 100), 1),
        })
    return pd.DataFrame(results)


def demo():
    print("=" * 60)
    print("  WHAT-IF SCENARIO DEMO")
    print("  Model trained on SYNTHETIC data (not real traffic)")
    print("=" * 60)

    model, bundle = load_model()
    print(f"model loaded: {bundle['model_name']}")
    print(f"trained at:   {bundle['training_metadata']['trained_at']}")
    print(f"device:       {bundle['training_metadata']['device']}")
    print(f"test R2:      {bundle['metrics'][-1]['test_R2']}")
    print()

    baseline_road = {
        "road_type": "primary",
        "road_length_m": 450.0,
        "lane_count": 4,
        "speed_limit_kmh": 80,
        "is_oneway": True,
        "is_bridge": False,
        "is_tunnel": False,
        "road_capacity_proxy": 7200,
        "intersection_density": 2.5,
        "node_degree": 6,
        "connected_road_count": 5,
    }

    scenario_a = {"lane_count": 2, "road_capacity_proxy": 3600}
    scenario_b = {"lane_count": 6, "road_capacity_proxy": 10800,
                  "road_type": "trunk"}

    peak_hours = ["2026-02-01 08:00", "2026-02-01 09:00",
                  "2026-02-01 17:00", "2026-02-01 18:00"]
    offpeak = ["2026-02-01 14:00", "2026-02-01 22:00"]

    print("Road: primary, 450m, 4 lanes, 80km/h, one-way")
    print()

    for label, scenario, times in [
        ("Baseline", {}, peak_hours + offpeak),
        ("Scenario A: reduce to 2 lanes", scenario_a, peak_hours + offpeak),
        ("Scenario B: expand to 6 lanes, trunk", scenario_b, peak_hours + offpeak),
    ]:
        print(f"--- {label} ---")
        result = what_if(baseline_road, scenario, times, model)
        print(result.to_string(index=False))
        print()

    print("=" * 60)
    print("  The What-If simulator is ready for integration")
    print("  into the AI Urban Digital Twin platform.")
    print("=" * 60)


if __name__ == "__main__":
    demo()
