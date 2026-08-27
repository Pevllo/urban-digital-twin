"""
Unit tests for the Unified What-If Simulator Pipeline.
"""
import sys
from pathlib import Path
import pytest

# Path setup
TEST_DIR = Path(__file__).resolve().parent
TRAFFIC_MODEL_DIR = TEST_DIR.parent
PROJECT_ROOT = TRAFFIC_MODEL_DIR.parent

for d in [TRAFFIC_MODEL_DIR / "src", PROJECT_ROOT / "trip-demand-model" / "src"]:
    if str(d) not in sys.path:
        sys.path.insert(0, str(d))

from trip_generation import DevelopmentInput
from simulator import WhatIfSimulationResult, simulate_what_if_scenario


def test_unified_simulator_residential_compound():
    """Tests full unified pipeline execution for a residential compound."""
    dev_inp = DevelopmentInput(
        development_type="residential_compound",
        zone_id="Z0008",
        properties={"num_residents": 8000},
    )

    res = simulate_what_if_scenario(dev_inp, hour=8)

    assert isinstance(res, WhatIfSimulationResult)
    assert res.hour == 8
    assert res.development_input["development_type"] == "residential_compound"
    assert res.development_input["zone_id"] == "Z0008"

    # Stage 1 assertions
    assert res.stage1_od_demand.total_trips > 0
    assert len(res.stage1_od_demand.od_matrix) > 0

    # Stage 2 assertions
    assert res.stage2_assignment.assigned_trips > 0
    assert res.stage2_assignment.assigned_trips + res.stage2_assignment.unassigned_trips == pytest.approx(res.stage1_od_demand.total_trips, abs=1e-1)

    # Stage 3B assertions
    assert len(res.stage3_scenario_traffic.road_impacts) > 0
    top_road = res.stage3_scenario_traffic.road_impacts[0]
    assert top_road.scenario_traffic_veh_h == pytest.approx(top_road.baseline_traffic_veh_h + top_road.assigned_trips_veh_h, abs=1e-1)

    # Stage 4 assertions
    assert res.stage4_impact_assessment.number_of_affected_roads > 0
    assert res.stage4_impact_assessment.overall_impact_level in ("LOW", "MODERATE", "HIGH", "CRITICAL")
    assert len(res.stage4_impact_assessment.top_bottlenecks) <= 10


def test_unified_simulator_hospital():
    """Tests full unified pipeline execution for a hospital development."""
    dev_inp = DevelopmentInput(
        development_type="hospital",
        zone_id="Z0002",
        properties={"num_beds": 300},
    )

    res = simulate_what_if_scenario(dev_inp, hour=17)

    assert res.hour == 17
    assert res.stage1_od_demand.total_trips > 0
    assert res.stage4_impact_assessment.number_of_affected_roads > 0
    assert res.stage4_impact_assessment.overall_impact_level in ("LOW", "MODERATE", "HIGH", "CRITICAL")


def test_unified_simulator_to_dict():
    """Tests JSON serialisability of the unified result dictionary."""
    dev_inp = DevelopmentInput(
        development_type="office",
        zone_id="Z0003",
        properties={"num_employees": 2000},
    )

    res = simulate_what_if_scenario(dev_inp, hour=9)
    res_dict = res.to_dict()

    assert isinstance(res_dict, dict)
    assert "development_input" in res_dict
    assert "stage1_od_demand" in res_dict
    assert "stage2_assignment" in res_dict
    assert "stage3_scenario_traffic" in res_dict
    assert "stage4_impact_assessment" in res_dict
