#!/usr/bin/env python3
"""
Generate Spatial Features Dataset — AI Urban Digital Twin

Parses raw OpenStreetMap XML data (models/traffic-model/data/raw/osm/map.osm)
and extracts all drivable road network polylines with highway classifications
and building footprint geometries.

Outputs to:
- frontend/src/data/spatialFeatures.json
- data/processed/spatialFeatures.json
"""

import os
import json
import xml.etree.ElementTree as ET
from math import hypot

# Drivable road highway tags
DRIVABLE_HIGHWAYS = {
    'motorway', 'motorway_link',
    'trunk', 'trunk_link',
    'primary', 'primary_link',
    'secondary', 'secondary_link',
    'tertiary', 'tertiary_link',
    'residential', 'service',
    'unclassified', 'living_street',
    'construction'
}

def extract_spatial_features(osm_path):
    if not os.path.exists(osm_path):
        raise FileNotFoundError(f"OSM file not found: {osm_path}")

    print(f"Parsing OSM dataset from {osm_path}...")
    tree = ET.parse(osm_path)
    root = tree.getroot()

    nodes = {}
    for node in root.findall('node'):
        node_id = node.attrib['id']
        lat = float(node.attrib['lat'])
        lon = float(node.attrib['lon'])
        nodes[node_id] = (lat, lon)

    roads = []
    buildings = []

    highway_counts = {}

    for way in root.findall('way'):
        way_id = way.attrib.get('id')
        tags = {t.attrib['k']: t.attrib['v'] for t in way.findall('tag')}
        hw = tags.get('highway')
        bldg = tags.get('building')

        nd_refs = [nd.attrib['ref'] for nd in way.findall('nd')]
        coords = [[nodes[ref][0], nodes[ref][1]] for ref in nd_refs if ref in nodes]

        if hw in DRIVABLE_HIGHWAYS and len(coords) >= 2:
            highway_counts[hw] = highway_counts.get(hw, 0) + 1
            roads.append({
                'id': f"way_{way_id}",
                'highway': hw,
                'name': tags.get('name', ''),
                'coordinates': coords
            })
        elif bldg and bldg != 'no' and len(coords) >= 3:
            lats = [c[0] for c in coords]
            lons = [c[1] for c in coords]
            c_lat = sum(lats) / len(lats)
            c_lon = sum(lons) / len(lons)
            radius = max(hypot(lat - c_lat, lon - c_lon) * 111000 for lat, lon in coords)
            buildings.append({
                'id': f"bldg_{way_id}",
                'building': bldg,
                'name': tags.get('name', ''),
                'centroid': [c_lat, c_lon],
                'radius': max(8.0, min(60.0, radius)),
                'coordinates': coords
            })

    print(f"Extracted {len(roads)} drivable roads and {len(buildings)} buildings.")
    print("Highway Breakdown:")
    for hw, count in sorted(highway_counts.items(), key=lambda x: x[1], reverse=True):
        print(f"  - {hw}: {count}")

    dataset = {
        'metadata': {
            'total_roads': len(roads),
            'total_buildings': len(buildings),
            'highway_counts': highway_counts,
            'source': 'map.osm'
        },
        'roads': roads,
        'buildings': buildings
    }

    return dataset

def main():
    root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    osm_path = os.path.join(root_dir, 'models', 'traffic-model', 'data', 'raw', 'osm', 'map.osm')
    
    dataset = extract_spatial_features(osm_path)

    out_frontend = os.path.join(root_dir, 'frontend', 'src', 'data', 'spatialFeatures.json')
    out_processed = os.path.join(root_dir, 'data', 'processed', 'spatialFeatures.json')

    os.makedirs(os.path.dirname(out_frontend), exist_ok=True)
    os.makedirs(os.path.dirname(out_processed), exist_ok=True)

    with open(out_frontend, 'w', encoding='utf-8') as f:
        json.dump(dataset, f, separators=(',', ':'))

    with open(out_processed, 'w', encoding='utf-8') as f:
        json.dump(dataset, f, indent=2)

    print(f"Successfully saved spatial features dataset to:\n  - {out_frontend}\n  - {out_processed}")

if __name__ == '__main__':
    main()
