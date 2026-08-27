"""
Trip Generation & Origin-Destination (OD) Demand Module
AI Urban Digital Twin + What-If Simulator — Stage 1

Given a proposed land-use development scenario (residential compound, hospital,
mall, school, office), location/zone, and properties, this module:
  1. Validates development properties and scale inputs.
  2. Calculates daily and 24-hour trip productions & attractions using configurable rates.
  3. Distributes generated trip demand to surrounding zones using a Gravity Model.

Independent from traffic models and assignment engines.
"""

from __future__ import annotations

import json
import math
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union

import pandas as pd
import numpy as np

# Module Paths
MODULE_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = MODULE_DIR.parent
DEFAULT_RATES_PATH = PROJECT_ROOT / "config" / "trip_generation_rates.json"
DEFAULT_PROFILES_PATH = PROJECT_ROOT / "config" / "hourly_profiles.json"
DEFAULT_ZONE_CSV_PATH = PROJECT_ROOT / "data" / "raw" / "zone_osm_mapping_v2.csv"

SUPPORTED_DEVELOPMENT_TYPES = {
    "residential_compound",
    "hospital",
    "mall",
    "school",
    "office",
}


@dataclass
class DevelopmentInput:
    """Input payload representing a proposed urban development."""
    development_type: str
    zone_id: str
    properties: Dict[str, float]
    name: Optional[str] = None
    simulation_hour: Optional[int] = None

    def __post_init__(self):
        self.development_type = str(self.development_type).lower().strip()
        self.zone_id = str(self.zone_id).strip()


@dataclass
class TripGenerationResult:
    """Structured output of the trip generation stage."""
    development_type: str
    zone_id: str
    daily_trips: float
    hourly_trips: Dict[int, float]
    productions: Dict[int, float]
    attractions: Dict[int, float]
    properties_used: Dict[str, float] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "development_type": self.development_type,
            "zone_id": self.zone_id,
            "daily_trips": round(float(self.daily_trips), 2),
            "hourly_trips": {int(k): round(float(v), 2) for k, v in self.hourly_trips.items()},
            "productions": {int(k): round(float(v), 2) for k, v in self.productions.items()},
            "attractions": {int(k): round(float(v), 2) for k, v in self.attractions.items()},
            "properties_used": self.properties_used,
        }


@dataclass
class ODTripRecord:
    """Single Origin-Destination trip flow entry."""
    origin_zone: str
    destination_zone: str
    trips: float

    def to_dict(self) -> Dict[str, Any]:
        return {
            "origin_zone": self.origin_zone,
            "destination_zone": self.destination_zone,
            "trips": round(float(self.trips), 2),
        }


@dataclass
class ODDemandMatrix:
    """Structured OD matrix payload for downstream Traffic Assignment."""
    hour: int
    development_type: str
    origin_zone: str
    total_trips: float
    od_matrix: List[ODTripRecord]

    def to_dict(self) -> Dict[str, Any]:
        return {
            "hour": int(self.hour),
            "development_type": self.development_type,
            "origin_zone": self.origin_zone,
            "total_trips": round(float(self.total_trips), 2),
            "od_matrix": [r.to_dict() for r in self.od_matrix],
        }


def haversine_distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Compute Haversine distance in kilometers between two geographic coordinates."""
    R = 6371.0  # Earth radius in km
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (
        math.sin(dlat / 2.0) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(dlon / 2.0) ** 2
    )
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return R * c


def load_config_files(
    rates_path: Optional[Path] = None,
    profiles_path: Optional[Path] = None,
) -> Tuple[Dict[str, Any], Dict[str, List[float]]]:
    """Load and parse rates and hourly profiles JSON configuration files."""
    r_path = rates_path or DEFAULT_RATES_PATH
    p_path = profiles_path or DEFAULT_PROFILES_PATH

    if not r_path.exists():
        raise FileNotFoundError(f"Trip generation rates config not found at: {r_path}")
    if not p_path.exists():
        raise FileNotFoundError(f"Hourly profiles config not found at: {p_path}")

    with open(r_path, "r", encoding="utf-8") as f:
        rates_data = json.load(f)

    with open(p_path, "r", encoding="utf-8") as f:
        profiles_data = json.load(f)

    return rates_data["rates"], profiles_data["profiles"]


def load_zone_mapping(csv_path: Optional[Path] = None) -> pd.DataFrame:
    """Load zone centroid definitions from zone_osm_mapping_v2.csv."""
    path = csv_path or DEFAULT_ZONE_CSV_PATH
    if not path.exists():
        raise FileNotFoundError(f"Zone mapping file not found at: {path}")

    df = pd.read_csv(path)
    required_cols = {"zone_id", "centroid_lat", "centroid_lon"}
    if not required_cols.issubset(df.columns):
        raise ValueError(f"Zone mapping CSV missing required columns: {required_cols - set(df.columns)}")

    df["zone_id"] = df["zone_id"].astype(str).str.strip()
    return df


def validate_development_input(
    input_data: DevelopmentInput,
    zone_ids: Optional[set] = None,
) -> None:
    """Validate input payload, property ranges, and zone existence."""
    dev_type = input_data.development_type
    if dev_type not in SUPPORTED_DEVELOPMENT_TYPES:
        raise ValueError(
            f"Unsupported development type '{dev_type}'. "
            f"Must be one of: {sorted(SUPPORTED_DEVELOPMENT_TYPES)}"
        )

    if zone_ids is not None and input_data.zone_id not in zone_ids:
        raise ValueError(f"Zone ID '{input_data.zone_id}' not found in zone dataset.")

    props = input_data.properties
    if not isinstance(props, dict):
        raise ValueError("Development properties must be a dictionary.")

    # Check for negative values
    for k, v in props.items():
        if not isinstance(v, (int, float)) or math.isnan(v) or v < 0:
            raise ValueError(f"Property '{k}' must be a non-negative number. Got: {v}")

    # Development type specific validation
    if dev_type == "residential_compound":
        num_res = props.get("num_residents", 0)
        num_units = props.get("num_units", 0)
        if num_res <= 0 and num_units <= 0:
            raise ValueError(
                "residential_compound requires at least one positive metric: 'num_residents' or 'num_units'."
            )

    elif dev_type == "hospital":
        beds = props.get("num_beds", 0)
        staff = props.get("staff_count", 0)
        if beds <= 0 and staff <= 0:
            raise ValueError(
                "hospital requires at least one positive metric: 'num_beds' or 'staff_count'."
            )

    elif dev_type == "mall":
        gla = props.get("gross_leasable_area_sqm", 0)
        cap = props.get("visitor_capacity", 0)
        if gla <= 0 and cap <= 0:
            raise ValueError(
                "mall requires at least one positive metric: 'gross_leasable_area_sqm' or 'visitor_capacity'."
            )

    elif dev_type == "school":
        students = props.get("num_students", 0)
        staff = props.get("staff_count", 0)
        if students <= 0 and staff <= 0:
            raise ValueError(
                "school requires at least one positive metric: 'num_students' or 'staff_count'."
            )

    elif dev_type == "office":
        emp = props.get("num_employees", 0)
        gfa = props.get("gross_floor_area_sqm", 0)
        if emp <= 0 and gfa <= 0:
            raise ValueError(
                "office requires at least one positive metric: 'num_employees' or 'gross_floor_area_sqm'."
            )


def calculate_daily_trips(
    dev_type: str,
    properties: Dict[str, float],
    rate_config: Dict[str, Any],
) -> Tuple[float, Dict[str, float]]:
    """Calculate daily trip generation based on development properties and rates."""
    cfg = rate_config[dev_type]["rates"]
    daily_trips = 0.0
    used_props = {}

    if dev_type == "residential_compound":
        if "num_residents" in properties and properties["num_residents"] > 0:
            val = float(properties["num_residents"])
            daily_trips += val * cfg["trips_per_resident_per_day"]
            used_props["num_residents"] = val
        elif "num_units" in properties and properties["num_units"] > 0:
            val = float(properties["num_units"])
            daily_trips += val * cfg["trips_per_unit_per_day"]
            used_props["num_units"] = val

    elif dev_type == "hospital":
        if "num_beds" in properties and properties["num_beds"] > 0:
            val = float(properties["num_beds"])
            daily_trips += val * cfg["trips_per_bed_per_day"]
            used_props["num_beds"] = val
        if "staff_count" in properties and properties["staff_count"] > 0:
            val = float(properties["staff_count"])
            daily_trips += val * cfg.get("trips_per_staff_per_day", 1.5)
            used_props["staff_count"] = val

    elif dev_type == "mall":
        if "gross_leasable_area_sqm" in properties and properties["gross_leasable_area_sqm"] > 0:
            val = float(properties["gross_leasable_area_sqm"])
            daily_trips += (val / 100.0) * cfg["trips_per_100sqm_gla_per_day"]
            used_props["gross_leasable_area_sqm"] = val
        elif "visitor_capacity" in properties and properties["visitor_capacity"] > 0:
            val = float(properties["visitor_capacity"])
            daily_trips += val * cfg["trips_per_visitor_capacity_per_day"]
            used_props["visitor_capacity"] = val

    elif dev_type == "school":
        if "num_students" in properties and properties["num_students"] > 0:
            val = float(properties["num_students"])
            daily_trips += val * cfg["trips_per_student_per_day"]
            used_props["num_students"] = val
        if "staff_count" in properties and properties["staff_count"] > 0:
            val = float(properties["staff_count"])
            daily_trips += val * cfg.get("trips_per_staff_per_day", 1.8)
            used_props["staff_count"] = val

    elif dev_type == "office":
        if "num_employees" in properties and properties["num_employees"] > 0:
            val = float(properties["num_employees"])
            daily_trips += val * cfg["trips_per_employee_per_day"]
            used_props["num_employees"] = val
        elif "gross_floor_area_sqm" in properties and properties["gross_floor_area_sqm"] > 0:
            val = float(properties["gross_floor_area_sqm"])
            daily_trips += (val / 100.0) * cfg["trips_per_100sqm_gfa_per_day"]
            used_props["gross_floor_area_sqm"] = val

    return daily_trips, used_props


def generate_development_trips(
    input_data: DevelopmentInput,
    rates_path: Optional[Path] = None,
    profiles_path: Optional[Path] = None,
    zone_csv_path: Optional[Path] = None,
) -> TripGenerationResult:
    """
    Generate daily and 24-hour hourly trip productions and attractions for a development.
    """
    rates_config, profiles_config = load_config_files(rates_path, profiles_path)
    zone_df = load_zone_mapping(zone_csv_path)
    known_zones = set(zone_df["zone_id"])

    validate_development_input(input_data, known_zones)

    dev_type = input_data.development_type
    daily_trips, used_props = calculate_daily_trips(dev_type, input_data.properties, rates_config)

    # Load and normalize hourly profile
    raw_profile = profiles_config[dev_type]
    profile_arr = np.array(raw_profile, dtype=float)
    total_prof = float(np.sum(profile_arr))
    if total_prof <= 0:
        norm_profile = np.full(24, 1.0 / 24.0)
    else:
        norm_profile = profile_arr / total_prof

    hourly_trips = {}
    productions = {}
    attractions = {}

    directionality_cfg = rates_config[dev_type]["directionality"]

    for h in range(24):
        h_trips = daily_trips * norm_profile[h]
        hourly_trips[h] = h_trips

        if 7 <= h <= 9:
            dir_factors = directionality_cfg.get("morning_peak", {"outbound": 0.5, "inbound": 0.5})
        elif 16 <= h <= 19:
            dir_factors = directionality_cfg.get("evening_peak", {"outbound": 0.5, "inbound": 0.5})
        else:
            dir_factors = directionality_cfg.get("off_peak", {"outbound": 0.5, "inbound": 0.5})

        outbound_ratio = dir_factors["outbound"]
        inbound_ratio = dir_factors["inbound"]

        productions[h] = h_trips * outbound_ratio
        attractions[h] = h_trips * inbound_ratio

    return TripGenerationResult(
        development_type=dev_type,
        zone_id=input_data.zone_id,
        daily_trips=daily_trips,
        hourly_trips=hourly_trips,
        productions=productions,
        attractions=attractions,
        properties_used=used_props,
    )


def distribute_trips_gravity(
    trip_result: TripGenerationResult,
    zone_df: Optional[pd.DataFrame] = None,
    hour: Optional[int] = None,
    gamma: float = 1.5,
    min_dist_km: float = 0.1,
    zone_csv_path: Optional[Path] = None,
) -> ODDemandMatrix:
    """
    Distribute generated trips from origin zone i across surrounding destination zones j using a Gravity Model.

    Formula:
        T_ij(h) = P_i(h) * [ A_j * d_ij^(-gamma) ] / sum_k [ A_k * d_ik^(-gamma) ]
    """
    if gamma <= 0:
        raise ValueError(f"Gravity parameter gamma must be positive. Got: {gamma}")

    if zone_df is None:
        zone_df = load_zone_mapping(zone_csv_path)

    origin_zone = trip_result.zone_id
    origin_row = zone_df[zone_df["zone_id"] == origin_zone]
    if origin_row.empty:
        raise ValueError(f"Origin zone '{origin_zone}' not found in zone dataset.")

    orig_lat = float(origin_row["centroid_lat"].values[0])
    orig_lon = float(origin_row["centroid_lon"].values[0])

    target_hour = hour if hour is not None else 8
    if target_hour not in trip_result.productions:
        target_hour = 8

    produced_trips = trip_result.productions[target_hour]

    dest_records: List[Tuple[str, float]] = []
    weights: List[float] = []

    for _, row in zone_df.iterrows():
        dest_z = str(row["zone_id"])
        if dest_z == origin_zone:
            continue  # Exclude internal trips for external assignment

        d_lat = float(row["centroid_lat"])
        d_lon = float(row["centroid_lon"])

        if math.isnan(d_lat) or math.isnan(d_lon):
            continue

        dist_km = haversine_distance_km(orig_lat, orig_lon, d_lat, d_lon)
        dist_km = max(dist_km, min_dist_km)

        # Attraction proxy A_j = 1.0 (uniform baseline across zones)
        attraction_j = 1.0
        w_ij = attraction_j * (dist_km ** (-gamma))

        if not math.isnan(w_ij) and not math.isinf(w_ij) and w_ij > 0:
            dest_records.append((dest_z, dist_km))
            weights.append(w_ij)

    if not weights or sum(weights) <= 0:
        # Uniform fallback if no valid weights
        n_dest = len(dest_records)
        if n_dest == 0:
            od_trips = []
        else:
            share = produced_trips / n_dest
            od_trips = [
                ODTripRecord(origin_zone=origin_zone, destination_zone=dz, trips=share)
                for dz, _ in dest_records
            ]
    else:
        w_sum = sum(weights)
        od_trips = []
        for (dz, _), w in zip(dest_records, weights):
            trips_ij = produced_trips * (w / w_sum)
            od_trips.append(ODTripRecord(origin_zone=origin_zone, destination_zone=dz, trips=trips_ij))

    sum_distributed_trips = float(sum(r.trips for r in od_trips))

    return ODDemandMatrix(
        hour=target_hour,
        development_type=trip_result.development_type,
        origin_zone=origin_zone,
        total_trips=sum_distributed_trips,
        od_matrix=od_trips,
    )



def calculate_development_od(
    input_data: DevelopmentInput,
    hour: Optional[int] = None,
    gamma: float = 1.5,
    rates_path: Optional[Path] = None,
    profiles_path: Optional[Path] = None,
    zone_csv_path: Optional[Path] = None,
) -> ODDemandMatrix:
    """
    Convenience wrapper: Performs trip generation and Gravity Model distribution in one call.
    """
    zone_df = load_zone_mapping(zone_csv_path)
    trip_res = generate_development_trips(input_data, rates_path, profiles_path, zone_csv_path)
    target_hour = hour if hour is not None else input_data.simulation_hour
    return distribute_trips_gravity(trip_res, zone_df=zone_df, hour=target_hour, gamma=gamma)
