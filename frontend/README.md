# 3D Visualization Layer — Frontend

Vite + CesiumJS 3D city viewer for the AI Urban Digital Twin + What-If Simulator.

---

## Step 3 — Geographic Zone Integration

### Flow Architecture
```
Cesium 3D Click (Pick Position / Ellipsoid)
       │
       ▼
WGS84 Coordinates (Latitude, Longitude in degrees)
       │
       ▼
Haversine Distance Zone Resolver (frontend/src/geo/zoneResolver.js)
       │
       ▼
Existing Zone ID (e.g. Z0008 from zone_osm_mapping_v2.csv) + Centroid Distance (km)
       │
       ▼
UI Overlay Selected Location Card
```

### Current Implementation & Limitations
- **Dataset Source**: Centroid mapping from `trip-demand-model/data/raw/zone_osm_mapping_v2.csv` (150 zones).
- **Resolution Algorithm**: Minimum Haversine distance between picked coordinates and zone centroids.
---

## Physical 3D Proposed Development Placement Pipeline (`src/main.js` & `src/devStore.js`)

### Hold & Drag Interaction Workflow
1. **HOLD**: Press pointer down on any land-use card (`residential_compound`, `hospital`, `mall`, `school`, `office`).
2. **DRAG**: Physical 3D procedural extruded building volume ($W \times L \times H$ in meters) and ground footprint base follow the cursor position over the 3D city terrain in real-time.
3. **RELEASE**: Drops a temporary 3D building preview entity at picked 3D coordinates `(latitude, longitude, height)`, resolves nearest zone (e.g. `Zone Z0090`), and opens properties configuration modal.
4. **CONFIRM**: Saves properties object (`num_residents`, `num_beds`, `staff_count`, `gross_leasable_area_sqm`, `num_students`, `num_employees`) to `devStore.js`, replacing the preview with the permanent physical 3D proposed building entity.
5. **CANCEL / ESC**: Immediately removes the preview entity from the Cesium viewer, leaving zero orphan entities or store records.

### Single Source of Truth & Entity Mapping
- **Authoritative Store**: `devStore.js` maintains scenario developments.
- **1-to-1 Mapping**: `development_id` (`DEV-001`) maps directly to its unique Cesium 3D building entity.
- **Move / Edit**: Updating location or properties mutates the exact same entity and record without creating duplicate IDs.
- **Delete**: Deleting `DEV-002` removes ONLY `DEV-002` from `devStore` and `cesiumViewer`, preserving all other scenario developments.



## Step 4 — Development Placement & Properties Manager

### Flow Architecture
```
Development Selection (Toolbox: Residential, Hospital, Mall, School, Office)
       │
       ▼
Pointer / Placement Preview Mode (Live Lat, Lon & Zone Resolution)
       │
       ▼
Geographic Drop Position & 3D Cesium Marker Entity
       │
       ▼
Properties Form Modal (Type-Specific Validation)
       │
       ▼
Local Scenario Development Record (DEV-001, DEV-002...)
       │
       ▼
Full CRUD Lifecycle (Inspect, Edit Properties, Move Location, Delete)
```

---

## Step 5 — Mobility Simulator Integration (`src/simulationService.js`)

### End-to-End Flow Architecture
```
Placed 3D Development Scenario (DEV-001, DEV-002...)
       │
       ▼
User Clicks [ ⚡ Run What-If Simulation ]
       │
       ▼
Scenario Adapter (frontend/src/simulationService.js)
       │  Converts frontend scenario payload to backend DevelopmentInput
       ▼
POST /api/simulate Bridge (Vite Plugin & traffic-model/scripts/run_simulation_cli.py)
       │
       ▼
Backend Unified Entry Point: simulate_what_if_scenario(dev_input, hour)
       │  Executes Stage 1 (Trip Gen) → Stage 2 (AON Assign) → Stage 3B (XGBoost) → Stage 4 (Impact)
       ▼
Real What-If Result (WhatIfSimulationResult)
       │
       ▼
UI What-If Impact Card + Full Road-Level Records State Persistence
```

### Key Highlights
- **Authentic Execution**: Zero fake data or mock responses. All returned metrics originate from the real XGBoost + Dijkstra Python backend.
- **Single-Development Mode**: Currently runs simulation for the explicitly selected development scenario (`DEV-001`). Step 6 will introduce API endpoints and multi-scenario aggregations.
- **Full State Preservation**: Road-level impact records (`road_assessments`) are preserved in `window.lastSimulationResult` for downstream 3D road highlighting and visualization.


---

## Commands


```bash
# Start Vite development server
npm run dev

# Build production bundle
npm run build
```
