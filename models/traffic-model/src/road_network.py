"""
Road-network topology features derived from the ACTUAL OSM graph.

Uses shared OSM nodes between segments (real network connectivity,
not spatial approximation) to compute:
  intersection_count      endpoints shared by >=3 drivable segments
  intersection_density    intersections per km of road
  node_degree             highest endpoint degree of the segment
  connected_road_count    distinct other segments touching this one
and finalises the capacity proxy with a junction penalty.
"""

from collections import defaultdict

import numpy as np
import pandas as pd

import config
import osm_features


def _node_to_roads(drivable: pd.DataFrame):
    node_map = defaultdict(set)
    for idx, (u, v) in enumerate(zip(drivable["node_u"], drivable["node_v"])):
        node_map[u].add(idx)
        node_map[v].add(idx)
    return node_map


def add_topology_features(roads: pd.DataFrame) -> pd.DataFrame:
    """
    Adds topology columns to ALL rows (non-drivable rows get neutral
    values so the table stays rectangular), and finalises
    road_capacity_proxy by applying the junction penalty.
    """
    g = roads.copy()
    drivable_mask = g["is_drivable"].values
    drivable = g[drivable_mask]
    node_map = _node_to_roads(drivable)

    n = len(g)
    intersection_count = np.zeros(n, dtype=int)
    node_degree = np.zeros(n, dtype=int)
    connected_roads = np.zeros(n, dtype=int)

    d_idx = {i: pos for pos, i in enumerate(drivable.index)}
    for i in drivable.index:
        u, v = g.at[i, "node_u"], g.at[i, "node_v"]
        pos = d_idx[i]

        deg_u, deg_v = len(node_map[u]), len(node_map[v])
        node_degree[pos] = max(deg_u, deg_v)

        inter_nodes = {nd for nd in (u, v) if len(node_map[nd]) >= 3}
        intersection_count[pos] = len(inter_nodes)

        neighbours: set = set()
        for nd in (u, v):
            neighbours |= node_map[nd]
        neighbours.discard(i)
        connected_roads[pos] = len(neighbours)

    g["intersection_count"] = intersection_count
    g["node_degree"] = node_degree
    g["connected_road_count"] = connected_roads
    length_km = g["road_length_m"] / 1000.0
    g["intersection_density"] = (g["intersection_count"] /
                                 length_km.clip(lower=0.05)).round(3)

    junction_penalty = np.where(
        g["intersection_count"] >= 2,
        config.CAPACITY_JUNCTION_PENALTY,
        1.0,
    )
    if "capacity_base" not in g:
        g["capacity_base"] = g.apply(osm_features.base_capacity_proxy, axis=1)
    g["road_capacity_proxy"] = (g["capacity_base"] * junction_penalty).round(0)
    return g


def build_road_adjacency(roads: pd.DataFrame) -> dict:
    """Map each drivable segment position -> set of neighbour positions."""
    drivable = roads[roads["is_drivable"]].reset_index(drop=True)
    node_map = _node_to_roads(drivable)
    adjacency = defaultdict(set)
    for i in range(len(drivable)):
        u, v = drivable.at[i, "node_u"], drivable.at[i, "node_v"]
        for nd in (u, v):
            adjacency[i] |= node_map[nd]
        adjacency[i].discard(i)
    return dict(adjacency)


def connectivity_factor(roads: pd.DataFrame) -> pd.Series:
    """
    Demand multiplier from connectivity: more connected segments indicate
    through-traffic corridors. Scaled to [CONNECTIVITY_FACTOR_MIN, MAX].
    """
    cr = pd.to_numeric(roads.get("connected_road_count", 0),
                       errors="coerce").fillna(0).astype(float)
    lo, hi = config.CONNECTIVITY_FACTOR_MIN, config.CONNECTIVITY_FACTOR_MAX
    if cr.max() == cr.min():
        return pd.Series(lo, index=roads.index)
    scaled = (cr - cr.min()) / (cr.max() - cr.min())
    return (lo + (hi - lo) * scaled).round(4)
