"""
Stage 4 — Traffic Impact & Level-of-Service (LOS) Assessment — AI Urban Digital Twin

Deterministic impact analysis module consuming Stage 3B scenario traffic aggregation results.
Calculates:
  - Baseline and Scenario Volume-to-Capacity (V/C) ratios
  - Baseline and Scenario Level of Service (LOS A–F)
  - LOS deterioration levels
  - Road-level impact severity (LOW, MODERATE, HIGH, CRITICAL)
  - Deterministic bottleneck ranking score
  - Scenario-level impact summary & overall impact level
"""

from dataclasses import asdict, dataclass, field
import json
import math
from pathlib import Path
import sys
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd

# Path setup
SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent.parent

if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))
if str(PROJECT_ROOT / "traffic-model" / "src") not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT / "traffic-model" / "src"))

import config
from traffic_aggregator import RoadImpactRecord, ScenarioTrafficResult

DEFAULT_CONFIG_PATH = PROJECT_ROOT / "traffic-model" / "config" / "impact_thresholds.json"

LOS_ORDER = {"A": 0, "B": 1, "C": 2, "D": 3, "E": 4, "F": 5}


def load_impact_config(config_path: Optional[Path] = None) -> Dict[str, Any]:
    """Loads impact thresholds and scoring weights from JSON configuration file."""
    path = config_path or DEFAULT_CONFIG_PATH
    if path.exists():
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass

    # Fallback default configuration
    return {
        "prototype_disclaimer": "Default prototype threshold configuration.",
        "los_thresholds": {"A": 0.60, "B": 0.70, "C": 0.80, "D": 0.90, "E": 1.00, "F": 999.0},
        "impact_severity_rules": {
            "critical_vc_threshold": 1.00,
            "critical_los": "F",
            "high_vc_threshold": 0.90,
            "high_los_drop": 2,
            "moderate_vc_threshold": 0.80,
            "moderate_los_drop": 1,
        },
        "bottleneck_scoring_weights": {
            "weight_vc": 0.40,
            "weight_delta_volume": 0.30,
            "weight_los_deterioration": 0.30,
            "max_reference_delta_veh_h": 500.0,
        },
        "overall_impact_rules": {
            "critical_vc": 1.00,
            "high_vc": 0.90,
            "high_worsened_road_count": 5,
            "moderate_worsened_road_count": 1,
        },
    }


def classify_los(vc_ratio: float, cfg: Optional[Dict[str, Any]] = None) -> str:
    """
    Classifies Volume-to-Capacity ratio into Level of Service (LOS A–F).
    Default prototype thresholds:
      A: V/C < 0.60
      B: 0.60 <= V/C < 0.70
      C: 0.70 <= V/C < 0.80
      D: 0.80 <= V/C < 0.90
      E: 0.90 <= V/C < 1.00
      F: V/C >= 1.00
    """
    if vc_ratio is None or math.isnan(vc_ratio) or vc_ratio < 0.0:
        return "A"

    t = (cfg or {}).get("los_thresholds", {})
    a_th = t.get("A", 0.60)
    b_th = t.get("B", 0.70)
    c_th = t.get("C", 0.80)
    d_th = t.get("D", 0.90)
    e_th = t.get("E", 1.00)

    if vc_ratio < a_th:
        return "A"
    elif vc_ratio < b_th:
        return "B"
    elif vc_ratio < c_th:
        return "C"
    elif vc_ratio < d_th:
        return "D"
    elif vc_ratio < e_th:
        return "E"
    else:
        return "F"


def calculate_los_change(base_los: str, scen_los: str) -> Tuple[int, bool]:
    """Calculates numerical LOS deterioration levels (e.g. C -> D is +1) and worsened flag."""
    base_val = LOS_ORDER.get(base_los, 0)
    scen_val = LOS_ORDER.get(scen_los, 0)
    drop_levels = max(0, scen_val - base_val)
    worsened = drop_levels > 0
    return drop_levels, worsened


def classify_impact_severity(scen_vc: float, los_drop: int, scen_los: str, cfg: Optional[Dict[str, Any]] = None) -> str:
    """
    Classifies road impact severity: CRITICAL, HIGH, MODERATE, or LOW.
    Deterministic prototype decision rules:
      CRITICAL: V/C >= 1.00 OR LOS becomes F
      HIGH: V/C >= 0.90 OR LOS worsens by >= 2 levels
      MODERATE: V/C >= 0.80 OR LOS worsens by >= 1 level
      LOW: otherwise
    """
    rules = (cfg or {}).get("impact_severity_rules", {})
    crit_vc = rules.get("critical_vc_threshold", 1.00)
    high_vc = rules.get("high_vc_threshold", 0.90)
    high_drop = rules.get("high_los_drop", 2)
    mod_vc = rules.get("moderate_vc_threshold", 0.80)
    mod_drop = rules.get("moderate_los_drop", 1)

    if scen_vc >= crit_vc or scen_los == "F":
        return "CRITICAL"
    elif scen_vc >= high_vc or los_drop >= high_drop:
        return "HIGH"
    elif scen_vc >= mod_vc or los_drop >= mod_drop:
        return "MODERATE"
    else:
        return "LOW"


def compute_bottleneck_score(scen_vc: float, delta_traffic: float, los_drop: int, cfg: Optional[Dict[str, Any]] = None) -> float:
    """
    Computes a transparent deterministic bottleneck impact score (0.0 to 100.0).
    Score = w_vc * norm(V/C) + w_delta * norm(ΔV) + w_los * norm(ΔLOS)
    """
    weights = (cfg or {}).get("bottleneck_scoring_weights", {})
    w_vc = weights.get("weight_vc", 0.40)
    w_delta = weights.get("weight_delta_volume", 0.30)
    w_los = weights.get("weight_los_deterioration", 0.30)
    max_ref_delta = weights.get("max_reference_delta_veh_h", 500.0)

    vc_norm = min(max(scen_vc, 0.0) / 1.5, 1.0)
    delta_norm = min(max(delta_traffic, 0.0) / max_ref_delta, 1.0)
    los_norm = min(max(los_drop, 0) / 5.0, 1.0)

    score = (w_vc * vc_norm + w_delta * delta_norm + w_los * los_norm) * 100.0
    return round(float(score), 2)


@dataclass
class RoadImpactAssessment:
    road_id: str
    hour: int
    road_type: str
    road_length_m: float
    road_capacity_proxy: float
    baseline_traffic_veh_h: float
    assigned_trips_veh_h: float
    scenario_traffic_veh_h: float
    delta_traffic_veh_h: float
    delta_percentage: float
    baseline_vc: float
    scenario_vc: float
    vc_change: float
    baseline_los: str
    scenario_los: str
    los_change_levels: int
    is_los_worsened: bool
    impact_severity: str
    bottleneck_score: float

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class ImpactAssessmentResult:
    development_type: str
    origin_zone: str
    hour: int
    total_development_trips: float
    assigned_external_trips: float
    unassigned_internal_trips: float
    number_of_affected_roads: int
    roads_worsened_count: int
    roads_reaching_los_E_or_F_count: int
    roads_reaching_vc_1_or_more_count: int
    max_delta_traffic_veh_h: float
    average_delta_traffic_veh_h: float
    max_scenario_vc: float
    average_scenario_vc: float
    baseline_average_vc: float
    overall_impact_level: str
    road_assessments: List[RoadImpactAssessment] = field(default_factory=list)
    top_bottlenecks: List[RoadImpactAssessment] = field(default_factory=list)
    prototype_disclaimer: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return {
            "development_type": self.development_type,
            "origin_zone": self.origin_zone,
            "hour": self.hour,
            "total_development_trips": self.total_development_trips,
            "assigned_external_trips": self.assigned_external_trips,
            "unassigned_internal_trips": self.unassigned_internal_trips,
            "number_of_affected_roads": self.number_of_affected_roads,
            "roads_worsened_count": self.roads_worsened_count,
            "roads_reaching_los_E_or_F_count": self.roads_reaching_los_E_or_F_count,
            "roads_reaching_vc_1_or_more_count": self.roads_reaching_vc_1_or_more_count,
            "max_delta_traffic_veh_h": self.max_delta_traffic_veh_h,
            "average_delta_traffic_veh_h": self.average_delta_traffic_veh_h,
            "max_scenario_vc": self.max_scenario_vc,
            "average_scenario_vc": self.average_scenario_vc,
            "baseline_average_vc": self.baseline_average_vc,
            "overall_impact_level": self.overall_impact_level,
            "top_bottlenecks": [b.to_dict() for b in self.top_bottlenecks],
            "road_assessments": [r.to_dict() for r in self.road_assessments],
            "prototype_disclaimer": self.prototype_disclaimer,
        }


def assess_traffic_impact(
    scenario_result: ScenarioTrafficResult,
    config_path: Optional[Path] = None,
    top_k_bottlenecks: int = 10,
) -> ImpactAssessmentResult:
    """
    Main Stage 4 entry point.

    Consumes Stage 3B ScenarioTrafficResult, evaluates road-level V/C and LOS impacts,
    identifies bottlenecks, and produces a scenario-level impact assessment summary.
    """
    cfg = load_impact_config(config_path)

    assessments: List[RoadImpactAssessment] = []

    # Process all affected roads (or road impacts from Stage 3B)
    for record in scenario_result.road_impacts:
        base_v = float(record.baseline_traffic_veh_h)
        assigned_v = float(record.assigned_trips_veh_h)
        scen_v = float(record.scenario_traffic_veh_h)
        cap = float(record.road_capacity_proxy)

        # Sanity checks: Verify scenario traffic >= baseline traffic
        if scen_v < base_v - 1e-3:
            raise ValueError(f"Sanity failure on road {record.road_id}: scenario_traffic ({scen_v}) < baseline_traffic ({base_v})")

        delta_v = scen_v - base_v
        delta_pct = (delta_v / max(base_v, 1.0)) * 100.0 if base_v > 0.0 else 0.0

        vc_base = float(record.vc_ratio_baseline)
        vc_scen = float(record.vc_ratio_scenario)
        vc_change = round(vc_scen - vc_base, 4)

        # Sanity check: Verify scenario V/C >= baseline V/C
        if vc_scen < vc_base - 1e-4:
            raise ValueError(f"Sanity failure on road {record.road_id}: scenario_vc ({vc_scen}) < baseline_vc ({vc_base})")

        base_los = classify_los(vc_base, cfg)
        scen_los = classify_los(vc_scen, cfg)

        los_drop, worsened = calculate_los_change(base_los, scen_los)
        severity = classify_impact_severity(vc_scen, los_drop, scen_los, cfg)
        b_score = compute_bottleneck_score(vc_scen, delta_v, los_drop, cfg)

        assessment = RoadImpactAssessment(
            road_id=str(record.road_id),
            hour=int(record.hour),
            road_type=str(record.road_type),
            road_length_m=float(record.road_length_m),
            road_capacity_proxy=round(cap, 2),
            baseline_traffic_veh_h=round(base_v, 2),
            assigned_trips_veh_h=round(assigned_v, 2),
            scenario_traffic_veh_h=round(scen_v, 2),
            delta_traffic_veh_h=round(delta_v, 2),
            delta_percentage=round(delta_pct, 2),
            baseline_vc=round(vc_base, 4),
            scenario_vc=round(vc_scen, 4),
            vc_change=vc_change,
            baseline_los=base_los,
            scenario_los=scen_los,
            los_change_levels=los_drop,
            is_los_worsened=worsened,
            impact_severity=severity,
            bottleneck_score=b_score,
        )
        assessments.append(assessment)

    # Sort bottlenecks by bottleneck_score descending
    bottlenecks = sorted(assessments, key=lambda a: a.bottleneck_score, reverse=True)[:top_k_bottlenecks]

    # Scenario-level summary metrics
    n_affected = len(assessments)
    worsened_count = sum(1 for a in assessments if a.is_los_worsened)
    los_ef_count = sum(1 for a in assessments if a.scenario_los in ("E", "F"))
    vc_1_plus_count = sum(1 for a in assessments if a.scenario_vc >= 1.00)

    deltas = [a.delta_traffic_veh_h for a in assessments]
    scen_vcs = [a.scenario_vc for a in assessments]
    base_vcs = [a.baseline_vc for a in assessments]

    max_delta = max(deltas) if deltas else 0.0
    avg_delta = sum(deltas) / max(n_affected, 1) if deltas else 0.0
    max_scen_vc = max(scen_vcs) if scen_vcs else 0.0
    avg_scen_vc = sum(scen_vcs) / max(n_affected, 1) if scen_vcs else 0.0
    avg_base_vc = sum(base_vcs) / max(n_affected, 1) if base_vcs else 0.0

    # Overall scenario impact level
    rules = cfg.get("overall_impact_rules", {})
    crit_vc_rule = rules.get("critical_vc", 1.00)
    high_vc_rule = rules.get("high_vc", 0.90)
    high_worsened_rule = rules.get("high_worsened_road_count", 5)

    if vc_1_plus_count > 0 or max_scen_vc >= crit_vc_rule:
        overall_impact = "CRITICAL"
    elif max_scen_vc >= high_vc_rule or worsened_count >= high_worsened_rule:
        overall_impact = "HIGH"
    elif worsened_count > 0 or los_ef_count > 0:
        overall_impact = "MODERATE"
    else:
        overall_impact = "LOW"

    return ImpactAssessmentResult(
        development_type=scenario_result.development_type,
        origin_zone=scenario_result.origin_zone,
        hour=scenario_result.hour,
        total_development_trips=scenario_result.total_development_trips,
        assigned_external_trips=scenario_result.assigned_external_trips,
        unassigned_internal_trips=scenario_result.unassigned_internal_trips,
        number_of_affected_roads=n_affected,
        roads_worsened_count=worsened_count,
        roads_reaching_los_E_or_F_count=los_ef_count,
        roads_reaching_vc_1_or_more_count=vc_1_plus_count,
        max_delta_traffic_veh_h=round(max_delta, 2),
        average_delta_traffic_veh_h=round(avg_delta, 2),
        max_scenario_vc=round(max_scen_vc, 4),
        average_scenario_vc=round(avg_scen_vc, 4),
        baseline_average_vc=round(avg_base_vc, 4),
        overall_impact_level=overall_impact,
        road_assessments=assessments,
        top_bottlenecks=bottlenecks,
        prototype_disclaimer=cfg.get("prototype_disclaimer", ""),
    )
