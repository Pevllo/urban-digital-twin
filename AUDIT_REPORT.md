# AI URBAN DIGITAL TWIN + WHAT-IF SIMULATOR — COMPREHENSIVE AUDIT REPORT

**Repository:** https://github.com/Pevllo/urban-digital-twin
**Branches audited:** `main` (current), `ui-rebuild`
**Date:** 2026-09-01

---

## 1. PROJECT STRUCTURE

### Top-Level Directory (both branches)

```
urban-digital-twin-ui/
├── backend/
│   ├── main.py
│   ├── requirements.txt
│   └── api/
│       ├── routes/
│       │   ├── city.py
│       │   ├── developments.py
│       │   ├── map.py
│       │   ├── scenarios.py
│       │   ├── traffic.py
│       │   └── trip_demand.py
│       ├── schemas/
│       │   └── development_schema.py
│       └── services/
│           ├── simulator_service.py
│           └── electricity_service.py
├── data/
│   └── processed/
│       └── spatialFeatures.json         (3.15 MB)
├── docs/
│   └── architecture/
├── frontend/
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   ├── public/
│   └── src/
│       ├── [BRANCH-SPECIFIC — see below]
│       └── data/
│           └── spatialFeatures.json     (1.23 MB)
├── models/
│   ├── README.md
│   ├── electricity-model/
│   │   ├── models/step5/
│   │   │   └── electricity_new_building_model_final.joblib
│   │   └── src/
│   │       ├── egypt_config.py
│   │       ├── feature_engineering.py
│   │       ├── predict_egypt.py
│   │       └── predict_new_building.py
│   ├── traffic-model/
│   │   ├── config/impact_thresholds.json
│   │   ├── data/raw/osm/map.osm         (11.3 MB)
│   │   ├── data/processed/
│   │   │   ├── synthetic_traffic.csv    (795 MB, gitignored)
│   │   │   ├── synthetic_traffic.gpkg   (1.46 GB, gitignored)
│   │   │   ├── osm_roads.gpkg           (3.17 MB)
│   │   │   └── osm_inspection_report.csv
│   │   ├── models/traffic_xgb_model.joblib
│   │   ├── notebooks/ (4)
│   │   ├── reports/ (multiple)
│   │   ├── scripts/
│   │   │   ├── run_simulation_cli.py
│   │   │   └── diagnose_network_connectivity.py
│   │   ├── src/ (16 .py files)
│   │   └── tests/ (9 test files)
│   └── trip-demand-model/
│       ├── config/ (2 JSON files)
│       ├── data/raw/zone_osm_mapping_v2.csv
│       ├── data/processed/ (feature_metadata JSONs)
│       ├── data/experiments/ (results, tuning)
│       ├── models/preprocessing_metadata.json
│       ├── notebooks/ (2)
│       ├── reports/ (multiple)
│       ├── src/ (10 .py files)
│       └── tests/ (1 test file)
├── scripts/
│   └── generate_spatial_dataset.py
├── .env.example
├── .gitignore
└── README.md
```

### Component Classification

| Category | Location | Description |
|---|---|---|
| **Production Backend** | `backend/` | FastAPI API server |
| **Production Frontend** | `frontend/src/` | React app (ui-rebuild) or Vanilla JS (main) |
| **ML Training** | `models/*/src/train.py`, `train_models.py`, notebooks/ | Training pipelines |
| **ML Inference** | `models/*/src/predict*.py`, `src/simulator.py` | Inference entry points |
| **Orchestration** | `backend/api/services/simulator_service.py` | Wires models to API |
| **Spatial Data** | `data/processed/spatialFeatures.json` | OSM buildings + roads |
| **Dataset Generation** | `scripts/generate_spatial_dataset.py` | Parses map.osm → JSON |
| **Traffic Data** | `models/traffic-model/data/processed/synthetic_traffic.csv` | 4.76M row synthetic dataset |

---

## 2. MODEL INVENTORY

### 2A. Traffic Model

| Item | Detail |
|---|---|
| **Directory** | `models/traffic-model/` |
| **Main inference** | `models/traffic-model/src/simulator.py` → `simulate_what_if_scenario()` |
| **Entry point for API** | `backend/api/services/simulator_service.py` → `run_simulation()` |
| **Input** | `DevelopmentInput` dataclass (dev_type, zone_id, properties, name, dev_id) + `hour: int` |
| **Output** | `WhatIfSimulationResult` dataclass with 4 stages: stage1_od_demand, stage2_assignment, stage3_scenario_traffic, stage4_impact_assessment |
| **Artifact** | `models/traffic-model/models/traffic_xgb_model.joblib` — sklearn Pipeline with XGBRegressor + ColumnTransformer |
| **Preprocessing** | 27 features: 26 numeric + 1 categorical (road_type). Built via `ColumnTransformer` inside joblib. Features include: road_length_m, lane_count, speed_limit_kmh, is_oneway, is_bridge, is_tunnel, road_hierarchy, hour_sin/cos, dow_sin/cos, month_sin/cos, lag features, rolling means, etc. |
| **Dependencies** | pandas, numpy, geopandas, networkx, shapely, scikit-learn, xgboost, joblib |
| **Backend service** | `simulator_service.py` — YES, connected |
| **API endpoint** | `POST /api/v1/scenarios/simulate` |
| **Frontend calls** | NO — frontend never calls `POST /api/v1/scenarios/simulate` |
| **What-If pipeline** | YES — core of the 4-stage pipeline |
| **Works independently** | YES — `simulate_what_if_scenario(dev_input, hour)` is self-contained |

### 2B. Trip Demand Model

| Item | Detail |
|---|---|
| **Directory** | `models/trip-demand-model/` |
| **Main inference** | `models/trip-demand-model/src/trip_generation.py` → `calculate_development_od()` |
| **Input** | `DevelopmentInput` dataclass + hour, gamma, min_dist_km |
| **Output** | `ODDemandMatrix` (hour, development_type, origin_zone, total_trips, od_matrix) |
| **Artifact** | `models/trip-demand-model/models/preprocessing_metadata.json` (metadata only). The actual XGBoost model files are **gitignored** and must be regenerated. |
| **Preprocessing** | Gravity model: T_ij(h) = P_i(h) × [A_j × d_ij^(-γ)] / Σ_k [A_k × d_ik^(-γ)]. Uses zone_osm_mapping_v2.csv (150 zones), trip_generation_rates.json, hourly_profiles.json |
| **Dependencies** | pandas, numpy, json, math |
| **Backend service** | YES — imported by `simulator_service.py` and used in Stage 1 of `simulate_what_if_scenario()` |
| **API endpoint** | Called indirectly via `POST /api/v1/scenarios/simulate` |
| **Frontend calls** | NO — same as traffic |
| **What-If pipeline** | YES — Stage 1 (trip generation + gravity distribution) |
| **Works independently** | YES — `calculate_development_od()` is self-contained |

**NOTE:** The trip demand model's own XGBoost model (for traffic volume prediction at trip level) is gitignored. The traffic-model's XGB model is used instead for the pipeline. The trip-demand-model's `train_models.py` trains a separate model for trip production estimation.

### 2C. Electricity Model

| Item | Detail |
|---|---|
| **Directory** | `models/electricity-model/` |
| **Main inference** | `models/electricity-model/src/predict_egypt.py` → `predict_egypt()` |
| **Secondary inference** | `predict_egypt_mixed_use()`, `predict_egypt_annual()` |
| **Input** | building_type (str), floor_area (float, m²), latitude/longitude (float, optional), hour (int), calibration (str, default "CAL-3"), weather (dict, optional) |
| **Output** | `{"electricity_kwh": float, "predicted_kwh": float, "calibration": str, "uncertainty": {"lower_kwh", "upper_kwh", "std_kwh"}, "building_type": str, "floor_area_sqm": float, "city": str, "timestamp": str}` |
| **Artifact** | `models/electricity-model/models/step5/electricity_new_building_model_final.joblib` — scikit-learn Linear Regression pipeline with ColumnTransformer |
| **Preprocessing** | `add_engineered_features_step5()`: log_sqm, hour_sin/cos, dow_sin/cos, month_sin/cos, cooling_degree, heating_degree, temperature_squared, sqm_x_cooling. Weather resolved from `egypt_config.py` climate data for Cairo/NAC. |
| **Dependencies** | joblib, numpy, pandas |
| **Backend service** | `electricity_service.py` — YES, connected |
| **API endpoint** | Called indirectly via `POST /api/v1/scenarios/simulate` as stage5_electricity |
| **Frontend calls** | NO — never triggered from UI |
| **What-If pipeline** | YES — Stage 5 (appended after traffic simulation) |
| **Works independently** | YES — `predict_egypt()` is self-contained |

### 2D. Water Model

**DOES NOT EXIST.** No directory, no files, no code references anywhere in the repository.

### 2E. Waste Model

**DOES NOT EXIST.** No directory, no files, no code references anywhere in the repository.

---

## 3. BRANCH COMPARISON

`ui-rebuild` is **strictly ahead** of `main` (7 commits ahead, 0 behind).

### Commits on `ui-rebuild` NOT on `main` (oldest first):

```
d71df57 feat(frontend): integrate Cesium map component with Vite React UI
12c1ccd Add NAC spatial dataset
1f12fca Render NAC buildings and roads in Cesium
8daf22f Add road selection and inspector
ade623d feat(traffic): integrate traffic baseline API with Cesium map visualization and object selection
857f986 fix(ui): resolve indentation and syntax errors in CesiumMap and App.jsx
3a694f2 Checkpoint working UI
```

### Commits on `main` NOT on `ui-rebuild`: **(none)**

### Diff Summary (60 files changed, 36,719 insertions, 7,767 deletions)

| Component | main | ui-rebuild | Recommended | Reason |
|---|---|---|---|---|
| **Frontend framework** | Vanilla JS (App.js) | React 19 (App.jsx) | **ui-rebuild** | Complete rewrite with modern framework |
| **Frontend entry** | main.js → App.js | main.jsx → App.jsx | **ui-rebuild** | React architecture |
| **Frontend package.json** | cesium + vite-plugin-cesium only | + react, react-dom, lucide-react, eslint | **ui-rebuild** | Modern dependencies |
| **CesiumMap** | Split across MapContainer.js, MapLayers.js, DevelopmentRenderer.js, BuildabilityOverlay.js | Single CesiumMap.jsx (719 lines) | **ui-rebuild** | Simpler architecture, though main had more features |
| **Placement system** | hooks/usePlacement.js (588 lines) — full drag+drop, multi-dev, collision detection | Simple click-to-place in App.jsx | **main** has more features | ui-rebuild lost buildability validation, multi-dev, modal editing |
| **Development store** | state/devStore.js — Map-based, subscriber pattern, CRUD | React useState in App.jsx | **main** has more features | ui-rebuild has no persistence, no multi-dev support |
| **Buildability engine** | utils/buildabilityEngine.js (431 lines) | DELETED | **main** has it | Collision detection lost in ui-rebuild |
| **Development types** | types/development.js — 7 types with propertyFields, defaultDimensions, procedural sizing | Hardcoded in App.jsx | **main** has better design | ui-rebuild has simpler but less structured type system |
| **Physical development** | utils/physicalDevelopment.js — collision validation, haversine, suitability stats | DELETED | **main** has it | Spatial collision engine lost |
| **Geo utils** | utils/geoUtils.js — haversine, coordinate transforms | DELETED | **main** has it | Utility functions lost |
| **Scenario state** | state/scenarioState.js — full state machine with resultsByDevId | React useState | **main** has more features | Multi-result tracking lost |
| **Simulation API** | services/api/simulationApi.js + client.js — env-configured, error parsing | Raw fetch() with hardcoded URL | **main** is better designed | ui-rebuild has no API abstraction layer |
| **SimulationResults** | components/simulation/SimulationResults.js (293 lines) | DELETED | **main** has it | Full results rendering lost |
| **Sim results in UI** | Dedicated panel with 4-stage results, traffic, electricity display | None | **main** has it | No simulation results shown |
| **backend/api/routes/traffic.py** | Stub (7 lines) — `{"status": "ok"}` | Full implementation (448 lines) — loads CSV, parses segments, aggregates | **ui-rebuild** | Critical feature — traffic data actually works |
| **backend/api/routes/scenarios.py** | Identical on both | Identical on both | Same | |
| **backend/api/routes/developments.py** | Identical on both | Identical on both | Same | |
| **backend/api/services/simulator_service.py** | Identical on both | Identical on both | Same | |
| **backend/api/services/electricity_service.py** | Identical on both | Identical on both | Same | |
| **vite.config.js** | Custom `pythonSimulatorPlugin()` — spawns Python subprocess for `/api/simulate` | Simple React+Cesium plugin | **main** (for simulation), **ui-rebuild** (for cleanliness) | main routes sim through Vite middleware; ui-rebuild routes through FastAPI |
| **index.html** | Full HTML with all DOM elements for vanilla JS | Minimal React shell | Different architectures | |
| **data/processed/spatialFeatures.json** | Committed | Updated (+31k lines) | **ui-rebuild** | Updated dataset |
| **scripts/generate_spatial_dataset.py** | Base version | Major rewrite (+477 lines) | **ui-rebuild** | Improved generation |

### Key Observations

1. **ui-rebuild is strictly ahead** — main has zero unique commits
2. **Backend is nearly identical** — only `traffic.py` was rewritten on ui-rebuild (from stub to full implementation)
3. **Frontend is a complete rewrite** — Vanilla JS → React 19, but with significant feature regression
4. **Main has MORE features** in the frontend (buildability, multi-dev, collision detection, results rendering) but a **non-functional backend traffic endpoint**
5. **ui-rebuild has a WORKING traffic endpoint** but a **feature-regressed frontend**

---

## 4. BACKEND API AUDIT

| Endpoint | Method | Path | Purpose | Model/Service | Frontend Consumer | Status |
|---|---|---|---|---|---|---|
| `get_city_info` | GET | `/api/v1/city/info` | City metadata | None (hardcoded) | NOT consumed | Functional (hardcoded) |
| `get_map_config` | GET | `/api/v1/map/config` | Map center/zoom | None (hardcoded) | NOT consumed | Functional (hardcoded) |
| `list_developments` | GET | `/api/v1/developments` | List all developments | In-memory dict | NOT consumed | Functional (in-memory) |
| `create_development` | POST | `/api/v1/developments` | Store development | In-memory dict | **YES** (ui-rebuild App.jsx) | Functional — NO simulation triggered |
| `delete_development` | DELETE | `/api/v1/developments/{dev_id}` | Delete development | In-memory dict | NOT consumed | Functional — frontend never calls |
| `simulate_scenario` | POST | `/api/v1/scenarios/simulate` | Run 5-stage simulation | simulator_service.py → traffic + trip-demand + electricity | NOT consumed (ui-rebuild) / YES (main via Vite plugin) | Functional — orphaned on ui-rebuild |
| `get_baseline_traffic` | GET | `/api/v1/traffic/baseline?osm_way_id=X` | Single road traffic | synthetic_traffic.csv | **YES** (ui-rebuild App.jsx) | Functional on ui-rebuild; stub on main |
| `get_all_baseline_traffic` | GET | `/api/v1/traffic/baseline/all` | All roads traffic | synthetic_traffic.csv | **YES** (ui-rebuild CesiumMap.jsx) | Functional on ui-rebuild; stub on main |
| `get_trip_generation_rates` | GET | `/api/v1/trip-demand/rates` | Trip gen rates | None (hardcoded) | NOT consumed | Functional (hardcoded) |
| `health_check` | GET | `/health` | Health check | None | NOT consumed | Functional |

### Critical Gap

**The frontend (ui-rebuild) creates developments via `POST /developments` but NEVER triggers simulation via `POST /scenarios/simulate`.** The simulation endpoint exists and is fully functional, but the frontend never calls it.

---

## 5. WHAT-IF SIMULATION PIPELINE

### Complete Flow (ui-rebuild branch)

```
Step 1: User clicks "Add Development"
  → File: App.jsx, toggleDevelopmentMode()
  → State: developmentMode = true

Step 2: User clicks empty map location
  → File: CesiumMap.jsx, ScreenSpaceEventHandler LEFT_CLICK
  → Callback: onMapLocationSelect({latitude, longitude})
  → State: developmentLocation = {latitude, longitude}

Step 3: User fills form (type, name, floors, GFA, etc.)
  → File: App.jsx, developmentForm state
  → No API call yet

Step 4: User clicks "Create Development"
  → File: App.jsx, handleCreateDevelopment()
  → API: POST http://127.0.0.1:8000/api/v1/developments
  → Backend: developments.py → stores in _in_memory_developments
  → Response: DevelopmentSchema JSON
  → State: proposedDevelopment = {...createdDevelopment, floors, lat/lon}
  → alert("Development created successfully.")

Step 5: CesiumMap renders proposed development
  → File: CesiumMap.jsx, useEffect([proposedDevelopment])
  → Creates entity: id="proposed-{development_id}"
  → Type: Box with dimensions from GFA/floors
  → Camera flies to entity

Step 6: User clicks proposed development on map
  → File: CesiumMap.jsx, LEFT_CLICK handler
  → Detects entity.properties.type === "proposed-development"
  → Callback: onDevelopmentSelect(developmentId)
  → File: App.jsx: setSelectedDevelopment(proposedDevelopment)

Step 7: Inspector shows development details
  → File: App.jsx, selectedDevelopment branch in render
  → Shows: ID, type, floors, GFA, lat, lon
  → "Delete Development" button shown

Step 8: ⚠️ SIMULATION IS NEVER TRIGGERED ⚠️
  → The frontend has NO "Run Simulation" button for the proposed development
  → POST /api/v1/scenarios/simulate is NEVER called from ui-rebuild
  → The full 5-stage pipeline (trip demand → traffic assignment → impact → electricity) is NEVER executed from the UI

Step 9: User clicks "Delete Development"
  → File: App.jsx, handleDeleteDevelopment()
  → ONLY clears React state: setSelectedDevelopment(null), setProposedDevelopment(null)
  → Does NOT call DELETE /api/v1/developments/{dev_id}
  → Does NOT remove Cesium entity (though clearing proposedDevelopment triggers the removal effect)
  → Does NOT clear backend in-memory store
```

### What SHOULD happen (but doesn't):

```
After Step 5 (or Step 6), user should be able to:
  → Run Simulation
  → Frontend calls POST /api/v1/scenarios/simulate
  → Backend runs simulator_service.run_simulation()
  → Returns: traffic impact, trip demand, electricity prediction
  → Frontend displays results in a panel
  → Map visualization updates with impact data
```

---

## 6. MODEL ORCHESTRATION

### `backend/api/services/simulator_service.py`

The orchestration layer calls:
1. `trip_generation.calculate_development_od()` — Stage 1: Trip generation + gravity distribution
2. `simulator.simulate_what_if_scenario()` — Stages 1-4 (includes traffic assignment, baseline aggregation, impact assessment)
3. `electricity_service.run_electricity_prediction()` — Stage 5: Electricity prediction

| Model | Status | Connection Path |
|---|---|---|
| **Traffic** | **CONNECTED** | `simulator_service.py` → `simulate_what_if_scenario()` → Stages 2-4 |
| **Trip Demand** | **CONNECTED** | `simulator_service.py` → `trip_generation.calculate_development_od()` → Stage 1 |
| **Electricity** | **CONNECTED** | `simulator_service.py` → `run_electricity_prediction()` → Stage 5 |
| **Water** | **NOT CONNECTED** | Model does not exist |
| **Waste** | **NOT CONNECTED** | Model does not exist |

The orchestration architecture **supports adding new models cleanly** — a new model can be added as another service call in `run_simulation()` and appended to the result dict. The `SimulationRequestSchema` already accepts arbitrary properties.

---

## 7. FRONTEND AUDIT (ui-rebuild)

### State Variables

| State | Defined in | Updated by | Used by | Purpose |
|---|---|---|---|---|
| `selectedBuilding` | App.jsx | onBuildingSelect, onDevelopmentSelect, toggleDevelopmentMode, onRoadSelect, onMapLocationSelect | Inspector panel | Currently selected OSM building |
| `selectedRoad` | App.jsx | onRoadSelect, onBuildingSelect, toggleDevelopmentMode, onMapLocationSelect | Inspector panel, traffic useEffect | Currently selected OSM road |
| `roadTraffic` | App.jsx | fetch to /traffic/baseline | Inspector panel | Traffic data for selected road |
| `developmentMode` | App.jsx | toggleDevelopmentMode, Add Dev button, Cancel button | CesiumMap (controls click behavior), form visibility | Whether user is in placement mode |
| `developmentLocation` | App.jsx | onMapLocationSelect | Form, create payload | Where the user clicked to place |
| `proposedDevelopment` | App.jsx | handleCreateDevelopment response | CesiumMap (renders box), inspector, onDevelopmentSelect | The created development record |
| `selectedDevelopment` | App.jsx | onDevelopmentSelect, handleDeleteDevelopment | Inspector panel (shows dev details) | Currently selected development |
| `developmentForm` | App.jsx | updateDevelopmentForm, handleDevelopmentTypeChange | handleCreateDevelopment payload | Form field values |

### API Client

**No centralized API client exists on ui-rebuild.** All API calls are raw `fetch()` with hardcoded `http://127.0.0.1:8000` URLs:
- `CesiumMap.jsx`: `GET /api/v1/traffic/baseline/all` (on mount)
- `App.jsx`: `GET /api/v1/traffic/baseline?osm_way_id=X` (on road select)
- `App.jsx`: `POST /api/v1/developments` (create dev)

The main branch has a proper API client at `services/api/client.js` with env-configurable base URL and error parsing. This was **deleted** in ui-rebuild.

---

## 8. CESIUM MAP AUDIT (ui-rebuild)

### Rendering

- **Buildings**: Extruded polygons from `spatialFeatures.json`. Height = `max(8, min(40, radius * 1.2))`. Color: `#64748b` alpha 0.85.
- **Roads**: Polylines from `spatialFeatures.json`. Width/Color by highway class. Traffic overlay when loaded.
- **Proposed Development**: Box entity with dimensions from GFA/floors. Color: `#38bdf8` alpha 0.35.

### Selection Logic

All selection via `ScreenSpaceEventHandler.LEFT_CLICK` → `scene.pick()`:

1. **Proposed development** (first priority): Detects `entity.properties.type === "proposed-development"` → calls `developmentSelectRef.current(developmentId)`
2. **Nothing picked + developmentMode**: Uses `camera.getPickRay()` → `globe.pick()` → calls `mapLocationSelectRef.current({latitude, longitude})`
3. **Building**: Detects `type === "building"` → calls `buildingSelectRef.current(building)`
4. **Road**: Detects `type === "road"` → calls `roadSelectRef.current({...road, traffic, osm_way_id})`

### Potential Issue: Development Selection After Placement

When `proposedDevelopment` changes, the `useEffect([proposedDevelopment])` removes all old `proposed-development` entities and creates a new one with `id = "proposed-${developmentId}"`. Click detection works because the new entity has `type: "proposed-development"` in its properties. **This appears to work correctly** — the entity is recreated on state change, and the click handler checks properties dynamically.

However, there is a subtle issue: `developmentSelectRef` is updated via `useEffect` with dependencies, but the `handler.setInputAction` closure captures the ref value at initialization time. Since it uses `.current`, it always reads the latest callback. **This should work.**

### Traffic Color Thresholds

```javascript
// P50 = 5.56%, P75 = 8.30%, P90 = 11.25%, MAX = 43.30%
if (value < 5.5)  → green  (#22c55e)
if (value < 8.3)  → yellow (#eab308)
if (value < 11.25) → orange (#f97316)
else              → red    (#ef4444)
```

### Road Width Mapping

| Highway | Width (px) |
|---|---|
| motorway/motorway_link | 5 |
| trunk/trunk_link | 4 |
| primary/primary_link | 4 |
| secondary/secondary_link | 3 |
| tertiary/tertiary_link | 2.5 |
| residential | 2 |
| service | 1.5 |
| construction | 2 |

---

## 9. DEVELOPMENT LIFECYCLE

### ui-rebuild Branch

| Phase | What Happens | File/Function | Issue? |
|---|---|---|---|
| **CREATE** | Click map → fill form → POST to backend → set proposedDevelopment | App.jsx `handleCreateDevelopment()` | Works, but creates in backend AND locally |
| **CONFIRM** | No explicit confirmation step — creation IS confirmation | — | Different from main (which had a modal confirm step) |
| **SELECT** | Click entity on map → setSelectedDevelopment | CesiumMap.jsx → App.jsx | Works for single development |
| **INSPECT** | Inspector panel shows development details | App.jsx render | Shows ID, type, floors, GFA, lat, lon |
| **SIMULATE** | ⚠️ NOT IMPLEMENTED | — | No button, no API call |
| **UPDATE** | ⚠️ NOT IMPLEMENTED | — | No editing capability |
| **DELETE** | Click "Delete Development" → clears React state only | App.jsx `handleDeleteDevelopment()` | Does NOT call DELETE API. Backend record persists. |

### ID Tracking

| ID Type | Example | Used Where |
|---|---|---|
| `development_id` | `dev_1725200000000` (timestamp-based) | Frontend payload, backend schema, Cesium entity (`proposed-{id}`) |
| `entityId` | `proposed-dev_1725200000000` | Cesium entity ID |
| Building IDs | `bldg_XXXXX` | spatialFeatures.json |
| Road IDs | `way_XXXXXXXX` | spatialFeatures.json |

**No ID mismatch detected** — the development ID is generated as `dev_${Date.now()}` and used consistently. The Cesium entity is prefixed with `proposed-`.

---

## 10. BUILDING GEOMETRY (ui-rebuild CesiumMap.jsx)

### Current Implementation

```javascript
// CesiumMap.jsx — proposed development rendering
const floors = Math.max(1, Number(proposedDevelopment.floors || 1));
const height = floors * 3.2;  // 3.2m per floor

const grossFloorArea = Math.max(1, Number(
  properties.gross_floor_area_sqm ||
  proposedDevelopment.gross_floor_area_sqm ||
  900  // DEFAULT FALLBACK
));

const footprintArea = grossFloorArea / floors;  // GFA / floors = footprint
const aspectRatio = 1.25;
const footprintWidth = Math.sqrt(footprintArea * aspectRatio);
const footprintDepth = footprintWidth / aspectRatio;

// Box dimensions: [width, depth, height]
box: {
  dimensions: new Cartesian3(footprintWidth, footprintDepth, height),
}
```

### Analysis

The geometry calculation is **physically reasonable**:

- `footprintArea = GFA / floors` — correct if GFA is total floor area across all floors
- `height = floors × 3.2m` — reasonable floor-to-floor height
- `aspectRatio = 1.25` — slight elongation, realistic for most buildings
- Width/depth derived from area and ratio — mathematically correct

**Example**: A 5-story building with GFA = 15,000 m²:

- footprint = 15000/5 = 3000 m²
- width = √(3000 × 1.25) = 61.2 m
- depth = 61.2/1.25 = 49.0 m
- height = 5 × 3.2 = 16 m
- Box: 61m × 49m × 16m — **realistic**

### All Buildings Become Cubes

Yes — all proposed developments render as rectangular boxes (Cesium `box` entity). There is no differentiation by development type (hospital vs mall vs office all get the same box shape). OSM buildings render as extruded polygons (actual footprint shapes).

---

## 11. GFA / FOOTPRINT BUG

### The Problem

When a development is created with GFA=0 (the default), the code falls back to `900` sqm:

```javascript
const grossFloorArea = Math.max(1, Number(
  properties.gross_floor_area_sqm ||
  proposedDevelopment.gross_floor_area_sqm ||
  900,  // DEFAULT FALLBACK
));
```

If the user enters GFA = 0 in the form (the default), then:

- `grossFloorArea = 900`
- `footprintArea = 900 / floors`
- For 1 floor: footprint = 900 m², width = 33.5m, depth = 26.8m — reasonable
- For 6 floors: footprint = 150 m², width = 13.7m, depth = 11.0m — reasonable

**The real issue**: If the user enters a large GFA (e.g., 25000 for a mall) but leaves floors at 1:

- `footprintArea = 25000 / 1 = 25000 m²`
- `width = √(25000 × 1.25) = 176.8 m`
- `depth = 176.8 / 1.25 = 141.4 m`
- **This is a 177m × 141m single-story box — unrealistic for a mall**

### Root Cause

The form defaults `floors` to 1 and `gross_floor_area_sqm` to 0. Users must manually enter both values. There is no validation that ensures floors and GFA are consistent. The `floors * 3.2` height calculation produces a thin flat box when GFA is large but floors is small.

### The Fix

This is a **UX issue, not a code bug**. The form should either:

1. Auto-calculate floors from GFA using type-specific defaults
2. Require both GFA and floors
3. Show a warning when GFA/floors ratio is unrealistic

---

## 12. TRAFFIC SYSTEM

### Data Source

`models/traffic-model/data/processed/synthetic_traffic.csv` — 795 MB, 4,762,800 rows, 28 columns

### Timestamp Handling

```python
df["timestamp"] = pd.to_datetime(df["timestamp"], format="mixed")
```

The `format="mixed"` parameter handles multiple timestamp formats. The CSV contains timestamps like `"2026-01-05 00:00:00"`. The potential `ValueError: unconverted data remains when parsing with format "%Y-%m-%d": " 00:00:00"` mentioned in the audit request would occur if using `format="%Y-%m-%d"` instead. The current `format="mixed"` handles this correctly.

### OSM Way ID Extraction

```python
df["osm_way_id"] = df["road_id"].astype(str).str.extract(r"^osm_(\d+)_")[0]
```

Correctly extracts the original OSM way ID from segmented road IDs (e.g., `osm_90604136_0` → `90604136`).

### Segmentation Handling

- Each OSM way can have multiple segments (e.g., `_0`, `_1`, `_2`)
- `get_baseline_segments()` takes the earliest observation per segment
- Aggregation sums traffic_volume and road_capacity_proxy across segments
- Congestion = sum(traffic_volume) / max(sum(road_capacity_proxy), 1.0)

### Frontend Consumption

- `CesiumMap.jsx` calls `GET /api/v1/traffic/baseline/all` on mount
- Builds a lookup map `{osm_way_id: trafficRecord}`
- Colors roads by congestion percent: green (<5.5%), yellow (<8.3%), orange (<11.25%), red (≥11.25%)
- `App.jsx` calls `GET /api/v1/traffic/baseline?osm_way_id=X` when a road is selected

### API Response Schema

**Single road** (`GET /traffic/baseline?osm_way_id=X`):

```json
{
  "osm_way_id": 90604136,
  "timestamp": "2026-01-05T00:00:00",
  "segment_count": 4,
  "traffic_volume": 1234,
  "road_type": "residential",
  "road_name": "...",
  "road_length_m": 567.8,
  "lane_count": 2,
  "speed_limit_kmh": 50.0,
  "is_oneway": false,
  "is_bridge": false,
  "is_tunnel": false,
  "road_capacity_proxy": 890.1,
  "intersection_density": 0.05,
  "node_degree": 3,
  "connected_road_count": 5,
  "road_hierarchy": "MEDIUM",
  "congestion_ratio": 1.386,
  "congestion_percent": 138.6,
  "data_type": "synthetic"
}
```

**All roads** (`GET /traffic/baseline/all`):

```json
{
  "timestamp": "2026-01-05T00:00:00",
  "data_type": "synthetic",
  "roads": [
    {
      "osm_way_id": 90604136,
      "traffic_volume": 1234,
      "road_capacity_proxy": 890.1,
      "segment_count": 4,
      "congestion_ratio": 1.386,
      "congestion_percent": 138.6
    }
  ]
}
```

---

## 13. DATA AUDIT

| Dataset | Size | Git | Purpose | Production? |
|---|---|---|---|---|
| `data/processed/spatialFeatures.json` | 3.15 MB | Yes | OSM roads + buildings for Cesium | YES — frontend imports |
| `frontend/src/data/spatialFeatures.json` | 1.23 MB | Yes | Frontend copy (minified) | YES — CesiumMap imports |
| `models/traffic-model/data/raw/osm/map.osm` | 11.3 MB | Yes | Source OSM XML | Source data |
| `models/traffic-model/data/processed/synthetic_traffic.csv` | 795 MB | **No** (.gitignored) | Synthetic traffic (4.76M rows) | YES — traffic API loads it |
| `models/traffic-model/data/processed/synthetic_traffic.gpkg` | 1.46 GB | **No** (.gitignored) | Traffic GeoPackage | Not used in production |
| `models/traffic-model/data/processed/osm_roads.gpkg` | 3.17 MB | Yes | Road geometries | Used by traffic model training |
| `models/trip-demand-model/data/raw/zone_osm_mapping_v2.csv` | 18.4 KB | Yes | Zone-to-OSM mapping (150 zones) | YES — gravity model uses it |
| `models/trip-demand-model/data/processed/feature_metadata.json` | 1.93 KB | Yes | ML feature schema | Training metadata |
| `models/trip-demand-model/data/experiments/results.json` | 10.2 KB | Yes | Experiment results | Not production |
| `models/trip-demand-model/models/preprocessing_metadata.json` | Present | Yes | Feature list, params | Training metadata |
| `models/electricity-model/models/step5/electricity_new_building_model_final.joblib` | Present | Yes | Electricity model | YES — inference uses it |
| `models/traffic-model/models/traffic_xgb_model.joblib` | Present | Yes | Traffic XGBoost model | YES — inference uses it |

### spatialFeatures.json Schema

```json
{
  "metadata": {
    "total_roads": 2584,
    "total_buildings": 983,
    "highway_counts": { "service": 1352, "unclassified": 478, ... },
    "source": "map.osm"
  },
  "roads": [
    {
      "id": "way_90604136",
      "highway": "residential",
      "name": "...",
      "coordinates": [[lon, lat], ...]
    }
  ],
  "buildings": [
    {
      "id": "bldg_12345",
      "building": "yes",
      "name": "...",
      "centroid": [lat, lon],
      "radius": 15.2,
      "coordinates": [[lat, lon], ...]
    }
  ]
}
```

---

## 14. FRONTEND ↔ BACKEND CONTRACT

| Feature | Frontend sends | Backend expects | Compatible? | Issue |
|---|---|---|---|---|
| **Create development** | `{development_id, development_type, zone_id, name, latitude, longitude, floors, properties, simulation_hour}` | `DevelopmentSchema` (all fields match) | **YES** | Backend stores, doesn't simulate |
| **Traffic baseline** | `GET /traffic/baseline?osm_way_id={string}` | `osm_way_id: str = Query(...)` | **YES** | Works on ui-rebuild |
| **Traffic all** | `GET /traffic/baseline/all` | No params | **YES** | Works on ui-rebuild |
| **Simulate** | Frontend NEVER sends this | `SimulationRequestSchema` | **N/A** | Endpoint is orphaned |
| **Delete development** | Frontend NEVER sends this | `dev_id: str` path param | **N/A** | Endpoint exists but unused |

### Field Name Mismatches

- Frontend uses `development_type: "residential"` but backend expects types like `residential_compound`, `hospital`, `mall`, `school`, `office`, `hotel`, `mixed_use`
- Frontend form options include `"commercial"` and `"retail"` which are NOT in `SUPPORTED_DEV_TYPES` on main and will fail backend validation
- Backend `DevelopmentSchema` has both `id` and `development_id` with aliasing — works with frontend payload

### Backend DevelopmentSchema

```python
class DevelopmentSchema(BaseModel):
    id: Optional[str] = Field(None, alias="development_id")
    development_id: Optional[str] = None
    type: str = Field(..., alias="development_type")
    development_type: str = ""
    name: str = ""
    latitude: float
    longitude: float
    x: Optional[float] = 0.0
    y: Optional[float] = 0.0
    z: Optional[float] = 0.0
    area: Optional[float] = 0.0
    height: Optional[float] = 0.0
    floors: Optional[int] = 1
    capacity: Optional[float] = 0.0
    residents: Optional[float] = 0.0
    jobs: Optional[float] = 0.0
    parking: Optional[float] = 0.0
    traffic_generation: Optional[float] = 0.0
    status: Optional[str] = "proposed"
    zone_id: str
    properties: Dict[str, Any] = Field(default_factory=dict)
    simulation_hour: Optional[int] = 8
```

### Backend SimulationRequestSchema

```python
class SimulationRequestSchema(BaseModel):
    development_id: str
    development_type: str
    zone_id: str
    name: Optional[str] = ""
    properties: Dict[str, Any] = Field(default_factory=dict)
    simulation_hour: Optional[int] = 8
    latitude: Optional[float] = None
    longitude: Optional[float] = None
```

---

## 15. ERROR HANDLING

### Verified Issues

| Issue | Location | Severity | Status |
|---|---|---|---|
| `handleDeleteDevelopment` not defined | App.jsx | **CRITICAL** | **NOT PRESENT on ui-rebuild** — function exists and is properly defined. This was a main branch bug (duplicate function definitions) that is resolved on ui-rebuild |
| Traffic fetch failure | App.jsx useEffect | Low | Handled with `.catch()` → sets `roadTraffic = null` |
| Development creation failure | App.jsx `handleCreateDevelopment` | Medium | `alert()` on error — no retry, no state cleanup |
| Backend exceptions leaked | scenarios.py line 40 | Medium | `str(e)` exposed to client in 500 response |
| No null checks in inspector | App.jsx render | Low | Optional chaining (`?.`) used throughout |
| Invalid coordinates | CesiumMap.jsx | Low | `Number.isFinite()` check before rendering |
| Missing spatialFeatures.json | CesiumMap.jsx | Critical if missing | No fallback — app crashes if file missing |
| In-memory storage | developments.py | Medium | Data lost on server restart |
| sys.path manipulation | simulator_service.py, electricity_service.py | Medium | Fragile; breaks if directory structure changes |

### Browser Extension Errors

**NOT VERIFIED** — would need runtime testing. The codebase itself does not produce browser-extension-type errors. Known browser errors like `content.js`, `globals-front.js`, `adblock-picreplacement.js` are from browser extensions and should not be treated as project bugs.

---

## 16. CURRENT FUNCTIONALITY MATRIX

| Feature | Backend | Model | Frontend | Working? | Missing Work |
|---|---|---|---|---|---|
| Base map (Cesium) | — | — | CesiumMap.jsx | **YES** | None |
| Existing buildings | — | — | CesiumMap.jsx | **YES** | None |
| Existing roads | — | — | CesiumMap.jsx | **YES** | None |
| Traffic coloring (map) | traffic.py (ui-rebuild) | synthetic_traffic.csv | CesiumMap.jsx | **YES** (ui-rebuild) | None |
| Traffic inspection | traffic.py (ui-rebuild) | — | App.jsx inspector | **YES** (ui-rebuild) | None |
| Building selection | — | — | CesiumMap.jsx → App.jsx | **YES** | None |
| Road selection | — | — | CesiumMap.jsx → App.jsx | **YES** | None |
| Development mode toggle | — | — | App.jsx | **YES** | None |
| Click-to-place | — | — | CesiumMap.jsx → App.jsx | **YES** | None |
| Development form | — | — | App.jsx | **YES** | Validation could improve |
| Development creation (backend) | developments.py | — | App.jsx | **YES** (stores only) | No simulation triggered |
| Development rendering | — | — | CesiumMap.jsx | **YES** | GFA/floors edge cases |
| Development selection | — | — | CesiumMap.jsx → App.jsx | **YES** | Single development only |
| Development inspector | — | — | App.jsx | **YES** | Limited fields shown |
| Development deletion | — | — | App.jsx | **PARTIAL** | Only clears local state; backend record persists |
| Trip demand model | simulator_service.py | trip_generation.py | — | **Backend OK** | Frontend never triggers |
| Traffic impact | simulator_service.py | simulator.py (4 stages) | — | **Backend OK** | Frontend never triggers |
| Electricity model | electricity_service.py | predict_egypt.py | — | **Backend OK** | Frontend never triggers |
| Water model | — | — | — | **MISSING** | Does not exist |
| Waste model | — | — | — | **MISSING** | Does not exist |
| Scenario execution | scenarios.py | simulator_service.py | — | **Backend OK** | Frontend never calls endpoint |
| Scenario results display | — | — | — | **MISSING** | No results panel on ui-rebuild |
| KPI dashboard | — | — | App.jsx | **NO** (static data) | Values are hardcoded |
| Map impact visualization | — | — | — | **MISSING** | No post-simulation map update |
| Multi-development support | — | — | — | **MISSING** (ui-rebuild) | Only one proposed dev at a time |
| Buildability validation | — | — | — | **MISSING** (ui-rebuild) | Lost from main |
| Development editing | — | — | — | **MISSING** | No edit workflow |
| Sidebar collapse | — | — | — | **MISSING** | Buttons exist but no state management |
| Camera reset | — | — | — | **MISSING** | Not in ui-rebuild |
| Keyboard shortcuts (Escape) | — | — | — | **MISSING** | Not in ui-rebuild |
| Layer toggles | — | — | — | **MISSING** | Buttons exist but not wired |

---

## 17. FINAL PROJECT READINESS

| Subsystem | Status | Evidence |
|---|---|---|
| 3D Map (Cesium) | **GREEN** | Buildings, roads, traffic coloring all render correctly |
| Building selection | **GREEN** | Click detection works, inspector shows data |
| Road selection | **GREEN** | Click detection works, traffic data fetched and displayed |
| Traffic data pipeline | **GREEN** (ui-rebuild) | Full implementation: CSV load → segment extraction → aggregation → API |
| Development placement | **GREEN** | Click-to-place, form, entity rendering all work |
| Development creation (UI→Backend) | **GREEN** | POST to /developments stores record |
| Development selection | **GREEN** (single dev) | Click entity → inspector |
| Development deletion (frontend) | **YELLOW** | Only clears local state; backend not cleaned |
| Electricity model | **GREEN** (backend only) | predict_egypt works; electricity_service.py connected |
| Trip demand model | **GREEN** (backend only) | trip_generation works; connected in simulator_service |
| Traffic impact model | **GREEN** (backend only) | 4-stage simulator works; connected in simulator_service |
| Simulation trigger from UI | **RED** | No button, no API call from frontend |
| Simulation results display | **RED** | No results panel exists on ui-rebuild |
| Water model | **RED** | Does not exist |
| Waste model | **RED** | Does not exist |
| KPI dashboard | **RED** | All values hardcoded |
| Map impact visualization | **RED** | No post-simulation map updates |
| Multi-development | **RED** (ui-rebuild) | Single development only |
| Buildability validation | **RED** (ui-rebuild) | Lost from main |
| Development editing | **RED** | No edit workflow |
| API client abstraction | **RED** (ui-rebuild) | Hardcoded URLs, no error handling abstraction |
| Backend persistence | **YELLOW** | In-memory dict; data lost on restart |

### Overall Readiness: ~35%

The application can render a 3D city map, display traffic data, and let users place a single development. However, the core value proposition — the What-If simulation — is completely disconnected from the frontend. The simulation pipeline works in the backend but is unreachable from the UI.

---

## 18. EXACT REMAINING WORK

### P0 — Blocking (App cannot fulfill its core purpose without these)

| # | Task | File | Problem | Solution | Complexity |
|---|---|---|---|---|---|
| 1 | **Wire simulation to frontend** | App.jsx | `POST /scenarios/simulate` is never called | Add "Run Simulation" button after development creation; call the endpoint; store results in state | **MEDIUM** |
| 2 | **Add simulation results panel** | App.jsx (new component or section) | No results display exists on ui-rebuild | Create a results section showing traffic impact, electricity prediction, trip demand (reference main's `SimulationResults.js` for structure) | **HIGH** |
| 3 | **Fix development type mismatch** | App.jsx (form options) | Frontend offers "commercial", "retail" which backend doesn't support as standalone types | Either add "commercial"/"retail" to backend `SUPPORTED_DEV_TYPES` / `DevelopmentSchema`, or map them to existing types (mall, office) | **LOW** |
| 4 | **Connect DELETE to backend** | App.jsx `handleDeleteDevelopment()` | Only clears local state; backend record persists | Add `fetch DELETE /api/v1/developments/{dev_id}` before clearing state | **LOW** |

### P1 — Required for Final Demo

| # | Task | File | Problem | Solution | Complexity |
|---|---|---|---|---|---|
| 5 | **Map impact visualization** | CesiumMap.jsx | No post-simulation visual update | After simulation results arrive, update road colors based on scenario traffic, highlight affected buildings | **HIGH** |
| 6 | **Dynamic KPI dashboard** | App.jsx | All KPIs hardcoded (1,284 buildings, 64% traffic, etc.) | Fetch from API or compute from loaded data; count buildings from spatialFeatures.json; derive traffic from loaded traffic data | **MEDIUM** |
| 7 | **Restore API client abstraction** | New: `services/apiClient.js` | Hardcoded `http://127.0.0.1:8000` in 3 places | Create centralized client with env-configurable base URL, error handling. Reference main's `services/api/client.js` | **LOW** |
| 8 | **Fix development type values** | App.jsx form + DevelopmentSchema | "residential" sent but backend expects "residential_compound" | Either align frontend values with backend, or add type aliasing in backend | **LOW** |
| 9 | **Add simulation hour selector** | App.jsx | `simulation_hour` is hardcoded to 8 | Add hour selection dropdown in the simulation section | **LOW** |

### P2 — Important Polish

| # | Task | File | Problem | Solution | Complexity |
|---|---|---|---|---|---|
| 10 | **Restore multi-development support** | App.jsx, CesiumMap.jsx | Only one proposed development at a time | Support multiple developments with a list/selection UI (reference main's devStore pattern) | **HIGH** |
| 11 | **Restore buildability validation** | New utility or App.jsx | Collision detection lost | Port `utils/buildabilityEngine.js` and `utils/physicalDevelopment.js` from main, integrate into placement flow | **HIGH** |
| 12 | **Add development editing** | App.jsx | No edit workflow | Add edit button in inspector → modal/form to modify properties → update backend | **MEDIUM** |
| 13 | **Layer toggles** | App.jsx | Sidebar buttons exist but don't control anything | Wire toggle state to CesiumMap entity visibility | **MEDIUM** |
| 14 | **Backend persistence** | developments.py | In-memory dict; data lost on restart | Add SQLite/JSON file persistence, or use a proper database | **MEDIUM** |
| 15 | **CORS configuration** | vite.config.js | No proxy for backend calls | Add `server.proxy` for `/api` → `http://127.0.0.1:8000` | **LOW** |

### P3 — Optional Improvements

| # | Task | File | Problem | Solution | Complexity |
|---|---|---|---|---|---|
| 16 | **Water model** | New directory needed | Does not exist | Design + implement water demand prediction model | **VERY HIGH** |
| 17 | **Waste model** | New directory needed | Does not exist | Design + implement waste generation prediction model | **VERY HIGH** |
| 18 | **Camera reset** | App.jsx / CesiumMap.jsx | Not in ui-rebuild | Add menu button → `viewer.camera.flyTo()` to default position | **LOW** |
| 19 | **Keyboard shortcuts** | App.jsx | Not in ui-rebuild | Add Escape to cancel placement, etc. | **LOW** |
| 20 | **Loading states** | App.jsx | No visual feedback during async operations | Add spinners/skeletons during API calls | **MEDIUM** |
| 21 | **Backend error handling** | scenarios.py | Exception details leaked to client | Sanitize error messages in HTTP responses | **LOW** |
| 22 | **__init__.py files** | backend/ | Missing Python package markers | Add `__init__.py` to backend/ and subdirectories | **LOW** |

---

## 19. FINAL INTEGRATION PLAN

**Goal:** Finish the app on `ui-rebuild` while preserving the working ML/DL models from `main` and improvements on `ui-rebuild`.

**Key principle:** The backend services and models are IDENTICAL on both branches. Only `traffic.py` differs (ui-rebuild version is better). The frontend is completely different. **Do NOT merge main into ui-rebuild** — the frontend architectures are incompatible.

### Recommended Order

```
PHASE 1: Backend/API Contract (Low risk, high value)
  Step 1: Add missing __init__.py files to backend/ directories
  Step 2: Align development type names (frontend ↔ backend)
  Step 3: Add simulation hour selector to frontend
  Step 4: Wire DELETE /developments/{id} to frontend

PHASE 2: Simulation Integration (Core value)
  Step 5: Add "Run Simulation" button in App.jsx
  Step 6: Implement API call to POST /scenarios/simulate
  Step 7: Store simulation results in React state
  Step 8: Create simulation results display component

PHASE 3: Visualization (Demo impact)
  Step 9: Add post-simulation road coloring (scenario vs baseline)
  Step 10: Show electricity prediction in inspector/results
  Step 11: Show traffic impact metrics in results panel
  Step 12: Make KPI dashboard dynamic (count buildings, aggregate traffic)

PHASE 4: Polish & Robustness
  Step 13: Restore API client abstraction
  Step 14: Add loading states
  Step 15: Fix edge cases (GFA=0, missing floors, etc.)
  Step 16: Add CORS proxy configuration
  Step 17: Sanitize backend error messages

PHASE 5: Advanced Features (if time permits)
  Step 18: Restore multi-development support
  Step 19: Restore buildability validation
  Step 20: Add development editing
  Step 21: Backend persistence
```

### Risk Assessment

| Risk | Mitigation |
|---|---|
| Breaking CesiumMap while adding simulation integration | CesiumMap is self-contained; changes are mostly in App.jsx |
| Backend model import failures | Models are identical on both branches; `sys.path` injection already works |
| Large traffic CSV (795MB) loading failure | Already handled with lazy loading and caching in `load_traffic_data()` |
| React 19 compatibility issues | Currently working; no external UI libraries to conflict |
| Frontend type mismatch breaking backend validation | Fix in Step 2 before attempting simulation |

---

## 20. EXECUTIVE SUMMARY

### 1. What Is Already Complete

- **3D Cesium map** with buildings and roads from OSM data
- **Traffic data pipeline** (ui-rebuild): Full CSV → segment extraction → aggregation → API → map coloring
- **Traffic inspection**: Click road → fetch and display traffic data
- **Building/road selection** with inspector panel
- **Development placement**: Click-to-place, form, entity rendering
- **Backend simulation pipeline**: 5-stage (trip demand → traffic assignment → baseline/scenario aggregation → impact assessment → electricity) — fully functional but unreachable from UI
- **3 ML models** with trained artifacts: Traffic XGBoost, Trip Demand XGBoost, Electricity Linear Regression
- **Backend API** with all necessary endpoints (developments CRUD, simulation, traffic, city info, map config)

### 2. What Is Actually Missing

- **Frontend-to-simulation connection**: The "Run Simulation" button and API call do not exist on ui-rebuild
- **Simulation results display**: No component to show simulation output
- **Water model**: Does not exist anywhere
- **Waste model**: Does not exist anywhere
- **Dynamic KPIs**: Dashboard values are hardcoded
- **Map impact visualization**: No post-simulation visual update

### 3. What Is Currently Broken

- **Development deletion** only clears frontend state; backend record persists
- **Development type mismatch**: Frontend sends "commercial"/"retail" which backend doesn't recognize as valid types
- **"residential" vs "residential_compound"**: Frontend sends "residential", backend expects "residential_compound"
- **No API client abstraction**: Hardcoded localhost URLs in 3 places

### 4. Best Implementation Per Subsystem

| Subsystem | Best Branch | Reason |
|---|---|---|
| Frontend framework | **ui-rebuild** | React 19, modern architecture |
| Traffic backend | **ui-rebuild** | Full implementation vs stub |
| All other backend | **Either** (identical) | No differences |
| ML models | **Either** (identical) | No differences |
| Buildability/collision | **main** | ui-rebuild deleted it |
| Multi-development | **main** | ui-rebuild supports only one |
| Simulation results UI | **main** | ui-rebuild has none |
| Development store | **main** | ui-rebuild uses simple useState |

### 5. Exact Next 5 Tasks

1. **Align development type names** between frontend form and backend schema (LOW)
2. **Add "Run Simulation" button** and wire `POST /scenarios/simulate` call (MEDIUM)
3. **Create simulation results display** panel in App.jsx (HIGH)
4. **Connect DELETE to backend** in `handleDeleteDevelopment()` (LOW)
5. **Make KPIs dynamic** — count buildings from data, compute traffic stats (MEDIUM)

### 6. Risky Areas

- **CesiumMap.jsx**: Single 719-line component; any change could break map rendering. Test thoroughly.
- **simulator_service.py**: Uses `sys.path` injection — fragile if directory structure changes
- **synthetic_traffic.csv**: 795MB file; loading can be slow; ensure lazy loading and caching work
- **Development type mapping**: Mismatched types could cause silent failures in model predictions (e.g., electricity model maps types to BDG2 categories; "commercial" is not in the mapping)
