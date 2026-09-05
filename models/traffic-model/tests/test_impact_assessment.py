"""
Unit tests for Stage 4 Traffic Impact & Level-of-Service Assessment.
"""
import sys
from pathlib import Path
import pytest
import math

# Path setup
TEST_DIR = Path(__file__).resolve().parent
TRAFFIC_MODEL_DIR = TEST_DIR.parent
PROJECT_ROOT = TRAFFIC_MODEL_DIR.parent

for d in [TRAFFIC_MODEL_DIR / "src", PROJECT_ROOT / "trip-demand-model" / "src"]:
    if str(d) not in sys.path:
        sys.path.insert(0, str(d))

import config
from traffic_aggregator import RoadImpactRecord, ScenarioTrafficResult, calculate_vc_ratio
from impact_assessment import (
    ImpactAssessmentResult,
    RoadImpactAssessment,
    assess_traffic_impact,
    calculate_los_change,
    classify_impact_severity,
    classify_los,
    compute_bottleneck_score,
)


def test_1_vc_calculation():
    """Test 1 — Basic V/C calculation."""
    vc = calculate_vc_ratio(500.0, 1000.0)
    assert vc == pytest.approx(0.5)


def test_2_scenario_vc():
    """Test 2 — Scenario V/C calculation."""
    base_v = 800.0
    assigned_v = 150.0
    cap = 1000.0
    scen_v = base_v + assigned_v

    vc_base = calculate_vc_ratio(base_v, cap)
    vc_scen = calculate_vc_ratio(scen_v, cap)

    assert scen_v == pytest.approx(950.0)
    assert vc_base == pytest.approx(0.80)
    assert vc_scen == pytest.approx(0.95)


def test_3_los_thresholds():
    """Test 3 — Level of Service (LOS A–F) boundary classification."""
    test_cases = [
        (0.59, "A"),
        (0.60, "B"),
        (0.69, "B"),
        (0.70, "C"),
        (0.79, "C"),
        (0.80, "D"),
        (0.89, "D"),
        (0.90, "E"),
        (0.99, "E"),
        (1.00, "F"),
        (1.25, "F"),
    ]
    for vc, expected_los in test_cases:
        assert classify_los(vc) == expected_los, f"Failed for V/C={vc}: expected {expected_los}, got {classify_los(vc)}"


def test_4_los_deterioration():
    """Test 4 — LOS deterioration detection (C -> D, worsened = True)."""
    base_vc = 0.75  # LOS C
    scen_vc = 0.85  # LOS D

    base_los = classify_los(base_vc)
    scen_los = classify_los(scen_vc)
    assert base_los == "C"
    assert scen_los == "D"

    drop_levels, worsened = calculate_los_change(base_los, scen_los)
    assert drop_levels == 1
    assert worsened is True


def test_5_no_deterioration():
    """Test 5 — No deterioration (A -> A, worsened = False)."""
    base_vc = 0.50  # LOS A
    scen_vc = 0.55  # LOS A

    base_los = classify_los(base_vc)
    scen_los = classify_los(scen_vc)
    assert base_los == "A"
    assert scen_los == "A"

    drop_levels, worsened = calculate_los_change(base_los, scen_los)
    assert drop_levels == 0
    assert worsened is False


def test_6_impact_severity():
    """Test 6 — Impact severity classification."""
    assert classify_impact_severity(1.05, 1, "F") == "CRITICAL"
    assert classify_impact_severity(0.95, 0, "E") == "HIGH"
    assert classify_impact_severity(0.75, 2, "D") == "HIGH"
    assert classify_impact_severity(0.85, 0, "D") == "MODERATE"
    assert classify_impact_severity(0.50, 0, "A") == "LOW"


def test_7_zero_baseline_traffic():
    """Test 7 — Zero baseline traffic does not produce NaN or infinity."""
    rec = RoadImpactRecord(
        road_id="r_zero", hour=8, baseline_traffic_veh_h=0.0, assigned_trips_veh_h=100.0,
        scenario_traffic_veh_h=100.0, road_capacity_proxy=1000.0, vc_ratio_baseline=0.0,
        vc_ratio_scenario=0.10, delta_traffic_veh_h=100.0, delta_percentage=0.0
    )
    scen_res = ScenarioTrafficResult(
        hour=8, development_type="office", origin_zone="Z1", total_development_trips=100.0,
        assigned_external_trips=100.0, unassigned_internal_trips=0.0, road_impacts=[rec]
    )
    result = assess_traffic_impact(scen_res)
    assert len(result.road_assessments) == 1
    assessment = result.road_assessments[0]

    assert not math.isnan(assessment.delta_percentage)
    assert not math.isinf(assessment.delta_percentage)


def test_8_zero_capacity_handling():
    """Test 8 — Zero/missing capacity is handled safely and explicitly."""
    assert calculate_vc_ratio(500.0, 0.0) == 0.0
    assert calculate_vc_ratio(500.0, -50.0) == 0.0
    assert classify_los(calculate_vc_ratio(500.0, 0.0)) == "A"


def test_9_multiple_roads_assessment():
    """Test 9 — Multiple roads receive independent assessments."""
    rec1 = RoadImpactRecord("r1", 8, 1000.0, 300.0, 1300.0, 1200.0, 0.8333, 1.0833, 300.0, 30.0)
    rec2 = RoadImpactRecord("r2", 8, 500.0, 50.0, 550.0, 2000.0, 0.2500, 0.2750, 50.0, 10.0)
    scen_res = ScenarioTrafficResult(
        hour=8, development_type="hospital", origin_zone="Z1", total_development_trips=350.0,
        assigned_external_trips=350.0, unassigned_internal_trips=0.0, road_impacts=[rec1, rec2]
    )
    result = assess_traffic_impact(scen_res)
    assert result.number_of_affected_roads == 2

    r_dict = {a.road_id: a for a in result.road_assessments}
    assert r_dict["r1"].impact_severity == "CRITICAL"  # V/C > 1.0
    assert r_dict["r2"].impact_severity == "LOW"       # V/C < 0.80


def test_10_multiple_hours():
    """Test 10 — Hour 8 and Hour 17 remain independent."""
    rec_h8 = RoadImpactRecord("r1", 8, 1000.0, 100.0, 1100.0, 2000.0, 0.50, 0.55, 100.0, 10.0)
    rec_h17 = RoadImpactRecord("r1", 17, 1500.0, 200.0, 1700.0, 2000.0, 0.75, 0.85, 200.0, 13.33)

    scen_res_h8 = ScenarioTrafficResult(8, "office", "Z1", 100.0, 100.0, 0.0, [rec_h8])
    scen_res_h17 = ScenarioTrafficResult(17, "office", "Z1", 200.0, 200.0, 0.0, [rec_h17])

    res_h8 = assess_traffic_impact(scen_res_h8)
    res_h17 = assess_traffic_impact(scen_res_h17)

    assert res_h8.hour == 8
    assert res_h17.hour == 17
    assert res_h8.road_assessments[0].baseline_los == "A"
    assert res_h17.road_assessments[0].baseline_los == "C"


def test_11_bottleneck_ranking():
    """Test 11 — Bottleneck scoring produces deterministic ranking."""
    rec_minor = RoadImpactRecord("r_minor", 8, 500.0, 10.0, 510.0, 2000.0, 0.25, 0.255, 10.0, 2.0)
    rec_severe = RoadImpactRecord("r_severe", 8, 1200.0, 400.0, 1600.0, 1500.0, 0.80, 1.0667, 400.0, 33.33)

    scen_res = ScenarioTrafficResult(8, "mall", "Z1", 410.0, 410.0, 0.0, [rec_minor, rec_severe])
    result = assess_traffic_impact(scen_res)

    assert len(result.top_bottlenecks) == 2
    assert result.top_bottlenecks[0].road_id == "r_severe"
    assert result.top_bottlenecks[0].bottleneck_score > result.top_bottlenecks[1].bottleneck_score


def test_12_internal_trips_handling():
    """Test 12 — Internal trips are not counted as road-assigned demand."""
    scen_res = ScenarioTrafficResult(
        hour=8, development_type="residential_compound", origin_zone="Z1",
        total_development_trips=500.0, assigned_external_trips=400.0, unassigned_internal_trips=100.0,
        road_impacts=[RoadImpactRecord("r1", 8, 1000.0, 400.0, 1400.0, 2000.0, 0.50, 0.70, 400.0, 40.0)]
    )
    result = assess_traffic_impact(scen_res)

    assert result.total_development_trips == pytest.approx(500.0)
    assert result.assigned_external_trips == pytest.approx(400.0)
    assert result.unassigned_internal_trips == pytest.approx(100.0)


def test_13_scenario_level_summary():
    """Test 13 — Scenario-level summary metrics are computed correctly."""
    rec1 = RoadImpactRecord("r1", 8, 1000.0, 300.0, 1300.0, 1200.0, 0.8333, 1.0833, 300.0, 30.0) # V/C > 1.0, delta 0.25
    rec2 = RoadImpactRecord("r2", 8, 500.0, 50.0, 550.0, 1000.0, 0.50, 0.55, 50.0, 10.0) # LOW

    scen_res = ScenarioTrafficResult(8, "residential_compound", "Z8", 350.0, 350.0, 0.0, [rec1, rec2])
    result = assess_traffic_impact(scen_res)

    assert result.number_of_affected_roads == 2
    assert result.roads_reaching_vc_1_or_more_count == 1
    assert result.network_condition == "CRITICAL"
    assert result.development_impact == "CRITICAL"  # max_vc_change >= 0.25
    assert result.overall_impact_level == "CRITICAL"
    assert result.max_delta_traffic_veh_h == pytest.approx(300.0)
    assert result.avg_vc_change == pytest.approx(0.15, abs=1e-2)
    assert result.max_vc_change == pytest.approx(0.25, abs=1e-2)
    assert result.prototype_disclaimer != ""


def test_14_case1_no_worsening_with_critical_bottleneck():
    """Test 14 (Case 1) — Network contains V/C 1.17 bottleneck, but development adds 0 delta to it."""
    rec1 = RoadImpactRecord("r_bottleneck", 8, 1170.0, 0.0, 1170.0, 1000.0, 1.17, 1.17, 0.0, 0.0)
    rec2 = RoadImpactRecord("r_normal", 8, 450.0, 0.0, 450.0, 1000.0, 0.45, 0.45, 0.0, 0.0)

    scen_res = ScenarioTrafficResult(8, "residential_compound", "Z1", 26.2, 26.2, 0.0, [rec1, rec2])
    result = assess_traffic_impact(scen_res)

    assert result.roads_worsened_count == 0
    assert result.avg_vc_change == pytest.approx(0.0)
    assert result.max_vc_change == pytest.approx(0.0)
    assert result.network_condition == "CRITICAL"  # Because scenario has V/C >= 1.00
    assert result.development_impact == "LOW"      # Because delta = 0 and 0 worsened roads
    assert result.overall_impact_level == "LOW"


def test_15_case2_small_worsening():
    """Test 15 (Case 2) — Small worsening below thresholds remains LOW."""
    rec = RoadImpactRecord("r1", 8, 450.0, 10.0, 460.0, 1000.0, 0.45, 0.46, 10.0, 2.22)
    scen_res = ScenarioTrafficResult(8, "office", "Z1", 10.0, 10.0, 0.0, [rec])
    result = assess_traffic_impact(scen_res)

    assert result.roads_worsened_count == 0
    assert result.avg_vc_change == pytest.approx(0.01)
    assert result.development_impact == "LOW"
    assert result.network_condition == "GOOD"


def test_16_case3_significant_worsening():
    """Test 16 (Case 3) — Multiple worsened roads trigger HIGH development impact."""
    # 6 roads worsening from LOS A (0.50) to LOS B (0.60)
    recs = [
        RoadImpactRecord(f"r_{i}", 8, 500.0, 100.0, 600.0, 1000.0, 0.50, 0.60, 100.0, 20.0)
        for i in range(6)
    ]
    scen_res = ScenarioTrafficResult(8, "mall", "Z1", 600.0, 600.0, 0.0, recs)
    result = assess_traffic_impact(scen_res)

    assert result.roads_worsened_count == 6
    assert result.development_impact == "HIGH"  # >= 5 worsened roads
    assert result.overall_impact_level == "HIGH"


def test_17_case4_preexisting_critical_bottleneck_zero_delta():
    """Test 17 (Case 4) — Existing bottleneck V/C 1.17 unchanged -> Network CRITICAL, Impact LOW."""
    rec = RoadImpactRecord("r_critical", 8, 1170.0, 0.0, 1170.0, 1000.0, 1.17, 1.17, 0.0, 0.0)
    scen_res = ScenarioTrafficResult(8, "school", "Z1", 50.0, 50.0, 0.0, [rec])
    result = assess_traffic_impact(scen_res)

    assert result.network_condition == "CRITICAL"
    assert result.development_impact == "LOW"
    assert result.overall_impact_level == "LOW"


def test_18_case5_development_worsens_already_critical_road():
    """Test 18 (Case 5) — Development worsens an already critical road (1.05 -> 1.15)."""
    rec = RoadImpactRecord("r_crit_worse", 8, 1050.0, 100.0, 1150.0, 1000.0, 1.05, 1.15, 100.0, 9.52)
    scen_res = ScenarioTrafficResult(8, "residential_compound", "Z1", 100.0, 100.0, 0.0, [rec])
    result = assess_traffic_impact(scen_res)

    assert result.network_condition == "CRITICAL"
    assert result.development_impact == "HIGH"  # 1 congested road worsened by >= 0.05
    assert result.overall_impact_level == "HIGH"


def test_19_empty_road_set():
    """Test 19 — Edge case: Empty road set handled safely."""
    scen_res = ScenarioTrafficResult(8, "office", "Z1", 0.0, 0.0, 0.0, [])
    result = assess_traffic_impact(scen_res)

    assert result.number_of_affected_roads == 0
    assert result.network_condition == "GOOD"
    assert result.development_impact == "LOW"
    assert result.overall_impact_level == "LOW"
    assert result.avg_vc_change == 0.0
    assert result.max_vc_change == 0.0


def test_20_newly_congested_road():
    """Test 20 — Road transitions from LOS D (0.85) to LOS F (1.05) in a 5-road network."""
    rec_crit = RoadImpactRecord("r_new_crit", 8, 850.0, 200.0, 1050.0, 1000.0, 0.85, 1.05, 200.0, 23.53)
    rec_other = [
        RoadImpactRecord(f"r_bg_{i}", 8, 400.0, 10.0, 410.0, 1000.0, 0.40, 0.41, 10.0, 2.5)
        for i in range(4)
    ]
    scen_res = ScenarioTrafficResult(8, "mall", "Z1", 240.0, 240.0, 0.0, [rec_crit] + rec_other)
    result = assess_traffic_impact(scen_res)

    assert result.network_condition == "CRITICAL"
    assert result.roads_worsened_count == 1
    assert result.development_impact == "HIGH"  # Max delta 0.20, 1 congested road worsened, avg delta < 0.15

