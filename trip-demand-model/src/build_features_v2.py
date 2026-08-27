"""
MODEL IMPROVEMENT - Stage 1: extended feature set V2.

Adds physically meaningful features computable at prediction time:
  ROAD_EXTRA : lane_count x road_length_m, speed_limit_kmh x road_length_m
  NETWORK    : from/to-node edge counts derived from the OSM graph
               (static topology from synthetic_road_traffic.csv.gz,
                read-only), hierarchy_level derived from `highway`
  TEMPORAL_INT: highway x hour / peak / weekend, dow x hour (categorical),
               lane/speed x peak products, length x hour

No target-derived features. Writes data/processed/traffic_ml_features_v2.parquet.
Run:  python src/build_features_v2.py
"""
from __future__ import annotations

import gzip
import json
from pathlib import Path

import numpy as np
import pandas as pd

from common import DATA_PATH, META_PATH, log

OUT = Path("data/processed/traffic_ml_features_v2.parquet")
META_V2 = Path("data/processed/feature_metadata_v2.json")
RAW_TRAFFIC = Path("data/raw/synthetic_road_traffic.csv.gz")

BASE_FEATS = json.loads(META_PATH.read_text())["features"]

ROAD_EXTRA = ["lane_road_product", "speed_length_product"]

NETWORK_CAT = ["hierarchy_level"]
NETWORK_NUM = ["from_node_degree", "to_node_degree",
               "node_connectivity_min", "node_connectivity_max"]

TEMP_INT_CAT = ["highway_hour", "highway_peak", "highway_weekend", "dow_hour"]
TEMP_INT_NUM = ["lanes_peak", "speed_peak", "length_x_hour"]

GROUPS = {
    "road_extra": ROAD_EXTRA,
    "network": NETWORK_NUM + NETWORK_CAT,
    "temporal_interactions": TEMP_INT_NUM + TEMP_INT_CAT,
}

HIERARCHY_MAP = {
    "motorway": 1, "motorway_link": 1, "trunk": 2, "trunk_link": 2,
    "primary": 3, "primary_link": 3, "secondary": 4, "secondary_link": 4,
    "tertiary": 5, "tertiary_link": 5, "service": 6, "unclassified": 6,
    "residential": 7,
}


def node_edge_counts() -> pd.DataFrame:
    """Static OSM graph degree per node: number of distinct road edges incident."""
    edges = set()
    for chunk in pd.read_csv(RAW_TRAFFIC, usecols=["road_id", "from_node", "to_node"],
                             chunksize=1_000_000):
        chunk = chunk.drop_duplicates("road_id")
        for r, a, b in chunk.itertuples(index=False):
            edges.add((r, a, b))
    deg: dict[int, int] = {}
    for _, a, b in edges:
        deg[a] = deg.get(a, 0) + 1
        deg[b] = deg.get(b, 0) + 1
    return pd.DataFrame([(r, a, b) for r, a, b in edges],
                        columns=["road_id", "from_node", "to_node"]), deg


def main() -> None:
    df = pd.read_parquet(DATA_PATH)
    log(f"base table: {len(df):,} rows")

    log("deriving static node degrees from OSM graph ...")
    edge_df, deg = node_edge_counts()
    log(f"unique roads={len(edge_df):,}, unique nodes={len(deg):,}")
    edge_df["from_node_degree"] = edge_df["from_node"].map(deg).astype("float32")
    edge_df["to_node_degree"] = edge_df["to_node"].map(deg).astype("float32")
    edge_df["node_connectivity_min"] = edge_df[["from_node_degree", "to_node_degree"]].min(axis=1)
    edge_df["node_connectivity_max"] = edge_df[["from_node_degree", "to_node_degree"]].max(axis=1)
    df = df.merge(edge_df.drop(columns=["from_node", "to_node"]), on="road_id", how="left")

    # ---- ROAD_EXTRA
    ln = df["road_length_m"].to_numpy()
    lc = df["lane_count"].to_numpy()
    sp = df["speed_limit_kmh"].to_numpy()
    df["lane_road_product"] = (lc * ln).astype("float32")
    df["speed_length_product"] = (sp * ln).astype("float32")

    # ---- NETWORK categorical
    df["hierarchy_level"] = df["highway"].astype(str).map(HIERARCHY_MAP).astype("category")

    # ---- temporal interactions
    hw = df["highway"].astype(str)
    df["highway_hour"] = (hw + "|" + df["hour"].astype(str)).astype("category")
    df["highway_peak"] = (hw + "|p" + df["is_peak_hour"].astype(str)).astype("category")
    df["highway_weekend"] = (hw + "|w" + df["is_weekend"].astype(str)).astype("category")
    df["dow_hour"] = (df["day_of_week"].astype(str) + "|" + df["hour"].astype(str)).astype("category")
    pk = df["is_peak_hour"].to_numpy()
    df["lanes_peak"] = (lc * pk).astype("float32")
    df["speed_peak"] = (sp * pk).astype("float32")
    df["length_x_hour"] = (np.log1p(ln) * df["hour"].to_numpy()).astype("float32")

    feats_v2 = BASE_FEATS + ROAD_EXTRA + NETWORK_NUM + NETWORK_CAT \
        + TEMP_INT_NUM + TEMP_INT_CAT
    keep = list(dict.fromkeys(
        ["road_id", "date", "hour"] + feats_v2 + ["traffic_volume"]))
    out = df[keep]
    assert not out.isna().any().any(), "NaNs introduced during feature build"
    out.to_parquet(OUT, index=False)
    META_V2.write_text(json.dumps({
        "features_v2": feats_v2,
        "groups": GROUPS,
        "base_features": BASE_FEATS,
        "provenance": {
            "node_degree": "distinct-edge count per OSM node "
                           "(static topology, prediction-time available)",
            "hierarchy_level": "derived from highway via fixed mapping",
        },
    }, indent=2))
    log(f"saved {OUT} ({out.shape})")


if __name__ == "__main__":
    main()
