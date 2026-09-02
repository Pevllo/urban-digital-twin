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
from backend.api.services.water_service import (
    run_water_prediction,
    ModelUnavailableError as WaterUnavailableError,
)
from backend.api.services.waste_service import (
    run_waste_prediction,
    ModelUnavailableError as WasteUnavailableError,
)


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
# WATER / WASTE MIXED-USE DECOMPOSITION
# ============================================================================
#
# The Water and Waste models only support the 5 canonical development types
# (residential_compound, hospital, mall, school, office).  They cannot
# directly predict a "mixed_use" composite.
#
# Following the same convention used by the electricity pipeline, a
# mixed_use development is decomposed into component types with fixed
# area/activity ratios, each component is predicted independently, and the
# results are summed to represent the complete development.  This avoids
# double counting and produces a single aggregate for the whole building.
#
# Decomposition ratios mirror electricity_service.DEFAULT_MIXED_USE_SPLIT:
#   40 % office, 30 % residential_compound, 30 % mall
# ============================================================================

WATER_WASTE_MIXED_USE_SPLIT = {
    "office": 0.40,
    "residential_compound": 0.30,
    "mall": 0.30,
}


def _decompose_mixed_use_properties(properties: dict) -> dict[str, dict]:
    """Split a mixed-use property dict into per-component property dicts.

    Activity drivers are allocated across the components by ratio.  Each
    component receives a subset of the shared drivers so that the final
    summed water/waste value represents the complete development.
    """
    return {
        "office": {
            "num_employees": properties.get("num_employees", 0),
            "gross_leasable_area_sqm": (
                properties.get("gross_leasable_area_sqm", 0) * WATER_WASTE_MIXED_USE_SPLIT["office"]
            ),
        },
        "residential_compound": {
            "num_residents": properties.get("num_residents", 0),
            "num_units": properties.get("num_units", 0),
            "gross_leasable_area_sqm": (
                properties.get("gross_leasable_area_sqm", 0) * WATER_WASTE_MIXED_USE_SPLIT["residential_compound"]
            ),
        },
        "mall": {
            "num_employees": properties.get("num_employees", 0),
            "gross_leasable_area_sqm": (
                properties.get("gross_leasable_area_sqm", 0) * WATER_WASTE_MIXED_USE_SPLIT["mall"]
            ),
            "visitor_capacity": properties.get("visitor_capacity", 0),
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

    # ------------------------------------------------------------------
    # 6. Water demand prediction
    # ------------------------------------------------------------------
    traffic_result["stage6_water"] = _run_water_stage(
        canonical_type=canonical_type,
        props=properties,
        zone_id=zone_id,
        latitude=latitude,
        longitude=longitude,
        hour=hour,
    )

    # ------------------------------------------------------------------
    # 7. Solid waste generation prediction
    # ------------------------------------------------------------------
    traffic_result["stage7_waste"] = _run_waste_stage(
        canonical_type=canonical_type,
        props=properties,
        zone_id=zone_id,
        latitude=latitude,
        longitude=longitude,
        hour=hour,
    )

    # ------------------------------------------------------------------
    # 8. Environmental / CO2 impact
    # ------------------------------------------------------------------
    traffic_result["stage8_environment"] = _run_co2_stage(
        traffic_result=traffic_result,
        electricity_result=electricity_result,
        waste_result=traffic_result.get("stage7_waste", {}),
    )

    return traffic_result


def _resolve_zone_coords(
    zone_id: str,
    latitude: float | None,
    longitude: float | None,
) -> tuple[float | None, float | None]:
    """Return zone centroid coordinates for the water/waste models.

    When lat/lon are supplied directly they are used; otherwise we look up
    the zone centroid from the authoritative zone dataset.
    """
    if latitude is not None and longitude is not None:
        return latitude, longitude
    try:
        zone_df = _load_zone_df()
        row = zone_df[zone_df["zone_id"] == zone_id]
        if not row.empty:
            return float(row.iloc[0]["centroid_lat"]), float(row.iloc[0]["centroid_lon"])
    except (FileNotFoundError, KeyError, ValueError):
        pass
    return None, None


def _run_water_stage(
    canonical_type: str,
    props: dict,
    zone_id: str,
    latitude: float | None,
    longitude: float | None,
    hour: int,
) -> dict:
    """Run the water demand prediction stage (single type or mixed-use)."""
    if canonical_type == "mixed_use":
        return _run_mixed_use_water(props, zone_id, hour)

    try:
        result = run_water_prediction(
            dev_type=canonical_type,
            zone_id=zone_id,
            properties=props,
            simulation_hour=hour,
        )
        return {
            "water_available": True,
            "water_demand_m3_hour": result["prediction"],
            "water_demand_liters_hour": result["prediction_liters"],
            "unit": result["unit"],
            "model": result["model"],
        }
    except (ValueError, WaterUnavailableError) as exc:
        return {
            "water_available": False,
            "reason": str(exc),
        }


def _run_mixed_use_water(props: dict, zone_id: str, hour: int) -> dict:
    components = []
    for comp_type, comp_props in _decompose_mixed_use_properties(props).items():
        try:
            out = run_water_prediction(
                dev_type=comp_type,
                zone_id=zone_id,
                properties=comp_props,
                simulation_hour=hour,
            )
            components.append({
                "component": comp_type,
                "water_demand_m3_hour": out["prediction"],
                "water_demand_liters_hour": out["prediction_liters"],
            })
        except (ValueError, WaterUnavailableError) as exc:
            components.append({
                "component": comp_type,
                "water_demand_m3_hour": None,
                "reason": str(exc),
            })

    valid = [c for c in components if c.get("water_demand_m3_hour") is not None]
    if not valid:
        return {
            "water_available": False,
            "reason": "No mixed-use water component could be predicted.",
            "components": components,
        }
    total_m3 = sum(c["water_demand_m3_hour"] for c in valid)
    return {
        "water_available": True,
        "water_demand_m3_hour": round(total_m3, 4),
        "water_demand_liters_hour": round(total_m3 * 1000, 2),
        "unit": "m3",
        "mixed_use": True,
        "decomposition": WATER_WASTE_MIXED_USE_SPLIT,
        "components": components,
    }


def _run_waste_stage(
    canonical_type: str,
    props: dict,
    zone_id: str,
    latitude: float | None,
    longitude: float | None,
    hour: int,
) -> dict:
    """Run the solid waste generation prediction stage."""
    zone_lat, zone_lon = _resolve_zone_coords(zone_id, latitude, longitude)

    if canonical_type == "mixed_use":
        return _run_mixed_use_waste(props, zone_lat, zone_lon)

    try:
        result = run_waste_prediction(
            dev_type=canonical_type,
            properties=props,
            zone_lat=zone_lat,
            zone_lon=zone_lon,
        )
        return {
            "waste_available": True,
            "waste_generation_kg_day": result["waste_generation_kg"],
            "waste_generation_tonnes_day": result["waste_generation_tonnes"],
            "model": result["model"],
        }
    except (ValueError, WasteUnavailableError) as exc:
        return {
            "waste_available": False,
            "reason": str(exc),
        }


def _run_mixed_use_waste(props: dict, zone_lat: float | None, zone_lon: float | None) -> dict:
    components = []
    for comp_type, comp_props in _decompose_mixed_use_properties(props).items():
        try:
            out = run_waste_prediction(
                dev_type=comp_type,
                properties=comp_props,
                zone_lat=zone_lat,
                zone_lon=zone_lon,
            )
            components.append({
                "component": comp_type,
                "waste_generation_kg_day": out["waste_generation_kg"],
            })
        except (ValueError, WasteUnavailableError) as exc:
            components.append({
                "component": comp_type,
                "waste_generation_kg_day": None,
                "reason": str(exc),
            })

    valid = [c for c in components if c.get("waste_generation_kg_day") is not None]
    if not valid:
        return {
            "waste_available": False,
            "reason": "No mixed-use waste component could be predicted.",
            "components": components,
        }
    total_kg = sum(c["waste_generation_kg_day"] for c in valid)
    return {
        "waste_available": True,
        "waste_generation_kg_day": round(total_kg, 2),
        "waste_generation_tonnes_day": round(total_kg / 1000, 5),
        "mixed_use": True,
        "decomposition": WATER_WASTE_MIXED_USE_SPLIT,
        "components": components,
    }


def _run_co2_stage(
    traffic_result: dict,
    electricity_result: dict,
    waste_result: dict,
) -> dict:
    """Compute an indicative CO2 / environmental impact estimate.

    This is a transparent, documented calculation using published emission
    factors — NOT a separate ML model.

    Emission factors (source: UK BEIS / IPCC 2019 default grid + UK DEFRA
    conversion factors, widely used as proxy for Egypt's mixed fossil grid):
      - Grid electricity ~0.5 kg CO2e / kWh
      - Private road transport ~0.18 kg CO2e / vehicle-km
      - Waste treatment (mixed residual, landfill-default) ~0.5 t CO2e / t waste

    These are indicative proxy factors.  They are documented here so the
    calculation is reproducible and auditable; where the true factor for
    the Egyptian grid is required it should replace the default grid value.
    """
    factors = {
        "electricity_kg_co2_per_kwh": 0.5,
        "road_transport_kg_co2_per_vkm": 0.18,
        "waste_kg_co2_per_kg": 0.0005,
        "sources": (
            "Electricity: IPCC 2019 / BEIS grid-average default (proxy for "
            "Egypt's mixed fossil grid). Road transport: UK DEFRA vehicle-Km "
            "factor. Waste: IPCC landfill residual-default factor."
        ),
    }

    electricity_available = electricity_result.get("electricity_available", False)
    electricity_kwh = electricity_result.get(
        "electricity_kwh",
        electricity_result.get("total_floor_area_sqm", 0.0) * 0.0,
    )
    if not electricity_available or not electricity_kwh:
        electricity_available = False
        electricity_kwh = 0.0

    co2_electricity_kg = electricity_kwh * factors["electricity_kg_co2_per_kwh"]

    waste_available = waste_result.get("waste_available", False)
    waste_kg = waste_result.get("waste_generation_kg_day", 0.0)
    if not waste_available:
        waste_kg = 0.0
    co2_waste_kg = waste_kg * factors["waste_kg_co2_per_kg"]

    daily_trips = (
        traffic_result.get("stage1_od_demand", {})
        .get("daily_total_trips", 0.0)
    )
    avg_trip_km = 12.0  # assumed average trip length within the study area (km)
    co2_transport_kg = daily_trips * avg_trip_km * factors["road_transport_kg_co2_per_vkm"]

    total_co2_kg = co2_electricity_kg + co2_waste_kg + co2_transport_kg

    return {
        "co2_available": True,
        "co2_electricity_kg": round(co2_electricity_kg, 2),
        "co2_waste_kg": round(co2_waste_kg, 2),
        "co2_transport_kg": round(co2_transport_kg, 2),
        "total_co2_kg": round(total_co2_kg, 2),
        "total_co2_tonnes": round(total_co2_kg / 1000, 4),
        "method": (
            "Transparent emissions calculation using published emission "
            "factors (not an ML model). See factors below."
        ),
        "factors": factors,
    }


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
