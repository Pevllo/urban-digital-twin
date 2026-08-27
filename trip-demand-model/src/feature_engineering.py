"""
Feature engineering pipeline for road-level traffic volume prediction.

Reads the raw ML dataset (source of truth, never modified), applies documented
cleaning steps and deterministic feature construction, then writes:

    data/processed/traffic_ml_clean.csv        (deliverable)
    data/processed/traffic_ml_clean.parquet    (fast-reload cache, same content)
    data/processed/feature_metadata.json       (feature lists / split dates)

Run:  python src/feature_engineering.py
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd

RAW_PATH = Path("data/raw/traffic_ml_dataset.csv.gz")
OUT_DIR = Path("data/processed")

TARGET = "traffic_volume"
ID_COLS = ["road_id"]
TIME_KEY = ["road_id", "date", "hour"]

DROP_COLS = [
    "intersection_density",  # constant everywhere -> zero information
    "highway_code",          # arbitrary ordinal duplicate of `highway`
]

# Final engineered feature set used by every model.
NUM_FEATURES = [
    "hour", "day_of_week", "month",
    "hour_sin", "hour_cos", "dow_sin", "dow_cos",
    "is_weekend", "is_peak_hour", "morning_peak", "evening_peak",
    "road_length_m", "road_length_log",
    "lane_count", "speed_limit_kmh", "lane_speed_product",
    "lane_length_product", "speed_length_product",
    "is_oneway", "is_bridge", "is_tunnel",
    "node_degree", "connected_road_count",
    "node_degree_log", "connected_road_log",
    "roadlen_hour", "dow_hour",
    "lane_is_peak_num", "speed_is_peak_num",
]
CAT_FEATURES = ["highway"]
FEATURES = NUM_FEATURES + CAT_FEATURES


def load_raw() -> pd.DataFrame:
    """Load raw ML dataset with memory-efficient dtypes."""
    dtype = {
        "hour": "int8", "is_oneway": "int8", "is_bridge": "int8", "is_tunnel": "int8",
        "day_of_week": "int8", "month": "int8", "is_weekend": "int8",
        "is_peak_hour": "int8", "morning_peak": "int8", "evening_peak": "int8",
        "lane_count": "float32", "speed_limit_kmh": "float32",
        "node_degree": "float32", "connected_road_count": "float32",
        "road_length_m": "float32", "traffic_volume": "int32",
    }
    df = pd.read_csv(RAW_PATH, dtype=dtype, parse_dates=["date"])
    df["highway"] = df["highway"].astype("category")
    return df


def clean(df: pd.DataFrame) -> pd.DataFrame:
    """Documented cleaning decisions (see reports/leakage_audit.md)."""
    n0 = len(df)
    df = df.drop(columns=DROP_COLS)
    df = df.drop_duplicates(subset=TIME_KEY, keep="first")     # no-op expected
    assert not df.isna().any().any(), "unexpected missing values in source data"
    assert len(df) == n0, f"rows dropped during clean: {n0 - len(df)}"
    return df.reset_index(drop=True)


def add_features(df: pd.DataFrame) -> pd.DataFrame:
    """Deterministic feature construction. No target-derived features."""
    h = df["hour"].to_numpy()
    dow = df["day_of_week"].to_numpy()

    df["hour_sin"] = np.sin(2 * np.pi * h / 24.0).astype("float32")
    df["hour_cos"] = np.cos(2 * np.pi * h / 24.0).astype("float32")
    df["dow_sin"] = np.sin(2 * np.pi * dow / 7.0).astype("float32")
    df["dow_cos"] = np.cos(2 * np.pi * dow / 7.0).astype("float32")

    ln = df["road_length_m"].to_numpy()
    df["road_length_log"] = np.log1p(ln).astype("float32")

    # static capacity proxy built ONLY from road attributes (never from traffic_volume)
    df["lane_speed_product"] = (
        df["lane_count"].to_numpy() * df["speed_limit_kmh"].to_numpy()
    ).astype("float32")

    # --- Road feature interactions ---
    rl = df["road_length_m"].to_numpy()
    lc = df["lane_count"].to_numpy()
    sl = df["speed_limit_kmh"].to_numpy()
    df["lane_length_product"] = (lc * rl).astype("float32")       # lane_count × road_length
    df["speed_length_product"] = (sl * rl).astype("float32")       # speed_limit × road_length

    # --- Network topology features ---
    nd = df["node_degree"].to_numpy()
    crc = df["connected_road_count"].to_numpy()
    df["node_degree_log"] = np.log1p(nd).astype("float32")
    df["connected_road_log"] = np.log1p(crc).astype("float32")

    # --- Temporal interactions (numeric, no categorical casting needed) ---
    df["roadlen_hour"] = (rl * h.astype(float)).astype("float32")     # road_length × hour
    df["dow_hour"] = ((dow.astype(float) * h.astype(float)) / 24.0).astype("float32")  # day_of_week × hour

    # --- Peak-hour interaction flags (keep highway as-is; trees will learn interactions) ---
    # Instead of creating new categorical columns (which cause dtype issues),
    # we add numeric interaction features that trees can use:
    df["lane_is_peak_num"] = (df["lane_count"] * df["is_peak_hour"]).astype("float32")  # lane_count × is_peak_hour
    df["speed_is_peak_num"] = (df["speed_limit_kmh"] * df["is_peak_hour"]).astype("float32")  # speed_limit × is_peak_hour

    return df


def chronological_split_dates() -> dict[str, tuple[str, str]]:
    return {
        "train": ("2024-01-01", "2024-04-30"),
        "validation": ("2024-05-01", "2024-06-15"),
        "test": ("2024-06-16", "2024-07-18"),
    }


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    print("loading raw ...")
    df = load_raw()
    print(f"raw: {len(df):,} rows x {df.shape[1]} cols")

    df = clean(df)
    df = add_features(df)

    keep = list(dict.fromkeys(ID_COLS + TIME_KEY[1:] + FEATURES + [TARGET]))
    out = df[keep]
    out.to_parquet(OUT_DIR / "traffic_ml_clean.parquet", index=False)
    print("writing CSV deliverable ...")
    out.to_csv(OUT_DIR / "traffic_ml_clean.csv", index=False)

    meta = {
        "target": TARGET,
        "id_cols": ID_COLS,
        "numeric_features": NUM_FEATURES,
        "categorical_features": CAT_FEATURES,
        "features": FEATURES,
        "drop_reason": {
            "intersection_density": "constant column (2.2116454 in all rows)",
            "highway_code": "arbitrary ordinal re-encoding of highway",
            "volume_capacity_ratio/congestion_level/road_capacity_proxy":
                "already excluded upstream; target-derived (see leakage_audit.md)",
        },
        "split_dates": {k: list(v) for k, v in chronological_split_dates().items()},
        "random_seed": 42,
        "n_rows": int(len(out)),
    }
    (OUT_DIR / "feature_metadata.json").write_text(json.dumps(meta, indent=2))

    print(f"saved: rows={len(out):,}, cols={out.shape[1]}")
    for name, (a, b) in chronological_split_dates().items():
        m = (df["date"] >= a) & (df["date"] <= b)
        print(f"  {name:10s} {a}..{b}: {m.sum():,} rows")


if __name__ == "__main__":
    main()
