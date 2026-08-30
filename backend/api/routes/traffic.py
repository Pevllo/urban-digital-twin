from pathlib import Path

import pandas as pd
from fastapi import APIRouter, HTTPException, Query


router = APIRouter(
    prefix="/traffic",
    tags=["Traffic"],
)


# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

PROJECT_ROOT = Path(__file__).resolve().parents[3]

TRAFFIC_CSV = (
    PROJECT_ROOT
    / "models"
    / "traffic-model"
    / "data"
    / "processed"
    / "synthetic_traffic.csv"
)


# ---------------------------------------------------------------------------
# Cached traffic data
# ---------------------------------------------------------------------------

_traffic_df = None


def load_traffic_data():
    """
    Load the synthetic traffic dataset once.

    The traffic model stores traffic at segmented-road level:

        osm_90604136_0
        osm_90604136_1
        osm_90604136_2
        osm_90604136_3

    The API extracts the original OSM way:

        90604136

    so the frontend can request traffic using the OSM way ID.
    """

    global _traffic_df

    if _traffic_df is not None:
        return _traffic_df

    if not TRAFFIC_CSV.exists():
        raise FileNotFoundError(
            f"Traffic dataset not found: {TRAFFIC_CSV}"
        )

    df = pd.read_csv(
        TRAFFIC_CSV,
        usecols=[
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
        ],
    )

    # ---------------------------------------------------------------
    # Extract original OSM way ID from segmented road ID.
    #
    # osm_90604136_0 -> 90604136
    # osm_90604136_1 -> 90604136
    # ---------------------------------------------------------------

    df["osm_way_id"] = (
        df["road_id"]
        .astype(str)
        .str.extract(r"^osm_(\d+)_")[0]
    )

    _traffic_df = df

    return _traffic_df


# ---------------------------------------------------------------------------
# Single OSM way baseline
# ---------------------------------------------------------------------------

@router.get("/baseline")
def get_baseline_traffic(
    osm_way_id: str = Query(
        ...,
        description="Original OpenStreetMap way ID",
    )
):
    """
    Return baseline synthetic traffic for one OSM way.

    Multiple traffic-model segments belonging to the same OSM way
    are aggregated together.
    """

    try:
        df = load_traffic_data()

    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=500,
            detail=str(exc),
        )

    osm_way_id = str(osm_way_id).strip()

    if not osm_way_id.isdigit():
        raise HTTPException(
            status_code=400,
            detail="osm_way_id must contain only digits.",
        )

    road = df[
        df["osm_way_id"] == osm_way_id
    ].copy()

    if road.empty:
        raise HTTPException(
            status_code=404,
            detail=(
                f"No traffic data found for OSM way "
                f"{osm_way_id}"
            ),
        )

    # ---------------------------------------------------------------
    # Initial baseline timestamp.
    # ---------------------------------------------------------------

    timestamp = road["timestamp"].min()

    current = road[
        road["timestamp"] == timestamp
    ].copy()

    if current.empty:
        raise HTTPException(
            status_code=404,
            detail=(
                f"No traffic observations found for OSM way "
                f"{osm_way_id}"
            ),
        )

    first = current.iloc[0]

    return {
        "osm_way_id": int(osm_way_id),

        "timestamp": timestamp,

        "segment_count": int(
            len(current)
        ),

        "traffic_volume": int(
            current["traffic_volume"].sum()
        ),

        "road_type": first["road_type"],

        "road_name": first["road_name"],

        "road_length_m": round(
            float(
                current["road_length_m"].sum()
            ),
            1,
        ),

        "lane_count": int(
            first["lane_count"]
        ),

        "speed_limit_kmh": float(
            first["speed_limit_kmh"]
        ),

        "is_oneway": bool(
            first["is_oneway"]
        ),

        "is_bridge": bool(
            first["is_bridge"]
        ),

        "is_tunnel": bool(
            first["is_tunnel"]
        ),

        "road_capacity_proxy": round(
            float(
                current["road_capacity_proxy"].sum()
            ),
            1,
        ),

        "intersection_density": float(
            first["intersection_density"]
        ),

        "node_degree": int(
            first["node_degree"]
        ),

        "connected_road_count": int(
            first["connected_road_count"]
        ),

        "road_hierarchy": first["road_hierarchy"],

        "data_type": "synthetic",
    }


# ---------------------------------------------------------------------------
# All baseline traffic
# ---------------------------------------------------------------------------

@router.get("/baseline/all")
def get_all_baseline_traffic():
    """
    Return baseline synthetic traffic aggregated by OSM way.

    This endpoint is used by the Cesium traffic visualization.

    One OSM way can contain multiple traffic-model segments.
    """

    try:
        df = load_traffic_data()

    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=500,
            detail=str(exc),
        )

    # ---------------------------------------------------------------
    # Select the first available observation for EACH OSM way.
    #
    # We must not filter the entire dataset using one global timestamp,
    # because some roads may not have an observation at that exact time.
    # ---------------------------------------------------------------

    df = df.sort_values(
        ["osm_way_id", "timestamp"]
    )

    current = (
        df
        .groupby("osm_way_id", as_index=False)
        .first()
    )

    timestamp = current["timestamp"].min()

    if current.empty:
        return {
            "timestamp": timestamp,
            "data_type": "synthetic",
            "roads": [],
        }

    # ---------------------------------------------------------------
    # Aggregate traffic-model segments by original OSM way.
    # ---------------------------------------------------------------

    grouped = (
        current
        .groupby(
            "osm_way_id",
            as_index=False,
        )
        .agg(
            traffic_volume=(
                "traffic_volume",
                "sum",
            ),
            road_capacity_proxy=(
                "road_capacity_proxy",
                "sum",
            ),
            segment_count=(
                "road_id",
                "count",
            ),
        )
    )

    # ---------------------------------------------------------------
    # Congestion ratio.
    #
    # Example:
    #
    # traffic = 1691
    # capacity = 8280
    #
    # ratio ~= 0.204
    # percent ~= 20.4%
    # ---------------------------------------------------------------

    grouped["congestion_ratio"] = (
        grouped["traffic_volume"]
        / grouped["road_capacity_proxy"].clip(
            lower=1
        )
    )

    grouped["congestion_percent"] = (
        grouped["congestion_ratio"] * 100
    )

    return {
        "timestamp": timestamp,

        "data_type": "synthetic",

        "roads": grouped.to_dict(
            orient="records"
        ),
    }