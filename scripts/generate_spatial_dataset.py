#!/usr/bin/env python3
"""
Generate Spatial Features Dataset — AI Urban Digital Twin
=========================================================

Reproducible OSM -> spatialFeatures.json pipeline.

The geographic source of truth is the raw OpenStreetMap file:

    models/traffic-model/data/raw/osm/map.osm

This script parses that file and derives the spatial feature dataset that the
Cesium frontend renders (buildings, roads, and any closed boundary polygons).

Pipeline
--------
    map.osm  --parse-->  spatialFeatures.json
                             |
                          Cesium frontend

Outputs (identical content, different formatting):
    - frontend/src/data/spatialFeatures.json   (compact, consumed by frontend)
    - data/processed/spatialFeatures.json      (indented, human readable)

Coordinate system
-----------------
map.osm uses WGS84 (EPSG:4326) latitude/longitude.  No reprojection is
performed: coordinates are preserved verbatim from the OSM node attributes.

Geometry convention
-------------------
Every coordinate is the pair ``[lat, lon]``, matching how the Cesium map
consumes them (``Cartesian3.fromDegrees(lon, lat, z)``).

Data provenance
---------------
No buildings, roads, or boundary coordinates are typed by hand.  Every
feature comes from a real OSM ``way`` (or closed way).  If OSM provides no
height / floor (level) information for a building, the generator does NOT
invent one.  A default visual height is applied only at render time in the
frontend and is never written back into this dataset.
"""

import os
import json
import xml.etree.ElementTree as ET
from math import hypot
from datetime import datetime, timezone

# ---------------------------------------------------------------------------
# Road classes that appear as roads in the Digital Twin.
# ---------------------------------------------------------------------------

ROAD_HIGHWAYS = {
    "motorway",
    "motorway_link",
    "trunk",
    "trunk_link",
    "primary",
    "primary_link",
    "secondary",
    "secondary_link",
    "tertiary",
    "tertiary_link",
    "residential",
    "service",
    "unclassified",
    "living_street",
    "construction",
}

# ---------------------------------------------------------------------------
# Classes considered drivable by the traffic model.
#
# NOTE: "construction" is intentionally NOT included because the traffic
# model marks construction roads as non-drivable.
# ---------------------------------------------------------------------------

DRIVABLE_HIGHWAYS = {
    "motorway",
    "motorway_link",
    "trunk",
    "trunk_link",
    "primary",
    "primary_link",
    "secondary",
    "secondary_link",
    "tertiary",
    "tertiary_link",
    "residential",
    "service",
    "unclassified",
    "living_street",
}

# ---------------------------------------------------------------------------
# Optional building tags that are preserved when present on an OSM building
# way.  Absent tags are emitted as empty strings / None so the JSON schema
# stays stable and deterministic.  No values are fabricated.
# ---------------------------------------------------------------------------

BUILDING_TAGS = (
    "building",
    "name",
    "name:en",
    "name:ar",
    "amenity",
    "office",
    "height",
    "building:levels",
    "building:levels:aboveground",
    "layer",
)


def _format_levels(value):
    """Parse building:levels into an integer, or None if absent/invalid."""
    if not value:
        return None
    try:
        return int(float(value))
    except (ValueError, TypeError):
        return None


def _compute_feature_bounds(roads, buildings):
    """
    Compute the geographic bounding box from the actual urban feature
    coordinates (WGS84): building footprints + road geometries.

    The OSM <bounds> element is only the export query bbox and does NOT
    enclose the whole dataset.  City-level administrative boundary polygons
    (e.g. the New Cairo City boundary) can extend far beyond the urban
    fabric, so they are intentionally excluded here: the project extent is
    defined by the built environment (roads + buildings), not by a huge city
    boundary ring.
    """
    lats = []
    lons = []
    for road in roads:
        for lat, lon in road["coordinates"]:
            lats.append(lat)
            lons.append(lon)
    for building in buildings:
        for lat, lon in building["coordinates"]:
            lats.append(lat)
            lons.append(lon)

    if not lats or not lons:
        return {
            "west": None,
            "south": None,
            "east": None,
            "north": None,
        }

    return {
        "west": float(min(lons)),
        "south": float(min(lats)),
        "east": float(max(lons)),
        "north": float(max(lats)),
    }


def _way_closed(way):
    refs = way.findall("nd")
    if len(refs) < 3:
        return False
    return refs[0].attrib.get("ref") == refs[-1].attrib.get("ref")


def extract_spatial_features(osm_path, source_label=None):
    """
    Parse OSM XML and extract:

    - Buildings (footprints + preserved OSM tags)
    - Roads (geometries + classification + drivability)
    - Boundaries (closed administrative / boundary ways)
    - Geographic bounds + metadata
    """

    if not os.path.exists(osm_path):
        raise FileNotFoundError(
            f"OSM file not found: {osm_path}"
        )

    print(f"Parsing OSM dataset from {osm_path}...")

    tree = ET.parse(osm_path)
    root = tree.getroot()

    # -----------------------------------------------------------------------
    # Load OSM node coordinates (WGS84).
    # -----------------------------------------------------------------------

    nodes = {}
    for node in root.findall("node"):
        nodes[node.attrib["id"]] = (
            float(node.attrib["lat"]),
            float(node.attrib["lon"]),
        )

    roads = []
    buildings = []
    boundaries = []

    highway_counts = {}
    drivable_count = 0
    non_drivable_count = 0

    ignored_geometries = {
        "roads_too_short": 0,
        "buildings_degenerate": 0,
    }

    for way in root.findall("way"):
        way_id = way.attrib.get("id")

        tags = {
            tag.attrib["k"]: tag.attrib["v"]
            for tag in way.findall("tag")
        }

        highway = tags.get("highway")
        building = tags.get("building")

        node_refs = [
            nd.attrib["ref"]
            for nd in way.findall("nd")
        ]

        coordinates = [
            [nodes[ref][0], nodes[ref][1]]
            for ref in node_refs
            if ref in nodes
        ]

        # -------------------------------------------------------------------
        # ROAD
        # -------------------------------------------------------------------

        if (
            highway in ROAD_HIGHWAYS
            and len(coordinates) >= 2
        ):
            if len(coordinates) < 2:
                ignored_geometries["roads_too_short"] += 1
            else:
                is_drivable = highway in DRIVABLE_HIGHWAYS

                if is_drivable:
                    drivable_count += 1
                else:
                    non_drivable_count += 1

                highway_counts[highway] = (
                    highway_counts.get(highway, 0) + 1
                )

                roads.append(
                    {
                        "id": f"way_{way_id}",
                        "osm_way_id": str(way_id),
                        "highway": highway,
                        "name": tags.get("name", ""),
                        "name_en": tags.get("name:en", ""),
                        "name_ar": tags.get("name:ar", ""),
                        "ref": tags.get("ref", ""),
                        "lanes": tags.get("lanes", ""),
                        "maxspeed": tags.get("maxspeed", ""),
                        "oneway": tags.get("oneway", ""),
                        "bridge": tags.get("bridge", ""),
                        "tunnel": tags.get("tunnel", ""),
                        "service": tags.get("service", ""),
                        "junction": tags.get("junction", ""),
                        "is_drivable": is_drivable,
                        "coordinates": coordinates,
                    }
                )

        # -------------------------------------------------------------------
        # BUILDING
        # -------------------------------------------------------------------

        elif (
            building
            and building != "no"
            and len(coordinates) >= 3
            and _way_closed(way)
        ):
            lats = [c[0] for c in coordinates]
            lons = [c[1] for c in coordinates]

            centroid_lat = sum(lats) / len(lats)
            centroid_lon = sum(lons) / len(lons)

            radius = max(
                hypot(
                    lat - centroid_lat,
                    lon - centroid_lon,
                ) * 111000
                for lat, lon in coordinates
            )

            height = tags.get("height", "")
            levels = _format_levels(tags.get("building:levels", ""))

            if len(coordinates) < 4:
                # A valid building footprint must be a polygon with an area;
                # skip self-degenerate 3-node "triangles" that enclose no area.
                ignored_geometries["buildings_degenerate"] += 1
            else:
                buildings.append(
                    {
                        "id": f"bldg_{way_id}",
                        "osm_way_id": str(way_id),
                        "building": building,
                        "name": tags.get("name", ""),
                        "name_en": tags.get("name:en", ""),
                        "name_ar": tags.get("name:ar", ""),
                        "amenity": tags.get("amenity", ""),
                        "office": tags.get("office", ""),
                        # Height / levels preserve ONLY real OSM values.
                        # map.osm currently has height on ~1 way and no
                        # building:levels; missing values stay empty/None
                        # rather than being fabricated.
                        "height": height if height else "",
                        "building:levels": (
                            tags.get("building:levels", "")
                        ),
                        "levels": levels,
                        "centroid": [
                            round(centroid_lat, 7),
                            round(centroid_lon, 7),
                        ],
                        "radius": round(
                            max(8.0, min(60.0, radius)), 6
                        ),
                        "coordinates": coordinates,
                    }
                )

        # -------------------------------------------------------------------
        # BOUNDARY (closed administrative / boundary ways)
        # -------------------------------------------------------------------

        elif (
            tags.get("boundary") == "administrative"
            and _way_closed(way)
            and len(coordinates) >= 4
        ):
            boundaries.append(
                {
                    "id": f"boundary_way_{way_id}",
                    "osm_way_id": str(way_id),
                    "type": tags.get("boundary", "administrative"),
                    "admin_level": tags.get("admin_level", ""),
                    "name": tags.get("name", ""),
                    "name_en": tags.get("name:en", ""),
                    "name_ar": tags.get("name:ar", ""),
                    "place": tags.get("place", ""),
                    "coordinates": coordinates,
                }
            )

    # -----------------------------------------------------------------------
    # Bounds from actual feature coordinates
    # -----------------------------------------------------------------------

    bounds = _compute_feature_bounds(roads, buildings)

    # -----------------------------------------------------------------------
    # Summary
    # -----------------------------------------------------------------------

    print(
        f"Extracted {len(roads)} roads, "
        f"{len(buildings)} buildings, "
        f"{len(boundaries)} boundaries."
    )
    print(f"Drivable roads: {drivable_count}")
    print(f"Non-drivable roads: {non_drivable_count}")
    print("Highway Breakdown:")
    for highway, count in sorted(
        highway_counts.items(),
        key=lambda item: item[1],
        reverse=True,
    ):
        print(f"  - {highway}: {count}")
    print(f"Ignored geometries: {ignored_geometries}")

    # -----------------------------------------------------------------------
    # Dataset
    # -----------------------------------------------------------------------

    dataset = {
        "source": "map.osm",
        "source_path": source_label or osm_path,
        "coordinate_system": "EPSG:4326 (WGS84 latitude/longitude)",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "bounds": bounds,
        "metadata": {
            "total_roads": len(roads),
            "drivable_roads": drivable_count,
            "non_drivable_roads": non_drivable_count,
            "total_buildings": len(buildings),
            "total_boundaries": len(boundaries),
            "highway_counts": highway_counts,
            "traffic_data_type": "synthetic",
            "traffic_mapping_key": "osm_way_id",
        },
        "roads": roads,
        "buildings": buildings,
        "boundaries": boundaries,
    }

    return dataset


def _write_json(path, data, indent=None):
    with open(path, "w", encoding="utf-8") as file:
        json.dump(
            data,
            file,
            ensure_ascii=False,
            indent=indent,
            separators=(",", ":") if indent is None else None,
        )


def main():
    # -----------------------------------------------------------------------
    # Project root
    # -----------------------------------------------------------------------

    root_dir = os.path.dirname(
        os.path.dirname(os.path.abspath(__file__))
    )

    # -----------------------------------------------------------------------
    # OSM source (authoritative)
    # -----------------------------------------------------------------------

    osm_path = os.path.join(
        root_dir,
        "models",
        "traffic-model",
        "data",
        "raw",
        "osm",
        "map.osm",
    )

    # Relative label so the stored path is portable across machines.
    source_label = os.path.relpath(osm_path, root_dir)

    dataset = extract_spatial_features(
        osm_path,
        source_label=source_label,
    )

    # -----------------------------------------------------------------------
    # Output paths
    # -----------------------------------------------------------------------

    out_frontend = os.path.join(
        root_dir,
        "frontend",
        "src",
        "data",
        "spatialFeatures.json",
    )
    out_processed = os.path.join(
        root_dir,
        "data",
        "processed",
        "spatialFeatures.json",
    )

    os.makedirs(os.path.dirname(out_frontend), exist_ok=True)
    os.makedirs(os.path.dirname(out_processed), exist_ok=True)

    # -----------------------------------------------------------------------
    # Frontend copy (compact) + processed copy (readable)
    # -----------------------------------------------------------------------

    _write_json(out_frontend, dataset)
    _write_json(out_processed, dataset, indent=2)

    print()
    print("Successfully saved spatial features dataset:")
    print(f"  - {out_frontend}")
    print(f"  - {out_processed}")


if __name__ == "__main__":
    main()
