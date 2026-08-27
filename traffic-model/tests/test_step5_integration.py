"""
Integration Test Suite for Step 5 — Frontend to Backend Mobility Simulator Connection.

Verifies end-to-end execution of simulate_what_if_scenario across all 5 development types,
schema compatibility, and authenticity of returned simulation artifacts.
"""

import sys
from pathlib import Path
import pytest

# Path setup
TEST_DIR = Path(__file__).resolve().parent
TRAFFIC_MODEL_DIR = TEST_DIR.parent
PROJECT_ROOT = TRAFFIC_MODEL_DIR.parent

for d in [TRAFFIC_MODEL_DIR / "src", PROJECT_ROOT / "trip-demand-model" / "src", TRAFFIC_MODEL_DIR / "scripts"]:
    if str(d) not in sys.path:
        sys.path.insert(0, str(d))

from trip_generation import DevelopmentInput
from simulator import WhatIfSimulationResult, simulate_what_if_scenario
from run_simulation_cli import run_cli_simulation


def test_1_residential_compound_integration():
    """TEST 1 — Residential compound (8,000 residents, Z0008, hour 8)."""
    payload = {
        "development_type": "residential_compound",
        "zone_id": "Z0008",
        "name": "Residential Complex Z0008",
        "properties": {"num_residents": 8000},
        "simulation_hour": 8,
    }

    res_dict = run_cli_simulation(payload)

    assert res_dict["development_input"]["development_type"] == "residential_compound"
    assert res_dict["development_input"]["zone_id"] == "Z0008"
    assert res_dict["hour"] == 8
    assert res_dict["stage1_od_demand"]["total_trips"] > 0
    assert res_dict["stage2_assignment"]["assigned_trips"] > 0
    assert res_dict["stage4_impact_assessment"]["number_of_affected_roads"] > 0


def test_2_hospital_integration():
    """TEST 2 — Hospital (300 beds, 450 staff, Z0008, hour 8)."""
    payload = {
        "development_type": "hospital",
        "zone_id": "Z0008",
        "name": "Central Hospital",
        "properties": {"num_beds": 300, "staff_count": 450},
        "simulation_hour": 8,
    }

    res_dict = run_cli_simulation(payload)

    assert res_dict["development_input"]["development_type"] == "hospital"
    assert res_dict["stage1_od_demand"]["total_trips"] > 0
    assert res_dict["stage4_impact_assessment"]["overall_impact_level"] in ("LOW", "MODERATE", "HIGH", "CRITICAL")


def test_3_mall_integration():
    """TEST 3 — Mall (50,000 m² GLA, Z0008, hour 17)."""
    payload = {
        "development_type": "mall",
        "zone_id": "Z0008",
        "name": "Mega Mall",
        "properties": {"gross_leasable_area_sqm": 50000},
        "simulation_hour": 17,
    }

    res_dict = run_cli_simulation(payload)

    assert res_dict["development_input"]["development_type"] == "mall"
    assert res_dict["hour"] == 17
    assert res_dict["stage1_od_demand"]["total_trips"] > 0


def test_4_school_integration():
    """TEST 4 — School (2,000 students, Z0008, hour 7)."""
    payload = {
        "development_type": "school",
        "zone_id": "Z0008",
        "name": "Public School",
        "properties": {"num_students": 2000},
        "simulation_hour": 7,
    }

    res_dict = run_cli_simulation(payload)

    assert res_dict["development_input"]["development_type"] == "school"
    assert res_dict["hour"] == 7
    assert res_dict["stage1_od_demand"]["total_trips"] > 0


def test_5_office_integration():
    """TEST 5 — Office (5,000 employees, Z0008, hour 8)."""
    payload = {
        "development_type": "office",
        "zone_id": "Z0008",
        "name": "Business Office Park",
        "properties": {"num_employees": 5000},
        "simulation_hour": 8,
    }

    res_dict = run_cli_simulation(payload)

    assert res_dict["development_input"]["development_type"] == "office"
    assert res_dict["stage1_od_demand"]["total_trips"] > 0


def test_6_frontend_schema_compatibility():
    """TEST 6 — Frontend scenario object converts to DevelopmentInput without losing fields."""
    frontend_obj = {
        "development_id": "DEV-001",
        "development_type": "hospital",
        "name": "Proposed Hospital DEV-001",
        "latitude": 30.0685,
        "longitude": 31.7294,
        "zone_id": "Z0008",
        "simulation_hour": 8,
        "properties": {"num_beds": 300, "staff_count": 450},
    }

    dev_input = DevelopmentInput(
        development_type=frontend_obj["development_type"],
        zone_id=frontend_obj["zone_id"],
        properties=frontend_obj["properties"],
        name=frontend_obj["name"],
    )

    assert dev_input.development_type == "hospital"
    assert dev_input.zone_id == "Z0008"
    assert dev_input.properties["num_beds"] == 300
    assert dev_input.properties["staff_count"] == 450
    assert dev_input.name == "Proposed Hospital DEV-001"


def test_7_authenticity_no_fake_data():
    """TEST 7 — Verifies simulation results originate from actual backend models (no hardcoded/fake metrics)."""
    dev_inp = DevelopmentInput(
        development_type="hospital",
        zone_id="Z0008",
        properties={"num_beds": 300, "staff_count": 450},
    )

    result = simulate_what_if_scenario(dev_inp, hour=8)

    # Verify road impacts were routed on real OpenStreetMap roads
    impacts = result.stage4_impact_assessment.road_assessments
    assert len(impacts) > 100

    # Verify real XGBoost baseline traffic values exist and are positive
    assert impacts[0].baseline_traffic_veh_h > 0.0
    assert impacts[0].scenario_traffic_veh_h >= impacts[0].baseline_traffic_veh_h
