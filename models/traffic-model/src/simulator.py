"""
AI Urban Digital Twin + What-If Simulator Pipeline Entry Point

Unifies the full 4-stage mobility simulation pipeline into ONE high-level function:

    Development Scenario
            ↓
    Stage 1 — Trip Generation & OD Demand (trip_generation.py)
            ↓
    Stage 2 — Traffic Assignment Engine (traffic_assignment.py)
            ↓
    Stage 3B — Baseline XGBoost & Scenario Aggregation (traffic_aggregator.py)
            ↓
    Stage 4 — Traffic Impact & Level-of-Service Assessment (impact_assessment.py)
            ↓
    Unified What-If Simulation Result (simulate_what_if_scenario)
"""

from dataclasses import asdict, dataclass, field
from pathlib import Path
import sys
from typing import Any, Dict, List, Optional, Union

import geopandas as gpd
import pandas as pd

# Path setup
SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent.parent

if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))
if str(PROJECT_ROOT / "trip-demand-model" / "src") not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT / "trip-demand-model" / "src"))

import config
from trip_generation import DevelopmentInput, ODDemandMatrix, calculate_development_od
from traffic_assignment import TrafficAssignmentResult, assign_traffic_aon, build_osm_graph, ZoneNodeResolver
from traffic_aggregator import ScenarioTrafficResult, aggregate_scenario_traffic
from impact_assessment import ImpactAssessmentResult, assess_traffic_impact


@dataclass
class WhatIfSimulationResult:
    development_input: Dict[str, Any]
    hour: int
    stage1_od_demand: ODDemandMatrix
    stage2_assignment: TrafficAssignmentResult
    stage3_scenario_traffic: ScenarioTrafficResult
    stage4_impact_assessment: ImpactAssessmentResult

    def to_dict(self) -> Dict[str, Any]:
        return {
            "development_input": self.development_input,
            "hour": self.hour,
            "stage1_od_demand": self.stage1_od_demand.to_dict() if hasattr(self.stage1_od_demand, "to_dict") else asdict(self.stage1_od_demand),
            "stage2_assignment": self.stage2_assignment.to_dict() if hasattr(self.stage2_assignment, "to_dict") else asdict(self.stage2_assignment),
            "stage3_scenario_traffic": self.stage3_scenario_traffic.to_dict(),
            "stage4_impact_assessment": self.stage4_impact_assessment.to_dict(),
        }


def simulate_what_if_scenario(
    dev_input: DevelopmentInput,
    hour: int = 8,
    gamma: float = 1.5,
    graph: Optional[Any] = None,
    zone_resolver: Optional[ZoneNodeResolver] = None,
    roads_gdf: Optional[gpd.GeoDataFrame] = None,
    xgb_model: Optional[Any] = None,
    config_path: Optional[Path] = None,
) -> WhatIfSimulationResult:
    """
    ONE Unified Function to execute the complete What-If simulation pipeline:

      Stage 1: Generate daily trips & hourly gravity OD demand matrix
      Stage 2: Route OD trips over drivable OSM road network via Dijkstra AON
      Stage 3B: Predict baseline background traffic via XGBoost & aggregate scenario traffic
      Stage 4: Evaluate V/C ratios, LOS grades, deterioration, bottlenecks & overall impact level

    Parameters:
      dev_input: Proposed real-estate development specifications (type, zone_id, properties)
      hour: Target simulation hour (0 to 23)
      gamma: Gravity model distance friction coefficient
      graph: Pre-built NetworkX OSM road graph (optional for performance)
      zone_resolver: Pre-built ZoneNodeResolver instance (optional for performance)
      roads_gdf: GeoDataFrame of road segments (optional)
      xgb_model: Loaded XGBoost pipeline model (optional)
      config_path: Custom path to impact thresholds JSON configuration (optional)

    Returns:
      WhatIfSimulationResult containing complete artifacts from Stage 1 through Stage 4.
    """
    # -------------------------------------------------------------------------
    # Stage 1: Trip Generation & OD Demand Matrix
    # -------------------------------------------------------------------------
    od_demand = calculate_development_od(
        dev_input,
        hour=hour,
        gamma=gamma,
    )


    # -------------------------------------------------------------------------
    # Stage 2: Traffic Assignment Engine (Dijkstra Shortest-Path AON)
    # -------------------------------------------------------------------------
    assignment_result = assign_traffic_aon(
        od_input=od_demand,
        graph=graph,
        zone_resolver=zone_resolver,
    )

    # -------------------------------------------------------------------------
    # Stage 3B: Baseline XGBoost Prediction + Scenario Traffic Aggregation
    # -------------------------------------------------------------------------
    scenario_result = aggregate_scenario_traffic(
        od_demand=od_demand,
        assignment_result=assignment_result,
        roads_gdf=roads_gdf,
        xgb_model=xgb_model,
        hour=hour,
    )

    # -------------------------------------------------------------------------
    # Stage 4: Traffic Impact & Level-of-Service (LOS) Assessment
    # -------------------------------------------------------------------------
    impact_result = assess_traffic_impact(
        scenario_result=scenario_result,
        config_path=config_path,
    )

    # -------------------------------------------------------------------------
    # Return Unified What-If Result
    # -------------------------------------------------------------------------
    dev_dict = {
        "development_type": dev_input.development_type,
        "zone_id": dev_input.zone_id,
        "properties": dev_input.properties,
    }

    return WhatIfSimulationResult(
        development_input=dev_dict,
        hour=hour,
        stage1_od_demand=od_demand,
        stage2_assignment=assignment_result,
        stage3_scenario_traffic=scenario_result,
        stage4_impact_assessment=impact_result,
    )
