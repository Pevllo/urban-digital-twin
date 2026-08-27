"""Custom what-if scenario: secondary road with bus lane."""
import joblib
import numpy as np
import pandas as pd
import config
import train

bundle = joblib.load(config.MODEL_ARTIFACTS)
model = bundle["model"]

baseline_road = {
    "road_type": "secondary",
    "road_length_m": 320.0,
    "lane_count": 2,
    "speed_limit_kmh": 60,
    "is_oneway": False,
    "is_bridge": False,
    "is_tunnel": False,
    "road_capacity_proxy": 3000,
    "intersection_density": 3.0,
    "node_degree": 4,
    "connected_road_count": 3,
}

scenario = {"lane_count": 1, "road_capacity_proxy": 1500}

hours = [f"2026-02-01 {h:02d}:00" for h in range(6, 22)]

print("=" * 60)
print("  CUSTOM WHAT-IF: Secondary road + bus lane")
print("=" * 60)
print(f"Road: secondary, 320m, 2 lanes, 60km/h, two-way")
print("Scenario: add bus lane -> 1 general lane, capacity halved")
print()

def what_if(road_features, scenario, timestamps, model):
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
            "baseline": round(float(base_pred), 1),
            "with_bus_lane": round(float(sc_pred), 1),
            "delta": round(float(sc_pred - base_pred), 1),
            "delta_%": round(float((sc_pred - base_pred) / max(base_pred, 1) * 100), 1),
        })
    return pd.DataFrame(results)

df = what_if(baseline_road, scenario, hours, model)
print(df.to_string(index=False))

peak_delta = df[df["timestamp"].str.contains("08:00|17:00")]["delta"].mean()
offpeak_delta = df[~df["timestamp"].str.contains("08:00|09:00|17:00|18:00")]["delta"].mean()
print(f"\nAvg peak-hour impact:  {peak_delta:+.1f} veh/h")
print(f"Avg off-peak impact:   {offpeak_delta:+.1f} veh/h")
print("=" * 60)
