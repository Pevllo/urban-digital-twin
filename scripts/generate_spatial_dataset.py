#!/usr/bin/env python3
"""
Generate Spatial Features Dataset — AI Urban Digital Twin

Uses the REAL OSM dataset and creates the frontend spatial dataset.

Outputs:
- frontend/src/data/spatialFeatures.json
- data/processed/spatialFeatures.json

Roads are kept at OSM-way level for Cesium visualization.

Traffic is generated separately by the traffic model at segmented-road level.
The OSM way ID is therefore preserved explicitly so the backend can aggregate
traffic segments belonging to the same OSM way.
"""

import os
import json
import xml.etree.ElementTree as ET
from math import hypot


# ---------------------------------------------------------------------------
# Road classes that should appear as roads in the Digital Twin.
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
# IMPORTANT:
# construction is intentionally NOT included.
# The traffic model marks construction roads as non-drivable.
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


def extract_spatial_features(osm_path):
    """
    Parse OSM XML and extract:

    - Road geometries
    - Road classification
    - OSM way ID
    - Drivability flag
    - Basic road metadata
    - Building footprints
    """

    if not os.path.exists(osm_path):
        raise FileNotFoundError(
            f"OSM file not found: {osm_path}"
        )

    print(f"Parsing OSM dataset from {osm_path}...")

    tree = ET.parse(osm_path)
    root = tree.getroot()

    # -----------------------------------------------------------------------
    # Load OSM nodes
    # -----------------------------------------------------------------------

    nodes = {}

    for node in root.findall("node"):
        node_id = node.attrib["id"]

        lat = float(node.attrib["lat"])
        lon = float(node.attrib["lon"])

        nodes[node_id] = (lat, lon)

    roads = []
    buildings = []

    highway_counts = {}
    drivable_count = 0
    non_drivable_count = 0

    # -----------------------------------------------------------------------
    # Parse ways
    # -----------------------------------------------------------------------

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

                    "name_en": tags.get(
                        "name:en",
                        ""
                    ),

                    "name_ar": tags.get(
                        "name:ar",
                        ""
                    ),

                    "ref": tags.get(
                        "ref",
                        ""
                    ),

                    "lanes": tags.get(
                        "lanes",
                        ""
                    ),

                    "maxspeed": tags.get(
                        "maxspeed",
                        ""
                    ),

                    "oneway": tags.get(
                        "oneway",
                        ""
                    ),

                    "bridge": tags.get(
                        "bridge",
                        ""
                    ),

                    "tunnel": tags.get(
                        "tunnel",
                        ""
                    ),

                    "service": tags.get(
                        "service",
                        ""
                    ),

                    "junction": tags.get(
                        "junction",
                        ""
                    ),

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
        ):
            lats = [
                coordinate[0]
                for coordinate in coordinates
            ]

            lons = [
                coordinate[1]
                for coordinate in coordinates
            ]

            centroid_lat = sum(lats) / len(lats)
            centroid_lon = sum(lons) / len(lons)

            radius = max(
                hypot(
                    lat - centroid_lat,
                    lon - centroid_lon
                ) * 111000
                for lat, lon in coordinates
            )

            buildings.append(
                {
                    "id": f"bldg_{way_id}",

                    "building": building,

                    "name": tags.get(
                        "name",
                        ""
                    ),

                    "centroid": [
                        centroid_lat,
                        centroid_lon
                    ],

                    "radius": max(
                        8.0,
                        min(60.0, radius)
                    ),

                    "coordinates": coordinates,
                }
            )

    # -----------------------------------------------------------------------
    # Summary
    # -----------------------------------------------------------------------

    print(
        f"Extracted {len(roads)} roads "
        f"and {len(buildings)} buildings."
    )

    print(
        f"Drivable roads: {drivable_count}"
    )

    print(
        f"Non-drivable roads: {non_drivable_count}"
    )

    print("Highway Breakdown:")

    for highway, count in sorted(
        highway_counts.items(),
        key=lambda item: item[1],
        reverse=True,
    ):
        print(
            f"  - {highway}: {count}"
        )

    # -----------------------------------------------------------------------
    # Dataset
    # -----------------------------------------------------------------------

    dataset = {
        "metadata": {
            "total_roads": len(roads),

            "drivable_roads": drivable_count,

            "non_drivable_roads": non_drivable_count,

            "total_buildings": len(buildings),

            "highway_counts": highway_counts,

            "source": "map.osm",

            "traffic_data_type": "synthetic",

            "traffic_mapping_key": "osm_way_id",
        },

        "roads": roads,

        "buildings": buildings,
    }

    return dataset


def main():
    # -----------------------------------------------------------------------
    # Project root
    # -----------------------------------------------------------------------

    root_dir = os.path.dirname(
        os.path.dirname(
            os.path.abspath(__file__)
        )
    )

    # -----------------------------------------------------------------------
    # OSM source
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

    # -----------------------------------------------------------------------
    # Generate
    # -----------------------------------------------------------------------

    dataset = extract_spatial_features(
        osm_path
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

    os.makedirs(
        os.path.dirname(out_frontend),
        exist_ok=True,
    )

    os.makedirs(
        os.path.dirname(out_processed),
        exist_ok=True,
    )

    # -----------------------------------------------------------------------
    # Frontend JSON
    # -----------------------------------------------------------------------

    with open(
        out_frontend,
        "w",
        encoding="utf-8",
    ) as file:
        json.dump(
            dataset,
            file,
            ensure_ascii=False,
            separators=(",", ":"),
        )

    # -----------------------------------------------------------------------
    # Processed JSON
    # -----------------------------------------------------------------------

    with open(
        out_processed,
        "w",
        encoding="utf-8",
    ) as file:
        json.dump(
            dataset,
            file,
            ensure_ascii=False,
            indent=2,
        )

    print()
    print(
        "Successfully saved spatial features dataset:"
    )

    print(
        f"  - {out_frontend}"
    )

    print(
        f"  - {out_processed}"
    )


if __name__ == "__main__":
    main()