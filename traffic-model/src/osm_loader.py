"""
OSM data loading utilities.

Parses raw OpenStreetMap XML (.osm) exports - such as Overpass API
downloads - into GeoDataFrames without assuming any tag exists.

The loader adapts to whatever attributes are actually present in the file:
it never invents columns like lanes/maxspeed/oneway; it reports which ones
exist and how complete they are.
"""

import xml.etree.ElementTree as ET
from pathlib import Path

import geopandas as gpd
import pandas as pd
from shapely.geometry import LineString

import config

TRAFFIC_TAG_KEYS = [
    "highway", "name", "name:en", "name:ar", "ref",
    "lanes", "maxspeed", "oneway", "bridge", "tunnel",
    "access", "service", "junction", "surface", "width",
]


def find_osm_files(directory: Path = None) -> list[Path]:
    """Return all OSM files found in the given directory."""
    directory = Path(directory) if directory else config.RAW_OSM_DIR
    files = sorted(directory.glob("*.osm"))
    pbf = sorted(directory.glob("*.pbf"))
    if pbf:
        raise NotImplementedError(
            f"Binary .pbf files are not supported by this loader: "
            f"{[f.name for f in pbf]}. Provide plain .osm XML instead."
        )
    return files


def _parse_tags(elem) -> dict:
    return {t.get("k"): t.get("v") for t in elem.findall("tag")}


def parse_osm_xml(path: Path):
    """
    Parse an OSM XML file.

    Returns
    -------
    nodes : dict[int, tuple[float, float]]   {node_id: (lon, lat)}
    roads : list[dict]                        one entry per way carrying a
                                              'highway' tag, with node refs
                                              and its tags.
    stats : dict                              low-level parsing counters.
    """
    nodes = {}
    roads = []
    n_nodes = n_ways = n_relations = 0

    context = ET.iterparse(path, events=("end",))
    for _, elem in context:
        if elem.tag == "node":
            n_nodes += 1
            nid = int(elem.get("id"))
            nodes[nid] = (float(elem.get("lon")), float(elem.get("lat")))
        elif elem.tag == "way":
            n_ways += 1
            tags = _parse_tags(elem)
            if "highway" in tags:
                refs = [int(nd.get("ref")) for nd in elem.findall("nd")]
                roads.append({
                    "osm_way_id": int(elem.get("id")),
                    "refs": refs,
                    "tags": tags,
                })
        elif elem.tag == "relation":
            n_relations += 1
        if elem.tag in ("node", "way", "relation"):
            elem.clear()

    stats = {"n_nodes_total": n_nodes, "n_ways_total": n_ways,
             "n_relations_total": n_relations}
    return nodes, roads, stats


def build_roads_gdf(nodes: dict, roads: list[dict]) -> gpd.GeoDataFrame:
    """
    Convert parsed ways into a GeoDataFrame of LineString road sub-segments split at shared intersection nodes.

    Splitting ways at shared intersection nodes ensures that node_u and node_v
    represent true topological network intersections rather than collapsed way endpoints.
    """
    from collections import Counter

    # Count occurrences of nodes across all ways to identify intersection points
    node_counts = Counter()
    for r in roads:
        valid_refs = [nid for nid in r["refs"] if nid in nodes]
        node_counts.update(valid_refs)

    present_keys = [k for k in TRAFFIC_TAG_KEYS
                    if any(k in r["tags"] for r in roads)]
    records, geometries, skipped = [], [], 0

    for r in roads:
        valid_refs = [nid for nid in r["refs"] if nid in nodes]
        if len(valid_refs) < 2:
            skipped += 1
            continue

        # Split way at interior nodes that are shared with other ways (node_counts > 1)
        split_indices = [0] + [i for i in range(1, len(valid_refs) - 1) if node_counts[valid_refs[i]] > 1] + [len(valid_refs) - 1]

        for seg_idx, (start_idx, end_idx) in enumerate(zip(split_indices[:-1], split_indices[1:])):
            if start_idx == end_idx:
                continue
            sub_refs = valid_refs[start_idx : end_idx + 1]
            coords = [nodes[nid] for nid in sub_refs]
            if len(coords) < 2:
                continue

            rec = {
                "osm_way_id": r["osm_way_id"],
                "seg_idx": seg_idx,
                "node_u": sub_refs[0],
                "node_v": sub_refs[-1],
            }
            rec.update({k: r["tags"].get(k) for k in present_keys})
            records.append(rec)
            geometries.append(LineString(coords))

    gdf = gpd.GeoDataFrame(records, geometry=geometries, crs=config.CRS_WGS84)
    gdf["road_id"] = "osm_" + gdf["osm_way_id"].astype(str).str.zfill(7) + "_" + gdf["seg_idx"].astype(str)
    gdf["skipped_unresolvable"] = skipped
    return gdf



def load_osm(osm_path: Path = None):
    """
    Load the first OSM file found in data/raw/osm/ and return
    (roads_gdf, nodes_dict, parse_stats).
    """
    files = find_osm_files(osm_path and [Path(osm_path)] or None)
    if not files:
        raise FileNotFoundError(f"No .osm files found in {config.RAW_OSM_DIR}")
    path = files[0]
    nodes, roads, stats = parse_osm_xml(path)
    roads_gdf = build_roads_gdf(nodes, roads)
    stats.update({"file": str(path), "file_size_mb": path.stat().st_size / 1e6,
                  "roads_declared": len(roads), "roads_built": len(roads_gdf)})
    return roads_gdf, nodes, stats


def inspect_osm(roads_gdf: gpd.GeoDataFrame, stats: dict) -> pd.DataFrame:
    """Produce the Phase-1 inspection table (one metric per row)."""
    rows = []
    add = lambda k, v: rows.append({"metric": k, "value": v})
    add("file", stats["file"])
    add("file_size_MB", round(stats["file_size_mb"], 2))
    add("format", "OSM XML v0.6 (Overpass export)")
    add("crs", str(roads_gdf.crs))
    add("geometry_type", ", ".join(sorted(set(roads_gdf.geom_type))))
    add("road_segments", len(roads_gdf))
    add("ways_skipped_unresolvable_nodes", stats.get("roads_declared", 0) - stats.get("roads_built", 0))
    add("total_xml_elements", f"nodes={stats['n_nodes_total']}, ways={stats['n_ways_total']}, relations={stats['n_relations_total']}")
    b = roads_gdf.total_bounds
    add("bbox_min_lon_lat", f"{b[0]:.5f}, {b[1]:.5f}")
    add("bbox_max_lon_lat", f"{b[2]:.5f}, {b[3]:.5f}")

    dup_ids = roads_gdf["osm_way_id"].duplicated().sum()
    dup_geom = roads_gdf.geometry.duplicated().sum()
    add("duplicate_way_ids", int(dup_ids))
    add("duplicate_geometries", int(dup_geom))

    for col in ["highway"] + [c for c in TRAFFIC_TAG_KEYS if c != "highway"]:
        if col == "highway":
            continue
        if col in roads_gdf.columns:
            miss = roads_gdf[col].isna().mean() * 100
            add(f"attr_{col}", f"present, missing={miss:.1f}%")
        else:
            add(f"attr_{col}", "ABSENT from data")

    add("invalid_geometries", int((~roads_gdf.is_valid).sum()))

    lengths_km = roads_gdf.to_crs(config.CRS_METRIC).length
    add("total_network_km", round(lengths_km.sum() / 1000, 1))
    add("mean_segment_m", round(lengths_km.mean(), 1))

    return pd.DataFrame(rows)
