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

    # -----------------------------------------------------------------------
    # Extract original OSM way ID
    #
    # osm_90604136_0 -> 90604136
    # osm_90604136_1 -> 90604136
    # -----------------------------------------------------------------------

    df["osm_way_id"] = (
        df["road_id"]
        .astype(str)
        .str.extract(r"^osm_(\d+)_")[0]
    )

    # Make sure timestamps are consistently sortable.
    df["timestamp"] = pd.to_datetime(
        df["timestamp"],
        format="mixed",
    )   

    _traffic_df = df

    return _traffic_df


# ---------------------------------------------------------------------------
# First observation per traffic segment
# ---------------------------------------------------------------------------

def get_baseline_segments(df):
    """
    Return exactly one baseline observation for each traffic-model segment.

    The synthetic dataset contains 720 hourly observations per segment.

    We use the earliest available observation for each road_id.

    Example:

        osm_90604136_0 -> first observation
        osm_90604136_1 -> first observation
        osm_90604136_2 -> first observation
        osm_90604136_3 -> first observation

    This prevents accidentally summing all 720 hours.
    """

    baseline = (
        df
        .sort_values(
            ["road_id", "timestamp"]
        )
        .groupby(
            "road_id",
            as_index=False,
            sort=False,
        )
        .first()
    )

    return baseline


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

    Only the earliest observation of each segment is used.
    """

    try:
        df = load_traffic_data()

    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=500,
            detail=str(exc),
        )

    osm_way_id = str(
        osm_way_id
    ).strip()

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

    # -----------------------------------------------------------------------
    # Get one baseline observation per segment.
    # -----------------------------------------------------------------------

    baseline = get_baseline_segments(
        road
    )

    if baseline.empty:
        raise HTTPException(
            status_code=404,
            detail=(
                f"No baseline traffic observations found for OSM way "
                f"{osm_way_id}"
            ),
        )

    # -----------------------------------------------------------------------
    # Aggregate segments belonging to this OSM way.
    # -----------------------------------------------------------------------

    traffic_volume = int(
        baseline["traffic_volume"].sum()
    )

    road_length_m = float(
        baseline["road_length_m"].sum()
    )

    road_capacity_proxy = float(
        baseline["road_capacity_proxy"].sum()
    )

    first = baseline.iloc[0]

    # -----------------------------------------------------------------------
    # Congestion.
    # -----------------------------------------------------------------------

    congestion_ratio = (
        traffic_volume
        / max(road_capacity_proxy, 1.0)
    )

    congestion_percent = (
        congestion_ratio * 100.0
    )

    return {
        "osm_way_id": int(osm_way_id),

        "timestamp": first["timestamp"].isoformat(),

        "segment_count": int(
            len(baseline)
        ),

        "traffic_volume": traffic_volume,

        "road_type": first["road_type"],

        "road_name": first["road_name"],

        "road_length_m": round(
            road_length_m,
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
            road_capacity_proxy,
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

        "road_hierarchy": first[
            "road_hierarchy"
        ],

        "congestion_ratio": round(
            congestion_ratio,
            6,
        ),

        "congestion_percent": round(
            congestion_percent,
            4,
        ),

        "data_type": "synthetic",
    }


# ---------------------------------------------------------------------------
# All baseline traffic
# ---------------------------------------------------------------------------

@router.get("/baseline/all")
def get_all_baseline_traffic():
    """
    Return baseline synthetic traffic aggregated by OSM way.

    The synthetic traffic dataset contains:

        720 observations per traffic-model segment.

    We first select the earliest observation for EACH segment.

    Then we aggregate those segments back to their original OSM way.

    This produces one baseline record per OSM way.
    """

    try:
        df = load_traffic_data()

    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=500,
            detail=str(exc),
        )

    # -----------------------------------------------------------------------
    # STEP 1
    #
    # Select exactly one observation per traffic-model segment.
    #
    # Example:
    #
    # osm_90604136_0 -> one row
    # osm_90604136_1 -> one row
    # osm_90604136_2 -> one row
    # osm_90604136_3 -> one row
    #
    # Therefore way 90604136 will have 4 rows before aggregation.
    # -----------------------------------------------------------------------

    current = get_baseline_segments(
        df
    )

    if current.empty:
        return {
            "timestamp": None,
            "data_type": "synthetic",
            "roads": [],
        }

    # -----------------------------------------------------------------------
    # STEP 2
    #
    # Aggregate traffic-model segments to OSM way.
    # -----------------------------------------------------------------------

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

    # -----------------------------------------------------------------------
    # STEP 3
    #
    # Calculate congestion.
    # -----------------------------------------------------------------------

    grouped[
        "congestion_ratio"
    ] = (
        grouped["traffic_volume"]
        / grouped[
            "road_capacity_proxy"
        ].clip(lower=1)
    )

    grouped[
        "congestion_percent"
    ] = (
        grouped[
            "congestion_ratio"
        ] * 100
    )

    # -----------------------------------------------------------------------
    # STEP 4
    #
    # Use the earliest baseline timestamp.
    # -----------------------------------------------------------------------

    timestamp = current[
        "timestamp"
    ].min()

    return {
        "timestamp": timestamp.isoformat(),

        "data_type": "synthetic",

        "roads": grouped.to_dict(
            orient="records"
        ),
    }