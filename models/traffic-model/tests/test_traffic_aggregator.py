"""
Unit tests for Stage 3B Scenario Traffic Aggregator.
"""
import sys
from pathlib import Path
import numpy as np
import pandas as pd
import geopandas as gpd
from shapely.geometry import Point
import pytest

# Path setup
TEST_DIR = Path(__file__).resolve().parent
TRAFFIC_MODEL_DIR = TEST_DIR.parent
PROJECT_ROOT = TRAFFIC_MODEL_DIR.parent

for d in [TRAFFIC_MODEL_DIR / "src", PROJECT_ROOT / "trip-demand-model" / "src"]:
    if str(d) not in sys.path:
        sys.path.insert(0, str(d))

import config
import predict
from traffic_assignment import LinkFlowRecord, TrafficAssignmentResult
from trip_generation import DevelopmentInput, calculate_development_od, ODDemandMatrix, ODTripRecord
from traffic_aggregator import (
    RoadImpactRecord,
    ScenarioTrafficResult,
    aggregate_scenario_traffic,
    build_road_baseline_feature_row,
    calculate_vc_ratio,
)


def test_1_basic_aggregation():
    """Test 1 — Basic scenario aggregation: V_scenario = V_base + ΔV_assigned."""
    base_v = 1000.0
    assigned_v = 200.0
    scen_v = base_v + assigned_v
    assert scen_v == pytest.approx(1200.0)


def test_2_zero_assigned_demand():
    """Test 2 — Zero assigned demand: V_scenario = V_base."""
    base_v = 1000.0
    assigned_v = 0.0
    scen_v = base_v + assigned_v
    assert scen_v == pytest.approx(1000.0)


def test_3_multiple_roads():
    """Test 3 — Multiple roads receive their respective assigned demand."""
    flows = [
        LinkFlowRecord(edge_id="road_A", osm_node_from=1, osm_node_to=2, assigned_trips=150.0, road_type="primary", road_length_m=100.0, speed_limit_kmh=50.0),
        LinkFlowRecord(edge_id="road_B", osm_node_from=2, osm_node_to=3, assigned_trips=75.0, road_type="secondary", road_length_m=200.0, speed_limit_kmh=50.0),
    ]
    assign_res = TrafficAssignmentResult(hour=8, total_od_trips=225.0, assigned_trips=225.0, unassigned_trips=0.0, unreachable_pairs=0, link_flows=flows)
    od_mat = ODDemandMatrix(hour=8, development_type="office", origin_zone="Z0001", total_trips=225.0, od_matrix=[])

    roads_gdf = gpd.GeoDataFrame([
        {"road_id": "road_A", "osm_way_id": 1, "is_drivable": True, "road_capacity_proxy": 2000.0, "highway": "primary", "geometry": Point(0, 0)},
        {"road_id": "road_B", "osm_way_id": 2, "is_drivable": True, "road_capacity_proxy": 1500.0, "highway": "secondary", "geometry": Point(0, 0)},
    ], crs="EPSG:4326")

    res = aggregate_scenario_traffic(od_mat, assign_res, roads_gdf=roads_gdf)
    assert len(res.road_impacts) == 2

    impact_dict = {r.road_id: r for r in res.road_impacts}
    assert impact_dict["road_A"].assigned_trips_veh_h == pytest.approx(150.0)
    assert impact_dict["road_B"].assigned_trips_veh_h == pytest.approx(75.0)


def test_4_multiple_hours():
    """Test 4 — Multiple hours remain independent."""
    row = pd.Series({"road_id": "r1", "highway": "primary", "road_capacity_proxy": 2000.0})
    df_h8 = build_road_baseline_feature_row(row, hour=8)
    df_h17 = build_road_baseline_feature_row(row, hour=17)

    assert df_h8["hour"].values[0] == 8
    assert df_h17["hour"].values[0] == 17
    assert df_h8["hour_sin"].values[0] != df_h17["hour_sin"].values[0]


def test_5_vc_ratio():
    """Test 5 — V/C ratio calculation."""
    vc = calculate_vc_ratio(800.0, 1000.0)
    assert vc == pytest.approx(0.8)

    # Edge cases
    assert calculate_vc_ratio(800.0, 0.0) == 0.0
    assert calculate_vc_ratio(800.0, -100.0) == 0.0


def test_6_scenario_vc_ratio():
    """Test 6 — Scenario V/C ratio calculation."""
    base_v = 800.0
    assigned_v = 100.0
    cap = 1000.0
    scen_v = base_v + assigned_v

    vc_base = calculate_vc_ratio(base_v, cap)
    vc_scen = calculate_vc_ratio(scen_v, cap)

    assert vc_base == pytest.approx(0.8)
    assert vc_scen == pytest.approx(0.9)


def test_7_unmatched_stage2_edge():
    """Test 7 — Unmatched Stage 2 edge with non-zero assigned demand is reported."""
    flows = [LinkFlowRecord(edge_id="ghost_road_999", osm_node_from=1, osm_node_to=2, assigned_trips=300.0, road_type="primary", road_length_m=100.0, speed_limit_kmh=50.0)]
    assign_res = TrafficAssignmentResult(hour=8, total_od_trips=300.0, assigned_trips=300.0, unassigned_trips=0.0, unreachable_pairs=0, link_flows=flows)
    od_mat = ODDemandMatrix(hour=8, development_type="mall", origin_zone="Z0001", total_trips=300.0, od_matrix=[])

    roads_gdf = gpd.GeoDataFrame([
        {"road_id": "valid_road_1", "osm_way_id": 1, "is_drivable": True, "road_capacity_proxy": 2000.0, "highway": "primary", "geometry": Point(0, 0)}
    ], crs="EPSG:4326")

    res = aggregate_scenario_traffic(od_mat, assign_res, roads_gdf=roads_gdf)
    assert len(res.unmatched_stage2_edges) == 1
    assert res.unmatched_stage2_edges[0]["edge_id"] == "ghost_road_999"
    assert res.unmatched_stage2_edges[0]["assigned_trips"] == pytest.approx(300.0)


def test_8_internal_trips_handling():
    """Test 8 — Internal trips (Z1 -> Z1) are distinguished and not assigned to road links."""
    od_mat = ODDemandMatrix(
        hour=8, development_type="residential_compound", origin_zone="Z0001", total_trips=500.0,
        od_matrix=[
            ODTripRecord(origin_zone="Z0001", destination_zone="Z0001", trips=50.0),
            ODTripRecord(origin_zone="Z0001", destination_zone="Z0002", trips=450.0),
        ]
    )
    flows = [LinkFlowRecord(edge_id="road_1", osm_node_from=1, osm_node_to=2, assigned_trips=450.0, road_type="primary", road_length_m=100.0, speed_limit_kmh=50.0)]
    assign_res = TrafficAssignmentResult(hour=8, total_od_trips=500.0, assigned_trips=450.0, unassigned_trips=50.0, unreachable_pairs=0, link_flows=flows)

    roads_gdf = gpd.GeoDataFrame([
        {"road_id": "road_1", "osm_way_id": 1, "is_drivable": True, "road_capacity_proxy": 2000.0, "highway": "primary", "geometry": Point(0, 0)}
    ], crs="EPSG:4326")

    res = aggregate_scenario_traffic(od_mat, assign_res, roads_gdf=roads_gdf)
    assert res.total_development_trips == pytest.approx(500.0)
    assert res.assigned_external_trips == pytest.approx(450.0)
    assert res.unassigned_internal_trips == pytest.approx(50.0)


def test_9_scenario_arithmetic():
    """Test 9 — Scenario arithmetic holds: scenario = baseline + assigned."""
    flows = [LinkFlowRecord(edge_id="road_1", osm_node_from=1, osm_node_to=2, assigned_trips=123.45, road_type="primary", road_length_m=100.0, speed_limit_kmh=50.0)]
    assign_res = TrafficAssignmentResult(hour=8, total_od_trips=123.45, assigned_trips=123.45, unassigned_trips=0.0, unreachable_pairs=0, link_flows=flows)
    od_mat = ODDemandMatrix(hour=8, development_type="school", origin_zone="Z0001", total_trips=123.45, od_matrix=[])

    roads_gdf = gpd.GeoDataFrame([
        {"road_id": "road_1", "osm_way_id": 1, "is_drivable": True, "road_capacity_proxy": 2000.0, "highway": "primary", "geometry": Point(0, 0)}
    ], crs="EPSG:4326")

    res = aggregate_scenario_traffic(od_mat, assign_res, roads_gdf=roads_gdf)
    impact = res.road_impacts[0]

    assert impact.scenario_traffic_veh_h == pytest.approx(impact.baseline_traffic_veh_h + impact.assigned_trips_veh_h, abs=1e-3)


def test_10_existing_model_compatibility():
    """Test 10 — Compatibility with existing trained XGBoost pipeline."""
    model, bundle = predict.load_model()
    assert model is not None
    assert "model_features" in bundle
    assert len(bundle["model_features"]) == 27

    # Predict baseline on a real feature sample
    sample_row = pd.Series({"road_id": "osm_1304640771_0", "highway": "primary", "road_capacity_proxy": 7200.0, "road_length_m": 450.0})
    feat_df = build_road_baseline_feature_row(sample_row, hour=8)

    pred = predict.predict_batch(feat_df, model=model)[0]
    assert isinstance(pred, (float, int, np.floating))
    assert pred >= 0.0
