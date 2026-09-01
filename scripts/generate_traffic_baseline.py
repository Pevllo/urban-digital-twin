#!/usr/bin/env python3
"""
Generate Traffic Baseline Dataset — AI Urban Digital Twin

Reads the full synthetic_traffic.csv (4.7M+ rows, 720 hourly observations
per traffic segment) and extracts exactly one baseline observation per
segment (the earliest timestamp).

Output:
    models/traffic-model/data/processed/synthetic_traffic_baseline.csv

This small file (~6,615 rows) is what the FastAPI runtime loads instead
of the full 795 MB CSV, reducing first-request cold start from ~25s
to <1s.

The original synthetic_traffic.csv is preserved for XGBoost training.
"""

import os
import sys
from pathlib import Path

import pandas as pd


# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

ROOT_DIR = Path(__file__).resolve().parents[1]

FULL_CSV = (
    ROOT_DIR
    / "models"
    / "traffic-model"
    / "data"
    / "processed"
    / "synthetic_traffic.csv"
)

OUT_CSV = (
    ROOT_DIR
    / "models"
    / "traffic-model"
    / "data"
    / "processed"
    / "synthetic_traffic_baseline.csv"
)


# ---------------------------------------------------------------------------
# Columns required at runtime by the FastAPI traffic endpoints
# ---------------------------------------------------------------------------

RUNTIME_COLUMNS = [
    "road_id",
    "timestamp",
    "traffic_volume",
    "road_type",
    "road_name",
    "road_length_m",
    "lane_count",
    "speed_limit_kmh",
    "is_oneway",
    "is_bridge",
    "is_tunnel",
    "road_capacity_proxy",
    "intersection_density",
    "node_degree",
    "connected_road_count",
    "road_hierarchy",
]


# ---------------------------------------------------------------------------
# Baseline extraction — must be identical to traffic.py get_baseline_segments()
# ---------------------------------------------------------------------------

def extract_baseline(df):
    """
    Return exactly one baseline observation per traffic-model segment.

    The synthetic dataset contains 720 hourly observations per segment.
    We use the earliest available observation for each road_id.

    This is the exact same logic as:
        df.sort_values(["road_id", "timestamp"])
          .groupby("road_id", as_index=False, sort=False)
          .first()
    """

    baseline = (
        df
        .sort_values(["road_id", "timestamp"])
        .groupby("road_id", as_index=False, sort=False)
        .first()
    )

    return baseline


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    # -------------------------------------------------------------------
    # Validate source
    # -------------------------------------------------------------------

    if not FULL_CSV.exists():
        print(f"ERROR: Full traffic CSV not found: {FULL_CSV}")
        print("Run the traffic model pipeline first:")
        print("  cd models/traffic-model && python src/run_synthetic_pipeline.py")
        sys.exit(1)

    full_size_mb = FULL_CSV.stat().st_size / (1024 * 1024)
    print(f"Input:  {FULL_CSV}")
    print(f"        {full_size_mb:.1f} MB")

    # -------------------------------------------------------------------
    # Read only the columns needed at runtime
    # -------------------------------------------------------------------

    print(f"Reading {len(RUNTIME_COLUMNS)} columns ...")

    df = pd.read_csv(
        FULL_CSV,
        usecols=RUNTIME_COLUMNS,
    )

    input_rows = len(df)
    print(f"Input rows: {input_rows:,}")

    # -------------------------------------------------------------------
    # Extract baseline (earliest observation per road_id)
    # -------------------------------------------------------------------

    print("Extracting baseline (earliest observation per road_id) ...")

    baseline = extract_baseline(df)

    # -------------------------------------------------------------------
    # Derive osm_way_id — same regex as traffic.py
    #
    # osm_90604136_0 -> 90604136
    # -------------------------------------------------------------------

    baseline = baseline.copy()
    baseline["osm_way_id"] = (
        baseline["road_id"]
        .astype(str)
        .str.extract(r"^osm_(\d+)_")[0]
        .astype(str)
    )

    # Ensure timestamp is datetime for consistent serialization
    baseline["timestamp"] = pd.to_datetime(
        baseline["timestamp"],
        format="mixed",
    )

    # -------------------------------------------------------------------
    # Reorder columns: osm_way_id first, then runtime columns
    # -------------------------------------------------------------------

    output_columns = ["osm_way_id"] + RUNTIME_COLUMNS
    baseline = baseline[output_columns]

    # -------------------------------------------------------------------
    # Write
    # -------------------------------------------------------------------

    os.makedirs(OUT_CSV.parent, exist_ok=True)

    baseline.to_csv(
        OUT_CSV,
        index=False,
    )

    out_size = OUT_CSV.stat().st_size
    out_size_kb = out_size / 1024

    # -------------------------------------------------------------------
    # Summary
    # -------------------------------------------------------------------

    output_rows = len(baseline)
    unique_segments = baseline["road_id"].nunique()
    unique_ways = baseline["osm_way_id"].nunique()

    print()
    print("Output summary:")
    print(f"  File:              {OUT_CSV}")
    print(f"  Size:              {out_size_kb:.1f} KB")
    print(f"  Rows:              {output_rows:,}")
    print(f"  Columns:           {len(output_columns)}")
    print(f"  Unique road_id:    {unique_segments:,}")
    print(f"  Unique osm_way_id: {unique_ways:,}")
    print()
    print(f"Reduction: {input_rows:,} -> {output_rows:,} rows "
          f"({output_rows / input_rows * 100:.2f}%)")
    print(f"           {full_size_mb:.1f} MB -> {out_size_kb:.1f} KB")
    print()
    print("Done.")


if __name__ == "__main__":
    main()
