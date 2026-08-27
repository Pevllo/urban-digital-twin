"""
Traffic Assignment Engine — AI Urban Digital Twin + What-If Simulator (Stage 2)

Performs deterministic All-or-Nothing (AON) shortest-path traffic assignment:
  1. Constructs a directed OSM road graph G(V, E) from osm_roads.gpkg.
  2. Computes free-flow travel time per edge: t_0 = length_m / speed_mps.
  3. Maps Stage 1 zone OD demand (origin_zone -> destination_zone) to graph nodes using zone_osm_mapping_v2.csv.
  4. Routes OD trip flows along shortest free-flow travel time paths using Dijkstra.
  5. Accumulates assigned trip volumes on each directed OSM road link (ΔV_assigned).
  6. Tracks and reports unreachable OD pairs without crashing.

Independent from the ML Traffic Model and BPR/LOS congestion engines.
"""

from __future__ import annotations

import math
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple, Union

import geopandas as gpd
import networkx as nx
import numpy as np
import pandas as pd

# Relative paths
MODULE_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = MODULE_DIR.parent.parent
DEFAULT_GPKG_PATH = PROJECT_ROOT / "traffic-model" / "data" / "processed" / "osm_roads.gpkg"
DEFAULT_ZONE_CSV_PATH = PROJECT_ROOT / "trip-demand-model" / "data" / "raw" / "zone_osm_mapping_v2.csv"


@dataclass
class LinkFlowRecord:
    """Assigned traffic flow record for a single directed road link."""
    edge_id: str
    osm_node_from: int
    osm_node_to: int
    assigned_trips: float
    road_type: str
    road_length_m: float
    speed_limit_kmh: float

    def to_dict(self) -> Dict[str, Any]:
        return {
            "edge_id": self.edge_id,
            "osm_node_from": int(self.osm_node_from),
            "osm_node_to": int(self.osm_node_to),
            "assigned_trips": round(float(self.assigned_trips), 2),
            "road_type": self.road_type,
            "road_length_m": round(float(self.road_length_m), 1),
            "speed_limit_kmh": float(self.speed_limit_kmh),
        }


@dataclass
class TrafficAssignmentResult:
    """Structured result of the Stage 2 Traffic Assignment stage."""
    hour: int
    total_od_trips: float
    assigned_trips: float
    unassigned_trips: float
    unreachable_pairs: int
    link_flows: List[LinkFlowRecord]
    unreachable_details: List[Dict[str, Any]] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "hour": int(self.hour),
            "total_od_trips": round(float(self.total_od_trips), 2),
            "assigned_trips": round(float(self.assigned_trips), 2),
            "unassigned_trips": round(float(self.unassigned_trips), 2),
            "unreachable_pairs": int(self.unreachable_pairs),
            "link_flows": [f.to_dict() for f in self.link_flows if f.assigned_trips > 0],
            "unreachable_details": self.unreachable_details,
        }


def calculate_free_flow_time(length_m: float, speed_limit_kmh: float) -> float:
    """
    Calculate free-flow travel time in seconds: t_0 = length_m / speed_mps.
    Safely handles missing or zero speed limits and length values.
    """
    valid_len = max(float(length_m), 0.1) if not math.isnan(length_m) else 10.0
    valid_speed = float(speed_limit_kmh) if not math.isnan(speed_limit_kmh) and speed_limit_kmh > 0 else 50.0
    speed_mps = valid_speed / 3.6
    return max(valid_len / speed_mps, 0.001)


def build_osm_graph(
    roads_gdf: Optional[gpd.GeoDataFrame] = None,
    gpkg_path: Optional[Path] = None,
    drivable_only: bool = True,
) -> Tuple[nx.DiGraph, Dict[str, Any]]:
    """
    Construct a directed NetworkX graph G(V, E) from OSM road segments.
    Edge weight is set to free-flow travel time in seconds.
    """
    if roads_gdf is None:
        path = gpkg_path or DEFAULT_GPKG_PATH
        if not path.exists():
            raise FileNotFoundError(f"OSM roads GeoPackage not found at: {path}")
        roads_gdf = gpd.read_file(path)

    gdf = roads_gdf.copy()
    if drivable_only and "is_drivable" in gdf.columns:
        gdf = gdf[gdf["is_drivable"]].copy()

    G = nx.DiGraph()

    for _, row in gdf.iterrows():
        u = int(row["node_u"])
        v = int(row["node_v"])
        edge_id = str(row.get("road_id", f"osm_{row.get('osm_way_id', '')}"))

        length_m = float(row.get("road_length_m", 10.0))
        speed_limit = float(row.get("speed_limit_kmh", 50.0))
        free_flow_time = calculate_free_flow_time(length_m, speed_limit)

        road_type = str(row.get("highway", "unclassified"))
        lane_count = int(row.get("lane_count", 2))
        capacity_proxy = float(row.get("road_capacity_proxy", 1000.0))
        is_oneway = bool(row.get("is_oneway", False))

        edge_data = {
            "edge_id": edge_id,
            "osm_way_id": int(row.get("osm_way_id", 0)),
            "road_type": road_type,
            "lane_count": lane_count,
            "speed_limit_kmh": speed_limit,
            "road_length_m": length_m,
            "road_capacity_proxy": capacity_proxy,
            "free_flow_time_seconds": free_flow_time,
            "weight": free_flow_time,  # Primary routing weight for NetworkX
            "is_oneway": is_oneway,
            "geom": getattr(row, "geometry", None),
        }



        # Forward edge: u -> v
        G.add_edge(u, v, **edge_data)

        # Reverse edge: v -> u (only for two-way roads)
        if not is_oneway:
            G.add_edge(v, u, **edge_data)

    metadata = {
        "total_nodes": G.number_of_nodes(),
        "total_edges": G.number_of_edges(),
        "drivable_segments": len(gdf),
    }

    return G, metadata


class ZoneNodeResolver:
    """
    Resolves spatial zone IDs to valid OSM graph nodes.
    Supports a principled spatial fallback hierarchy:
      1. Direct match with zone's osm_node_id if present in G and connected.
      2. Nearest road endpoint node (u or v) closest to zone centroid if nearest_road_id is in G.
      3. Nearest spatial graph node in V(G) by Haversine geographic distance to (centroid_lat, centroid_lon).
    """
    def __init__(
        self,
        zone_csv_path: Optional[Path] = None,
        graph: Optional[nx.DiGraph] = None,
    ):
        path = zone_csv_path or DEFAULT_ZONE_CSV_PATH
        if not path.exists():
            raise FileNotFoundError(f"Zone mapping CSV not found at: {path}")

        self.zone_df = pd.read_csv(path)
        self.zone_df["zone_id"] = self.zone_df["zone_id"].astype(str).str.strip()
        self.graph = graph
        self.resolved_cache: Dict[str, int] = {}
        self.node_coords: Dict[int, Tuple[float, float]] = {}

        if graph is not None:
            self._build_node_coords()
            self._prebuild_mapping()

    def _build_node_coords(self):
        """Extract lat/lon coordinates for nodes in the graph from edge geometries."""
        for u, v, d in self.graph.edges(data=True):
            geom = d.get("geom")
            if geom is not None and hasattr(geom, "coords"):
                coords = list(geom.coords)
                self.node_coords[u] = (coords[0][1], coords[0][0])
                self.node_coords[v] = (coords[-1][1], coords[-1][0])

    def _prebuild_mapping(self):
        graph_nodes = set(self.graph.nodes())
        if not graph_nodes:
            return

        # Identify largest strongly connected component for optimal connectivity
        try:
            s_comps = list(nx.strongly_connected_components(self.graph))
            largest_comp = set(max(s_comps, key=len)) if s_comps else graph_nodes
        except Exception:
            largest_comp = graph_nodes

        way_to_nodes: Dict[int, List[Tuple[int, int]]] = {}
        for u, v, d in self.graph.edges(data=True):
            wid = d.get("osm_way_id")
            if wid is not None:
                try:
                    way_to_nodes[int(wid)] = (u, v)
                except (ValueError, TypeError):
                    pass
            edge_id_str = str(d.get("edge_id", ""))
            if edge_id_str.startswith("osm_"):
                try:
                    wid_from_eid = int(edge_id_str.split("_")[1])
                    way_to_nodes[wid_from_eid] = (u, v)
                except (ValueError, TypeError, IndexError):
                    pass

        for _, row in self.zone_df.iterrows():
            zid = str(row["zone_id"])
            clat, clon = float(row["centroid_lat"]), float(row["centroid_lon"])

            # 1. Direct match if osm_node_id is in the main connected component
            nid = int(row["osm_node_id"])
            if nid in largest_comp:
                self.resolved_cache[zid] = nid
                continue

            # 2. Match nearest_road_id endpoints if in main connected component
            resolved = False
            try:
                rid = int(row["nearest_road_id"])
                if rid in way_to_nodes:
                    u, v = way_to_nodes[rid]
                    if u in largest_comp or v in largest_comp:
                        cand = [n for n in (u, v) if n in largest_comp]
                        if not cand:
                            cand = [u, v]
                        best_cand = min(cand, key=lambda n: self._dist(clat, clon, n))
                        self.resolved_cache[zid] = best_cand
                        resolved = True
            except (ValueError, TypeError):
                pass

            if resolved:
                continue

            # 3. Spatial nearest neighbor among graph nodes in largest component
            best_n, best_d = None, float("inf")
            target_node_pool = largest_comp if largest_comp else graph_nodes
            for n in target_node_pool:
                if n in self.node_coords:
                    d_km = self._dist(clat, clon, n)
                    if d_km < best_d:
                        best_d = d_km
                        best_n = n

            if best_n is not None:
                self.resolved_cache[zid] = best_n


    def _dist(self, clat: float, clon: float, node_id: int) -> float:
        if node_id not in self.node_coords:
            return 99999.0
        nlat, nlon = self.node_coords[node_id]
        dlat = math.radians(nlat - clat)
        dlon = math.radians(nlon - clon)
        a = math.sin(dlat / 2.0) ** 2 + math.cos(math.radians(clat)) * math.cos(math.radians(nlat)) * math.sin(dlon / 2.0) ** 2
        return 6371.0 * 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))

    def resolve_zone(self, zone_id: str) -> int:
        zone_id = str(zone_id).strip()
        if zone_id in self.resolved_cache:
            return self.resolved_cache[zone_id]

        row = self.zone_df[self.zone_df["zone_id"] == zone_id]
        if row.empty:
            raise ValueError(f"Zone ID '{zone_id}' not found in zone mapping dataset.")

        if self.graph is None:
            return int(row["osm_node_id"].values[0])

        graph_nodes = set(self.graph.nodes())
        try:
            s_comps = list(nx.strongly_connected_components(self.graph))
            largest_comp = set(max(s_comps, key=len)) if s_comps else graph_nodes
        except Exception:
            largest_comp = graph_nodes

        nid = int(row["osm_node_id"].values[0])
        if nid in largest_comp:
            self.resolved_cache[zone_id] = nid
            return nid

        clat, clon = float(row["centroid_lat"].values[0]), float(row["centroid_lon"].values[0])
        try:
            rid = int(row["nearest_road_id"].values[0])
            for u, v, d in self.graph.edges(data=True):
                if d.get("osm_way_id") == rid:
                    cand = [n for n in (u, v) if n in largest_comp]
                    if not cand:
                        cand = [u, v]
                    chosen = min(cand, key=lambda n: self._dist(clat, clon, n))
                    self.resolved_cache[zone_id] = chosen
                    return chosen
        except (ValueError, TypeError):
            pass

        # Spatial nearest node in G (preferring largest_comp)
        best_n, best_d = None, float("inf")
        target_pool = largest_comp if largest_comp else graph_nodes
        for n in target_pool:
            if n in self.node_coords:
                d_km = self._dist(clat, clon, n)
                if d_km < best_d:
                    best_d = d_km
                    best_n = n

        if best_n is not None:
            self.resolved_cache[zone_id] = best_n
            return best_n

        first_node = next(iter(graph_nodes))
        self.resolved_cache[zone_id] = first_node
        return first_node





def assign_traffic_aon(
    od_input: Union[Dict[str, Any], List[Dict[str, Any]], Any],
    graph: Optional[nx.DiGraph] = None,
    zone_resolver: Optional[ZoneNodeResolver] = None,
    gpkg_path: Optional[Path] = None,
    zone_csv_path: Optional[Path] = None,
) -> TrafficAssignmentResult:
    """
    Perform All-or-Nothing (AON) shortest-path traffic assignment for a single hour.
    """
    if graph is None:
        graph, _ = build_osm_graph(gpkg_path=gpkg_path)

    if zone_resolver is None:
        zone_resolver = ZoneNodeResolver(zone_csv_path=zone_csv_path, graph=graph)

    # Parse OD payload
    if hasattr(od_input, "to_dict"):
        od_dict = od_input.to_dict()
    elif isinstance(od_input, dict):
        od_dict = od_input
    elif isinstance(od_input, list):
        od_dict = {"hour": 8, "od_matrix": od_input}
    else:
        raise ValueError(f"Invalid OD input type: {type(od_input)}")

    hour = int(od_dict.get("hour", 8))
    od_records = od_dict.get("od_matrix", [])

    total_od_trips = 0.0
    assigned_trips = 0.0
    unassigned_trips = 0.0
    unreachable_pairs = 0
    unreachable_details = []

    # Map edge tuple -> accumulated trip flow
    edge_flow_map: Dict[Tuple[int, int], float] = {e: 0.0 for e in graph.edges()}

    # Shortest path cache per (source_node, target_node) to avoid recomputing identical paths
    path_cache: Dict[Tuple[int, int], Optional[List[int]]] = {}

    for record in od_records:
        if isinstance(record, dict):
            orig_z = str(record["origin_zone"])
            dest_z = str(record["destination_zone"])
            trips = float(record["trips"])
        else:
            orig_z = str(getattr(record, "origin_zone"))
            dest_z = str(getattr(record, "destination_zone"))
            trips = float(getattr(record, "trips"))

        if trips <= 0:
            continue

        total_od_trips += trips

        if orig_z == dest_z:
            # Internal trips are not assigned to external road edges
            unassigned_trips += trips
            continue

        try:
            orig_node = zone_resolver.resolve_zone(orig_z)
            dest_node = zone_resolver.resolve_zone(dest_z)
        except ValueError as err:
            unreachable_pairs += 1
            unassigned_trips += trips
            unreachable_details.append({
                "origin_zone": orig_z,
                "destination_zone": dest_z,
                "trips": trips,
                "reason": str(err),
            })
            continue

        if orig_node == dest_node:
            unassigned_trips += trips
            continue

        pair_key = (orig_node, dest_node)
        if pair_key not in path_cache:
            try:
                path = nx.shortest_path(graph, source=orig_node, target=dest_node, weight="weight")
                path_cache[pair_key] = path
            except (nx.NetworkXNoPath, nx.NodeNotFound):
                path_cache[pair_key] = None

        path = path_cache[pair_key]

        if path is None:
            unreachable_pairs += 1
            unassigned_trips += trips
            unreachable_details.append({
                "origin_zone": orig_z,
                "destination_zone": dest_z,
                "trips": trips,
                "reason": f"No path between OSM nodes {orig_node} and {dest_node}",
            })
        else:
            # Accumulate trips along edges on the shortest path
            for u, v in zip(path[:-1], path[1:]):
                if (u, v) in edge_flow_map:
                    edge_flow_map[(u, v)] += trips

            assigned_trips += trips

    # Build output LinkFlowRecords
    link_flow_records = []
    for (u, v), flow in edge_flow_map.items():
        if flow > 0:
            edge_attr = graph[u][v]
            link_flow_records.append(
                LinkFlowRecord(
                    edge_id=edge_attr["edge_id"],
                    osm_node_from=u,
                    osm_node_to=v,
                    assigned_trips=flow,
                    road_type=edge_attr["road_type"],
                    road_length_m=edge_attr["road_length_m"],
                    speed_limit_kmh=edge_attr["speed_limit_kmh"],
                )
            )

    # Verification of conservation: assigned + unassigned == total_od_trips
    conservation_delta = abs((assigned_trips + unassigned_trips) - total_od_trips)
    if conservation_delta > 1e-3:
        raise ValueError(
            f"Demand conservation check failed! Total OD ({total_od_trips:.2f}) != "
            f"Assigned ({assigned_trips:.2f}) + Unassigned ({unassigned_trips:.2f})"
        )

    return TrafficAssignmentResult(
        hour=hour,
        total_od_trips=total_od_trips,
        assigned_trips=assigned_trips,
        unassigned_trips=unassigned_trips,
        unreachable_pairs=unreachable_pairs,
        link_flows=link_flow_records,
        unreachable_details=unreachable_details,
    )
