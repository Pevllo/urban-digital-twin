# AI Urban Digital Twin + What-If Simulator

An end-to-end urban mobility and real-estate impact simulator combining land-use trip generation, Dijkstra network assignment, machine-learning traffic prediction, and 3D GIS visualization.

---

## 3D Visualization — Step 2

### Architecture & Tech Stack
- **Framework**: Vite + Vanilla JavaScript (`frontend/`)
- **3D Engine**: CesiumJS (`cesium`)
- **Building Streaming**: Cesium ion 3D OSM Buildings (`createOsmBuildingsAsync()`)
- **Terrain**: Cesium World Terrain (`Terrain.fromWorldTerrain()`)

### Environment Setup
The Cesium ion access token is loaded from environment variables and must NOT be hardcoded or committed to git.

1. Create `frontend/.env` (or copy from `frontend/.env.example`):
   ```env
   VITE_CESIUM_ION_TOKEN=your_cesium_ion_token_here
   ```
2. Verify `.env` is ignored in `.gitignore`.

---

## 3D Visualization — Step 3: Geographic Zone Integration

### Architecture & Click Flow
```
User Clicks Location in Cesium 3D View
        │
        ▼
Cesium Intersector (ScreenSpaceEventHandler pickPosition / pickEllipsoid)
        │
        ▼
WGS84 Coordinates (Latitude °N, Longitude °E)
        │
        ▼
Haversine Zone Resolver (src/geo/zoneResolver.js)
        │
        ▼
Existing Zone ID (e.g., Z0008) & Centroid Distance (km)
```

---

## 3D Visualization — Physical Development & Collision Engine

### Physical 3D Building Masses & Real-World Footprints
Proposed developments are rendered as real-world physical 3D procedural volumes in CesiumJS clamped to terrain elevation:
- **Residential Compound**: $90\text{ m} \times 90\text{ m} \times 18\text{ m}$ mass (multi-family compound).
- **Hospital**: $85\text{ m} \times 65\text{ m} \times 24\text{ m}$ mass (multi-story medical facility).
- **Mall**: $140\text{ m} \times 110\text{ m} \times 15\text{ m}$ mass (expansive commercial center).
- **School**: $95\text{ m} \times 70\text{ m} \times 12\text{ m}$ mass (educational campus).
- **Office Building**: $55\text{ m} \times 55\text{ m} \times 45\text{ m}$ mass (corporate tower).

### Real-Time Footprint Collision Validation
- **Candidate Area (`GREEN`)**: Valid non-colliding location (`✓ Candidate placement area`).
- **Blocked Area (`RED`)**: Rejects placement if footprint overlaps existing OSM roads (500 polylines), OSM building footprints (983 polygons), or previously placed proposed developments.
- **Data Disclaimer**: *"Candidate placement area" represents spatial non-collision against available OSM road network and building datasets. It is NOT equivalent to legal, cadastral, ownership, or urban planning approval.*





---

## Backend Mobility Pipeline Status
- **Stage 1 (Trip Generation)**: Complete (`trip-demand-model/src/trip_generation.py`)
- **Stage 2 (Traffic Assignment)**: Complete (`traffic-model/src/traffic_assignment.py`)
- **Stage 3B (Traffic Aggregation)**: Complete (`traffic-model/src/traffic_aggregator.py`)
- **Stage 4 (Impact Assessment)**: Complete (`traffic-model/src/impact_assessment.py`)
- **Unified Simulator Runner**: Complete (`traffic-model/src/simulator.py`)
