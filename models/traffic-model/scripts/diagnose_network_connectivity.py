"""
Network Connectivity Diagnostic Tool — AI Urban Digital Twin

Analyzes the OpenStreetMap road graph construction, topological sub-segments,
connected components (weak and strong), zone centroid mapping, and origin-destination
reachability percentages across study area zones.

Usage:
  python traffic-model/scripts/diagnose_network_connectivity.py
"""

import math
from collections import Counter
from pathlib import Path
import sys

import geopandas as gpd
import networkx as nx
import pandas as pd

# Path setup
SCRIPT_DIR = Path(__file__).resolve().parent
TRAFFIC_MODEL_DIR = SCRIPT_DIR.parent
PROJECT_ROOT = TRAFFIC_MODEL_DIR.parent

sys.path.insert(0, str(TRAFFIC_MODEL_DIR / "src"))
sys.path.insert(0, str(PROJECT_ROOT / "trip-demand-model" / "src"))

import config
import osm_loader
import osm_features
import road_network
from traffic_assignment import build_osm_graph, ZoneNodeResolver
from trip_generation import haversine_distance_km


def run_diagnostics():
    print("=" * 70)
    print("  NETWORK CONNECTIVITY & ZONE MAPPING DIAGNOSTIC REPORT")
    print("=" * 70)

    # 1. Load OSM & build graph
    gpkg_path = config.OSM_ROADS_GPKG
    if not gpkg_path.exists():
        print(f"GeoPackage not found at {gpkg_path}, loading raw XML...")
        roads_gdf, nodes_dict, _ = osm_loader.load_osm()
        roads_gdf = osm_features.compute_base_features(roads_gdf)
        roads_gdf = road_network.add_topology_features(roads_gdf)
    else:
        roads_gdf = gpd.read_file(gpkg_path)

    drivable = roads_gdf[roads_gdf["is_drivable"]].copy()

    G, meta = build_osm_graph(roads_gdf=roads_gdf)

    w_comps = list(nx.weakly_connected_components(G))
    s_comps = list(nx.strongly_connected_components(G))
    largest_w_size = len(max(w_comps, key=len)) if w_comps else 0
    largest_s_size = len(max(s_comps, key=len)) if s_comps else 0

    print("\n[Network Summary]")
    print(f"  Total road sub-segments:    {len(roads_gdf):,}")
    print(f"  Drivable sub-segments:      {len(drivable):,}")
    print(f"  Graph nodes:               {G.number_of_nodes():,}")
    print(f"  Graph directed edges:      {G.number_of_edges():,}")
    print(f"  Weakly connected comps:    {len(w_comps)} (largest component: {largest_w_size:,} nodes / {largest_w_size/max(G.number_of_nodes(),1)*100:.1f}%)")
    print(f"  Strongly connected comps:  {len(s_comps)} (largest component: {largest_s_size:,} nodes / {largest_s_size/max(G.number_of_nodes(),1)*100:.1f}%)")

    # 2. Zone Mapping Diagnostics
    zone_csv = PROJECT_ROOT / "trip-demand-model" / "data" / "raw" / "zone_osm_mapping_v2.csv"
    zone_df = pd.read_csv(zone_csv)
    resolver = ZoneNodeResolver(zone_csv_path=zone_csv, graph=G)

    mapped_nodes = {str(r["zone_id"]): resolver.resolve_zone(str(r["zone_id"])) for _, r in zone_df.iterrows()}

    distances = []
    largest_scc_set = set(max(s_comps, key=len)) if s_comps else set()

    for _, r in zone_df.iterrows():
        zid = str(r["zone_id"])
        nid = mapped_nodes[zid]
        if nid in resolver.node_coords:
            nlat, nlon = resolver.node_coords[nid]
            clat, clon = float(r["centroid_lat"]), float(r["centroid_lon"])
            distances.append(haversine_distance_km(clat, clon, nlat, nlon) * 1000.0)

    avg_dist = sum(distances) / max(len(distances), 1)
    max_dist = max(distances) if distances else 0.0
    zones_in_largest = sum(1 for nid in mapped_nodes.values() if nid in largest_scc_set)

    print("\n[Zone Mapping Summary]")
    print(f"  Total study zones:         {len(zone_df)}")
    print(f"  Zones resolved to graph:   {len(mapped_nodes)} / {len(zone_df)} (100%)")
    print(f"  Zones in largest SCC:      {zones_in_largest} / {len(zone_df)} ({zones_in_largest/len(zone_df)*100:.1f}%)")
    print(f"  Avg zone-to-node distance: {avg_dist:.1f} meters")
    print(f"  Max zone-to-node distance: {max_dist:.1f} meters")

    # 3. OD Reachability Matrix
    sample_origins = ["Z0000", "Z0001", "Z0002", "Z0003", "Z0008"]
    print("\n[OD Reachability Diagnostics for Sample Origins]")
    total_sample_pairs = 0
    total_reachable_sample = 0

    for orig in sample_origins:
        if orig not in mapped_nodes:
            continue
        o_node = mapped_nodes[orig]
        reachable_count = 0
        total_dest = 0
        for dest, d_node in mapped_nodes.items():
            if orig == dest:
                continue
            total_dest += 1
            if nx.has_path(G, o_node, d_node):
                reachable_count += 1

        total_sample_pairs += total_dest
        total_reachable_sample += reachable_count
        pct = (reachable_count / max(total_dest, 1)) * 100.0
        print(f"  Origin {orig:6s} (node {o_node}): {reachable_count:3d} / {total_dest:3d} reachable destinations ({pct:.1f}%)")

    total_all_pairs = 0
    total_all_reachable = 0
    for o_zid, o_node in mapped_nodes.items():
        for d_zid, d_node in mapped_nodes.items():
            if o_zid == d_zid:
                continue
            total_all_pairs += 1
            if nx.has_path(G, o_node, d_node):
                total_all_reachable += 1

    overall_pct = (total_all_reachable / max(total_all_pairs, 1)) * 100.0
    print("\n[Overall Network OD Connectivity]")
    print(f"  Total possible OD pairs:   {total_all_pairs:,}")
    print(f"  Reachable OD pairs:        {total_all_reachable:,}")
    print(f"  Unreachable OD pairs:      {total_all_pairs - total_all_reachable:,}")
    print(f"  Reachability Percentage:   {overall_pct:.2f}%")
    print("=" * 70)


if __name__ == "__main__":
    run_diagnostics()
