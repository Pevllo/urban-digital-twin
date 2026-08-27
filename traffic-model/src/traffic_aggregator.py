"""
Stage 3B — Scenario Traffic Aggregator — AI Urban Digital Twin

Aggregates Stage 2 assigned development trips with existing trained XGBoost
baseline traffic volume predictions to produce scenario traffic volume per road link.

Formula:
  V_scenario(e, h) = V_base(e, h) + ΔV_assigned(e, h)

Where:
  V_base(e, h)      = Baseline background traffic predicted by traffic_xgb_model.joblib
  ΔV_assigned(e, h) = Additional development trips assigned to link e by Stage 2
  V_scenario(e, h)  = Resulting What-If scenario traffic volume

Note: Does NOT retrain the ML model. Preserves physical demand conservation and
distinguishes baseline background traffic from incremental What-If development impact.
"""

from dataclasses import asdict, dataclass, field
import math
from pathlib import Path
import sys
from typing import Any, Dict, List, Optional, Union

import geopandas as gpd
import numpy as np
import pandas as pd

# Internal imports
SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent.parent

if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))
if str(PROJECT_ROOT / "trip-demand-model" / "src") not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT / "trip-demand-model" / "src"))

import config
import predict
import train
from traffic_assignment import LinkFlowRecord, TrafficAssignmentResult
from trip_generation import ODDemandMatrix


@dataclass
class RoadImpactRecord:
    road_id: str
    hour: int
    baseline_traffic_veh_h: float
    assigned_trips_veh_h: float
    scenario_traffic_veh_h: float
    road_capacity_proxy: float
    vc_ratio_baseline: float
    vc_ratio_scenario: float
    delta_traffic_veh_h: float
    delta_percentage: float
    road_type: str = "unclassified"
    road_length_m: float = 0.0

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class ScenarioTrafficResult:
    hour: int
    development_type: str
    origin_zone: str
    total_development_trips: float
    assigned_external_trips: float
    unassigned_internal_trips: float
    road_impacts: List[RoadImpactRecord] = field(default_factory=list)
    unmatched_stage2_edges: List[Dict[str, Any]] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "hour": self.hour,
            "development_type": self.development_type,
            "origin_zone": self.origin_zone,
            "total_development_trips": self.total_development_trips,
            "assigned_external_trips": self.assigned_external_trips,
            "unassigned_internal_trips": self.unassigned_internal_trips,
            "road_impacts": [r.to_dict() for r in self.road_impacts],
            "unmatched_stage2_edges": self.unmatched_stage2_edges,
        }


def build_road_baseline_feature_row(row: pd.Series, hour: int = 8, timestamp_str: Optional[str] = None) -> pd.DataFrame:
    """
    Constructs a DataFrame row containing the 27 MODEL_FEATURES required by the trained XGBoost model.
    Historical lags and rolling features represent pre-development baseline background traffic.
    """
    if timestamp_str:
        ts = pd.Timestamp(timestamp_str)
    else:
        # Default to a baseline Monday timestamp matching hour
        ts = pd.Timestamp("2026-02-02 00:00:00") + pd.Timedelta(hours=hour)

    h = ts.hour
    dow = ts.weekday()
    mo = ts.month
    is_w = dow in config.WEEKEND_DAYS
    is_p = (config.MORNING_PEAK_HOURS[0] <= h < config.MORNING_PEAK_HOURS[1] or
            config.EVENING_PEAK_HOURS[0] <= h < config.EVENING_PEAK_HOURS[1])

    cap = float(row.get("road_capacity_proxy", 1000.0))
    hw = str(row.get("highway", row.get("road_type", "unclassified")))
    class_factor = config.ROAD_CLASS_FACTORS.get(hw, config.UNKNOWN_CLASS_FACTOR)
    profile = config.HOURLY_PROFILE_WEEKEND[h] if is_w else config.HOURLY_PROFILE_WEEKDAY[h]
    base_est = class_factor * config.BASE_DEMAND * profile

    rec = {
        "road_type": hw,
        "road_length_m": float(row.get("road_length_m", 100.0)),
        "lane_count": int(row.get("lane_count", 2)),
        "speed_limit_kmh": float(row.get("speed_limit_kmh", 50.0)),
        "is_oneway": bool(row.get("is_oneway", False)),
        "is_bridge": bool(row.get("is_bridge", False)),
        "is_tunnel": bool(row.get("is_tunnel", False)),
        "road_capacity_proxy": cap,
        "intersection_density": float(row.get("intersection_density", 1.0)),
        "node_degree": int(row.get("node_degree", 2)),
        "connected_road_count": int(row.get("connected_road_count", 2)),
        "hour": h,
        "day_of_week": dow,
        "month": mo,
        "is_weekend": is_w,
        "is_peak_hour": is_p,
        "hour_sin": float(np.sin(2 * np.pi * h / 24)),
        "hour_cos": float(np.cos(2 * np.pi * h / 24)),
        "day_sin": float(np.sin(2 * np.pi * dow / 7)),
        "day_cos": float(np.cos(2 * np.pi * dow / 7)),
        "traffic_volume_lag_1h": base_est,
        "traffic_volume_lag_2h": base_est * 0.95,
        "traffic_volume_lag_24h": base_est,
        "traffic_volume_lag_168h": base_est,
        "rolling_mean_3h": base_est,
        "rolling_mean_6h": base_est,
        "rolling_mean_24h": base_est,
    }
    return pd.DataFrame([rec])


def calculate_vc_ratio(volume: float, capacity: float) -> float:
    """Safely calculates Volume-to-Capacity ratio (V/C), handling zero or missing capacity."""
    if capacity is None or math.isnan(capacity) or capacity <= 0.0:
        return 0.0
    return round(float(volume) / float(capacity), 4)


def aggregate_scenario_traffic(
    od_demand: ODDemandMatrix,
    assignment_result: TrafficAssignmentResult,
    roads_gdf: Optional[gpd.GeoDataFrame] = None,
    xgb_model: Any = None,
    hour: Optional[int] = None,
    include_unaffected_roads: bool = False,
) -> ScenarioTrafficResult:
    """
    Main Stage 3B aggregator function.

    Combines Stage 2 assigned trips with XGBoost baseline predictions.
    Computes V_scenario = V_base + ΔV_assigned for each road link.
    """
    target_hour = hour if hour is not None else assignment_result.hour

    if roads_gdf is None:
        gpkg_path = config.OSM_ROADS_GPKG
        if gpkg_path.exists():
            roads_gdf = gpd.read_file(gpkg_path)
        else:
            roads_gdf, _, _ = osm_loader.load_osm()
            roads_gdf = osm_features.compute_base_features(roads_gdf)
            roads_gdf = road_network.add_topology_features(roads_gdf)

    if xgb_model is None:
        xgb_model, _ = predict.load_model()

    drivable = roads_gdf[roads_gdf["is_drivable"]].copy() if "is_drivable" in roads_gdf.columns else roads_gdf.copy()
    road_lookup: Dict[str, pd.Series] = {str(r["road_id"]): r for _, r in drivable.iterrows()}
    way_lookup: Dict[int, List[pd.Series]] = {}
    for _, r in drivable.iterrows():
        wid = int(r["osm_way_id"])
        way_lookup.setdefault(wid, []).append(r)

    assigned_map: Dict[str, float] = {}
    unmatched_edges: List[Dict[str, Any]] = []

    for lf in assignment_result.link_flows:
        eid = str(lf.edge_id)
        trips = float(lf.assigned_trips)

        if eid in road_lookup:
            assigned_map[eid] = assigned_map.get(eid, 0.0) + trips
        elif eid.startswith("osm_") and eid.replace("osm_", "").isdigit():
            wid = int(eid.replace("osm_", ""))
            if wid in way_lookup:
                sub_segs = way_lookup[wid]
                for sub in sub_segs:
                    sub_id = str(sub["road_id"])
                    assigned_map[sub_id] = assigned_map.get(sub_id, 0.0) + trips
            else:
                unmatched_edges.append({"edge_id": eid, "assigned_trips": trips, "reason": "osm_way_id not found in drivable network"})
        else:
            unmatched_edges.append({"edge_id": eid, "assigned_trips": trips, "reason": "road_id not found in drivable network"})

    if include_unaffected_roads:
        target_road_ids = list(road_lookup.keys())
    else:
        target_road_ids = list(assigned_map.keys())

    impact_records: List[RoadImpactRecord] = []

    for rid in target_road_ids:
        if rid not in road_lookup:
            continue

        r_row = road_lookup[rid]
        delta_trips = assigned_map.get(rid, 0.0)

        feat_df = build_road_baseline_feature_row(r_row, hour=target_hour)
        base_pred = float(predict.predict_batch(feat_df, model=xgb_model)[0])
        base_pred = max(0.0, base_pred)

        scen_pred = base_pred + delta_trips
        cap = float(r_row.get("road_capacity_proxy", 1000.0))

        vc_base = calculate_vc_ratio(base_pred, cap)
        vc_scen = calculate_vc_ratio(scen_pred, cap)

        delta_pct = round((delta_trips / max(base_pred, 1.0)) * 100.0, 2)

        record = RoadImpactRecord(
            road_id=rid,
            hour=target_hour,
            baseline_traffic_veh_h=round(base_pred, 2),
            assigned_trips_veh_h=round(delta_trips, 2),
            scenario_traffic_veh_h=round(scen_pred, 2),
            road_capacity_proxy=round(cap, 2),
            vc_ratio_baseline=vc_base,
            vc_ratio_scenario=vc_scen,
            delta_traffic_veh_h=round(delta_trips, 2),
            delta_percentage=delta_pct,
            road_type=str(r_row.get("highway", "unclassified")),
            road_length_m=float(r_row.get("road_length_m", 0.0)),
        )
        impact_records.append(record)

    impact_records.sort(key=lambda r: r.assigned_trips_veh_h, reverse=True)

    total_demand = float(od_demand.total_trips)
    assigned_ext = float(assignment_result.assigned_trips)
    unassigned_int = float(max(0.0, total_demand - assigned_ext))

    return ScenarioTrafficResult(
        hour=target_hour,
        development_type=od_demand.development_type,
        origin_zone=od_demand.origin_zone,
        total_development_trips=round(total_demand, 2),
        assigned_external_trips=round(assigned_ext, 2),
        unassigned_internal_trips=round(unassigned_int, 2),
        road_impacts=impact_records,
        unmatched_stage2_edges=unmatched_edges,
    )
