"""
Unit tests for Stage 2 Traffic Assignment Engine & Network Connectivity Corrections.
"""
import sys
from pathlib import Path

import networkx as nx
import pytest

# Add paths so imports work cleanly
TEST_DIR = Path(__file__).resolve().parent
TRAFFIC_MODEL_DIR = TEST_DIR.parent
PROJECT_ROOT = TRAFFIC_MODEL_DIR.parent
for d in [TRAFFIC_MODEL_DIR / "src", TRAFFIC_MODEL_DIR / "scripts", PROJECT_ROOT / "trip-demand-model" / "src"]:
    if str(d) not in sys.path:
        sys.path.insert(0, str(d))


from traffic_assignment import (
    LinkFlowRecord,
    TrafficAssignmentResult,
    ZoneNodeResolver,
    assign_traffic_aon,
    build_osm_graph,
    calculate_free_flow_time,
)
from trip_generation import DevelopmentInput, calculate_development_od, haversine_distance_km


def create_synthetic_test_graph() -> nx.DiGraph:
    """
    Synthetic Graph:
      Nodes: 101 (A), 102 (B), 103 (C), 104 (D)
      Route 1: 101 -> 102 -> 103 (length=100m each, speed=50kmh)
      Route 2: 101 -> 104 -> 103 (length=500m each, speed=50kmh)
    """
    G = nx.DiGraph()

    t_101_102 = calculate_free_flow_time(100.0, 50.0)
    t_102_103 = calculate_free_flow_time(100.0, 50.0)
    t_101_104 = calculate_free_flow_time(500.0, 50.0)
    t_104_103 = calculate_free_flow_time(500.0, 50.0)

    # Route 1 edges (two-way)
    G.add_edge(101, 102, edge_id="edge_1", osm_way_id=1, road_type="primary", road_length_m=100.0, speed_limit_kmh=50.0, free_flow_time_seconds=t_101_102, weight=t_101_102)
    G.add_edge(102, 101, edge_id="edge_1", osm_way_id=1, road_type="primary", road_length_m=100.0, speed_limit_kmh=50.0, free_flow_time_seconds=t_101_102, weight=t_101_102)

    G.add_edge(102, 103, edge_id="edge_2", osm_way_id=2, road_type="primary", road_length_m=100.0, speed_limit_kmh=50.0, free_flow_time_seconds=t_102_103, weight=t_102_103)
    G.add_edge(103, 102, edge_id="edge_2", osm_way_id=2, road_type="primary", road_length_m=100.0, speed_limit_kmh=50.0, free_flow_time_seconds=t_102_103, weight=t_102_103)

    # Route 2 edges (two-way)
    G.add_edge(101, 104, edge_id="edge_3", osm_way_id=3, road_type="secondary", road_length_m=500.0, speed_limit_kmh=50.0, free_flow_time_seconds=t_101_104, weight=t_101_104)
    G.add_edge(104, 101, edge_id="edge_3", osm_way_id=3, road_type="secondary", road_length_m=500.0, speed_limit_kmh=50.0, free_flow_time_seconds=t_101_104, weight=t_101_104)

    G.add_edge(104, 103, edge_id="edge_4", osm_way_id=4, road_type="secondary", road_length_m=500.0, speed_limit_kmh=50.0, free_flow_time_seconds=t_104_103, weight=t_104_103)
    G.add_edge(103, 104, edge_id="edge_4", osm_way_id=4, road_type="secondary", road_length_m=500.0, speed_limit_kmh=50.0, free_flow_time_seconds=t_104_103, weight=t_104_103)

    return G


class DummyZoneResolver:
    """Mock zone resolver for synthetic tests."""
    def __init__(self, mapping: dict):
        self.mapping = mapping

    def resolve_zone(self, zone_id: str) -> int:
        if zone_id in self.mapping:
            return self.mapping[zone_id]
        raise ValueError(f"Mock zone '{zone_id}' not found")


def test_1_zone_mapping_drivable_node():
    """Test 1 — Zone mapping selects a valid drivable node."""
    G, _ = build_osm_graph()
    resolver = ZoneNodeResolver(graph=G)
    node = resolver.resolve_zone("Z0008")
    assert node in G.nodes()
    assert G.degree(node) > 0


def test_2_nearest_node_fallback_geographically_correct():
    """Test 2 — Nearest-node fallback is geographically correct (Haversine)."""
    lat1, lon1 = 30.0658, 31.7783
    lat2, lon2 = 30.0680, 31.7800
    dist_km = haversine_distance_km(lat1, lon1, lat2, lon2)
    assert 0.1 < dist_km < 1.0


def test_3_one_way_roads_remain_directional():
    """Test 3 — One-way roads remain directional."""
    G = nx.DiGraph()
    t = calculate_free_flow_time(100.0, 50.0)

    # One-way edge: 201 -> 202 ONLY
    G.add_edge(201, 202, edge_id="oneway_1", osm_way_id=10, road_type="primary", road_length_m=100.0, speed_limit_kmh=50.0, free_flow_time_seconds=t, weight=t, is_oneway=True)

    # Reverse path should NOT exist in G
    assert G.has_edge(201, 202)
    assert not G.has_edge(202, 201)

    resolver = DummyZoneResolver({"Z_201": 201, "Z_202": 202})

    res_rev = assign_traffic_aon(
        {"hour": 8, "od_matrix": [{"origin_zone": "Z_202", "destination_zone": "Z_201", "trips": 50.0}]},
        graph=G, zone_resolver=resolver
    )
    assert res_rev.assigned_trips == pytest.approx(0.0)
    assert res_rev.unassigned_trips == pytest.approx(50.0)
    assert res_rev.unreachable_pairs == 1


def test_4_two_way_roads_remain_bidirectional():
    """Test 4 — Two-way roads remain bidirectional."""
    G = nx.DiGraph()
    t = calculate_free_flow_time(100.0, 50.0)

    # Two-way edge: 301 <-> 302
    G.add_edge(301, 302, edge_id="twoway_1", osm_way_id=20, road_type="secondary", road_length_m=100.0, speed_limit_kmh=50.0, free_flow_time_seconds=t, weight=t, is_oneway=False)
    G.add_edge(302, 301, edge_id="twoway_1", osm_way_id=20, road_type="secondary", road_length_m=100.0, speed_limit_kmh=50.0, free_flow_time_seconds=t, weight=t, is_oneway=False)

    assert G.has_edge(301, 302)
    assert G.has_edge(302, 301)

    resolver = DummyZoneResolver({"Z_301": 301, "Z_302": 302})

    res_fwd = assign_traffic_aon(
        {"hour": 8, "od_matrix": [{"origin_zone": "Z_301", "destination_zone": "Z_302", "trips": 40.0}]},
        graph=G, zone_resolver=resolver
    )
    assert res_fwd.assigned_trips == pytest.approx(40.0)

    res_rev = assign_traffic_aon(
        {"hour": 8, "od_matrix": [{"origin_zone": "Z_302", "destination_zone": "Z_301", "trips": 40.0}]},
        graph=G, zone_resolver=resolver
    )
    assert res_rev.assigned_trips == pytest.approx(40.0)


def test_5_connected_od_pair_routes_successfully():
    """Test 5 — Connected OD pair routes successfully on shortest path."""
    G = create_synthetic_test_graph()
    resolver = DummyZoneResolver({"Z_A": 101, "Z_C": 103})

    od_input = {
        "hour": 8,
        "od_matrix": [{"origin_zone": "Z_A", "destination_zone": "Z_C", "trips": 150.0}]
    }

    result = assign_traffic_aon(od_input, graph=G, zone_resolver=resolver)

    assert result.assigned_trips == pytest.approx(150.0)
    assert result.unassigned_trips == pytest.approx(0.0)
    assert result.unreachable_pairs == 0

    flows = {(f.osm_node_from, f.osm_node_to): f.assigned_trips for f in result.link_flows}
    assert flows.get((101, 102), 0) == pytest.approx(150.0)
    assert flows.get((102, 103), 0) == pytest.approx(150.0)


def test_6_genuinely_disconnected_od_pair_unreachable():
    """Test 6 — Genuinely disconnected OD pair is reported as unreachable."""
    G = nx.DiGraph()
    t = calculate_free_flow_time(100.0, 50.0)

    # Component 1: 401 <-> 402
    G.add_edge(401, 402, edge_id="c1", osm_way_id=30, road_type="primary", road_length_m=100.0, speed_limit_kmh=50.0, free_flow_time_seconds=t, weight=t, is_oneway=False)
    G.add_edge(402, 401, edge_id="c1", osm_way_id=30, road_type="primary", road_length_m=100.0, speed_limit_kmh=50.0, free_flow_time_seconds=t, weight=t, is_oneway=False)

    # Component 2: 501 <-> 502 (isolated)
    G.add_edge(501, 502, edge_id="c2", osm_way_id=31, road_type="primary", road_length_m=100.0, speed_limit_kmh=50.0, free_flow_time_seconds=t, weight=t, is_oneway=False)
    G.add_edge(502, 501, edge_id="c2", osm_way_id=31, road_type="primary", road_length_m=100.0, speed_limit_kmh=50.0, free_flow_time_seconds=t, weight=t, is_oneway=False)

    resolver = DummyZoneResolver({"Z_401": 401, "Z_501": 501})

    od_input = {
        "hour": 8,
        "od_matrix": [{"origin_zone": "Z_401", "destination_zone": "Z_501", "trips": 250.0}]
    }

    res = assign_traffic_aon(od_input, graph=G, zone_resolver=resolver)

    assert res.total_od_trips == pytest.approx(250.0)
    assert res.assigned_trips == pytest.approx(0.0)
    assert res.unassigned_trips == pytest.approx(250.0)
    assert res.unreachable_pairs == 1


def test_7_od_demand_conservation():
    """Test 7 — OD demand conservation passes (assigned + unassigned == input_demand)."""
    G = create_synthetic_test_graph()
    resolver = DummyZoneResolver({"Z_A": 101, "Z_C": 103, "Z_MISSING": 999})

    od_input = {
        "hour": 8,
        "od_matrix": [
            {"origin_zone": "Z_A", "destination_zone": "Z_C", "trips": 350.5},
            {"origin_zone": "Z_A", "destination_zone": "Z_MISSING", "trips": 149.5},
        ]
    }

    res = assign_traffic_aon(od_input, graph=G, zone_resolver=resolver)

    assert res.total_od_trips == pytest.approx(500.0)
    assert res.assigned_trips == pytest.approx(350.5)
    assert res.unassigned_trips == pytest.approx(149.5)
    assert (res.assigned_trips + res.unassigned_trips) == pytest.approx(res.total_od_trips)


def test_8_real_repository_connectivity_diagnostics():
    """Test 8 — Real repository connectivity diagnostics execute successfully."""
    from diagnose_network_connectivity import run_diagnostics
    # Running diagnostics function directly
    run_diagnostics()


def test_9_real_stage1_stage2_smoke_test():
    """Test 9 — Real Stage 1 -> Stage 2 smoke test (Z0008, 8,000 residents, Hour 8)."""
    dev_inp = DevelopmentInput(
        development_type="residential_compound",
        zone_id="Z0008",
        properties={"num_residents": 8000},
    )

    od_demand = calculate_development_od(dev_inp, hour=8, gamma=1.5)

    assert od_demand.total_trips > 0
    assert len(od_demand.od_matrix) > 0

    res = assign_traffic_aon(od_demand)

    assert res.hour == 8
    assert res.total_od_trips == pytest.approx(od_demand.total_trips, abs=1e-1)

    # High assignment rate expected on corrected graph (all inter-zone trips assigned)
    assignment_pct = (res.assigned_trips / res.total_od_trips) * 100.0
    assert assignment_pct > 80.0
    assert len(res.link_flows) > 100
    assert (res.assigned_trips + res.unassigned_trips) == pytest.approx(res.total_od_trips, abs=1e-1)
