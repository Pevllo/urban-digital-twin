import math
import sys
from pathlib import Path

import pandas as pd

BACKEND_DIR = Path(__file__).resolve().parents[2]
PROJECT_ROOT = BACKEND_DIR.parent
MODELS_DIR = PROJECT_ROOT / "models"

for d in [MODELS_DIR / "traffic-model" / "src", MODELS_DIR / "trip-demand-model" / "src"]:
    if str(d) not in sys.path:
        sys.path.insert(0, str(d))

from trip_generation import DevelopmentInput
from simulator import simulate_what_if_scenario
from backend.api.services.electricity_service import run_electricity_prediction


# ============================================================================
# ZONE RESOLUTION FROM COORDINATES
# ============================================================================
#
# The frontend does not know which simulation zone a development's
# lat/lon falls inside.  The authoritative zone dataset is:
#
#   models/trip-demand-model/data/raw/zone_osm_mapping_v2.csv
#   Schema: zone_id (str Z0000–Z0149), centroid_lat, centroid_lon, ...
#
# This resolver performs a Haversine nearest-centroid lookup so the
# backend always derives the correct zone_id from coordinates.
# ============================================================================

_ZONE_CSV_PATH = (
    PROJECT_ROOT / "models" / "trip-demand-model" / "data" / "raw" / "zone_osm_mapping_v2.csv"
)

_EARTH_RADIUS_KM = 6371.0


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Haversine distance in kilometres between two lat/lon points."""
    d_lat = math.radians(lat2 - lat1)
    d_lon = math.radians(lon2 - lon1)
    a = (
        math.sin(d_lat / 2.0) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(d_lon / 2.0) ** 2
    )
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return _EARTH_RADIUS_KM * c


_zone_df_cache: pd.DataFrame | None = None


def _load_zone_df() -> pd.DataFrame:
    """Load (and cache) the authoritative zone centroid dataset."""
    global _zone_df_cache
    if _zone_df_cache is None:
        if not _ZONE_CSV_PATH.exists():
            raise FileNotFoundError(f"Zone dataset not found at {_ZONE_CSV_PATH}")
        df = pd.read_csv(_ZONE_CSV_PATH)
        df["zone_id"] = df["zone_id"].astype(str).str.strip()
        _zone_df_cache = df
    return _zone_df_cache


def resolve_zone_from_coordinates(latitude: float, longitude: float) -> str:
    """Resolve a development's lat/lon to the nearest zone_id.

    Raises ValueError if coordinates are out of bounds.
    """
    if not isinstance(latitude, (int, float)) or not isinstance(longitude, (int, float)):
        raise ValueError("latitude and longitude must be numeric.")
    if math.isnan(latitude) or math.isnan(longitude):
        raise ValueError("latitude and longitude must not be NaN.")
    if latitude < -90.0 or latitude > 90.0 or longitude < -180.0 or longitude > 180.0:
        raise ValueError(f"Coordinates out of bounds: lat={latitude}, lon={longitude}.")

    zone_df = _load_zone_df()
    best_zone: str | None = None
    best_dist = float("inf")

    for _, row in zone_df.iterrows():
        dist = _haversine_km(
            latitude, longitude,
            float(row["centroid_lat"]), float(row["centroid_lon"]),
        )
        if dist < best_dist:
            best_dist = dist
            best_zone = str(row["zone_id"])

    if best_zone is None:
        raise ValueError("Zone dataset is empty — cannot resolve coordinates to a zone.")

    return best_zone


# ============================================================================
# DEVELOPMENT TYPE NORMALIZATION
# ============================================================================
#
# The frontend exposes user-friendly type names.  The ML/DL model pipelines
# (trip-demand-model, electricity-model) use their own canonical names.
#
# Canonical types accepted by the trip-demand pipeline:
#   residential_compound, hospital, mall, school, office
#
# Canonical types accepted by the electricity pipeline:
#   residential_compound, hospital, mall, school, office, hotel
#   (+ special mixed_use decomposition handled in electricity_service.py)
#
# This mapping normalizes frontend aliases → model canonical types.
# Do NOT add unrelated mappings here — every entry must be a true alias.
# ============================================================================

DEV_TYPE_ALIASES: dict[str, str] = {
    # Residential aliases (hotel is lodging, same BDG2 category as residential_compound)
    "residential": "residential_compound",
    "hotel": "residential_compound",
    # Commercial / retail aliases  (both map to mall in the trip model)
    "commercial": "mall",
    "retail": "mall",
}

# Development types accepted by the trip-demand model (cannot be changed).
_TRIP_CANONICAL_TYPES = {"residential_compound", "hospital", "mall", "school", "office"}

# Development types accepted by the electricity model.
_ELEC_CANONICAL_TYPES = {"residential_compound", "hospital", "mall", "school", "office", "hotel"}


def normalize_dev_type(dev_type: str) -> str:
    """Resolve a frontend development type to its model-canonical form.

    Raises ``ValueError`` for types that no model pipeline supports.
    """
    canonical = DEV_TYPE_ALIASES.get(dev_type, dev_type)

    if canonical not in _TRIP_CANONICAL_TYPES and canonical != "mixed_use":
        raise ValueError(
            f"Unsupported development type '{dev_type}' "
            f"(resolved to '{canonical}'). "
            f"Supported types: {sorted(set(DEV_TYPE_ALIASES.keys()) | _TRIP_CANONICAL_TYPES | {'mixed_use'})}"
        )
    return canonical


def _split_mixed_use(properties: dict) -> dict[str, dict]:
    """Decompose mixed-use properties into per-type property dicts.

    Returns a dict mapping canonical trip type → subset of properties.
    The split mirrors the electricity_service default ratios:
      40 % office, 30 % residential_compound, 30 % mall.
    Only properties that are relevant to each type are forwarded.
    """
    return {
        "residential_compound": {
            "num_units": properties.get("num_units", 0),
            "num_residents": properties.get("num_residents", 0),
        },
        "office": {
            "num_employees": properties.get("num_employees", 0),
        },
    }


# ============================================================================
# PUBLIC API
# ============================================================================


def run_simulation(
    dev_type: str,
    zone_id: str,
    properties: dict,
    name: str = "",
    hour: int = 8,
    dev_id: str = "",
    latitude: float | None = None,
    longitude: float | None = None,
    footprint_area: float = 0.0,
    floors: int = 1,
) -> dict:
    # ------------------------------------------------------------------
    # 1. Resolve zone_id from coordinates when available
    # ------------------------------------------------------------------
    if latitude is not None and longitude is not None:
        resolved_zone = resolve_zone_from_coordinates(latitude, longitude)
        zone_id = resolved_zone

    if not zone_id:
        raise ValueError(
            "zone_id could not be determined. "
            "Provide valid latitude/longitude coordinates so the zone can be resolved."
        )

    # ------------------------------------------------------------------
    # 2. Normalize development type
    # ------------------------------------------------------------------
    canonical_type = normalize_dev_type(dev_type)

    # ------------------------------------------------------------------
    # 3. Traffic simulation (4-stage pipeline)
    # ------------------------------------------------------------------
    if canonical_type == "mixed_use":
        traffic_result = _simulate_mixed_use_traffic(
            properties=properties,
            zone_id=zone_id,
            name=name,
            dev_id=dev_id,
            hour=hour,
        )
    else:
        dev_input = DevelopmentInput(
            development_type=canonical_type,
            zone_id=zone_id,
            properties=properties,
            name=name or dev_type,
            development_id=dev_id,
        )
        result = simulate_what_if_scenario(dev_input, hour=hour)
        traffic_result = result.to_dict()

    # ------------------------------------------------------------------
    # 4. Electricity prediction
    # ------------------------------------------------------------------
    electricity_result = run_electricity_prediction(
        dev_type=canonical_type,
        latitude=latitude,
        longitude=longitude,
        properties=properties,
        simulation_hour=hour,
        footprint_area=footprint_area,
        floors=floors,
    )

    # ------------------------------------------------------------------
    # 5. Merge electricity into traffic result
    # ------------------------------------------------------------------
    traffic_result["stage5_electricity"] = electricity_result
    traffic_result["development_input"]["development_type"] = dev_type

    return traffic_result


def _simulate_mixed_use_traffic(
    properties: dict,
    zone_id: str,
    name: str,
    dev_id: str,
    hour: int,
) -> dict:
    """Run the trip-demand pipeline for each component of a mixed-use
    development and aggregate the daily trip totals.

    The full 4-stage pipeline (traffic assignment + impact) cannot be
    meaningfully split across component types because the road network
    assignment depends on the *total* OD matrix.  We therefore run the
    complete pipeline once per component and pick the result with the
    highest daily trip volume as the representative traffic impact, while
    summing the stage-1 trip counts.

    Electricity is handled separately in ``run_electricity_prediction``
    which already has its own mixed-use decomposition.
    """
    components = _split_mixed_use(properties)
    best_result = None
    total_daily_trips = 0.0

    for comp_type, comp_props in components.items():
        # Skip components with no meaningful input
        if all(v == 0 for v in comp_props.values()):
            continue

        dev_input = DevelopmentInput(
            development_type=comp_type,
            zone_id=zone_id,
            properties=comp_props,
            name=f"{name or 'mixed_use'} ({comp_type})",
            development_id=dev_id,
        )
        result = simulate_what_if_scenario(dev_input, hour=hour)
        result_dict = result.to_dict()

        # Accumulate daily trips from stage-1
        stage1 = result_dict.get("stage1_od_demand", {})
        daily = stage1.get("daily_total_trips", 0)
        total_daily_trips += daily

        if best_result is None or daily > (
            best_result.get("stage1_od_demand", {}).get("daily_total_trips", 0)
        ):
            best_result = result_dict

    if best_result is None:
        raise ValueError(
            "mixed_use development has no measurable properties "
            "(num_units, num_residents, num_employees are all zero)."
        )

    best_result["stage1_od_demand"]["daily_total_trips"] = total_daily_trips
    return best_result
