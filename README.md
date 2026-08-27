# AI Urban Digital Twin + What-If Mobility Simulator

An end-to-end 3D AI Urban Digital Twin and mobility simulation platform designed for land-use scenario planning, traffic impact modeling, and congestion assessment in modern urban environments.

---

## Target Architecture

```
urban-digital-twin/
│
├── frontend/                     # 3D Digital Twin UI (Vite + CesiumJS)
│   ├── src/
│   │   ├── components/           # Map, Development, Simulation, Dashboard, UI
│   │   │   ├── map/              # 3D MapContainer, MapLayers, Renderer, Overlay
│   │   │   ├── development/      # Palette, DevelopmentCards, Modal, List
│   │   │   ├── simulation/       # Simulation Controls & Results
│   │   │   ├── dashboard/        # KPIs, Metrics & Charts
│   │   │   └── ui/               # Header, StatusBanner, DebugPanel, Modals
│   │   ├── pages/                # App pages (DigitalTwinPage)
│   │   ├── hooks/                # Custom React/JS interaction hooks (usePlacement)
│   │   ├── services/             # API clients & Model Adapters
│   │   ├── state/                # Central ScenarioState & DevelopmentStore
│   │   ├── utils/                # Geo Math, Buildability Engine & Zone Resolvers
│   │   ├── types/                # Canonical Shared Development Model
│   │   └── data/                 # GeoJSON & Spatial datasets
│   ├── public/
│   ├── package.json
│   └── vite.config.js
│
├── backend/                      # Python REST API Server (FastAPI)
│   ├── api/
│   │   ├── routes/               # city, map, developments, scenarios, traffic, trip_demand
│   │   ├── services/             # Simulator service bridges
│   │   ├── schemas/              # Pydantic data schemas
│   │   └── controllers/
│   ├── main.py                   # Server entry point
│   ├── requirements.txt
│   └── README.md
│
├── models/                       # Computational AI & Mobility Models
│   ├── traffic-model/            # 4-stage What-If Simulator & Network Assignment Engine
│   ├── trip-demand-model/       # Trip Generation Engine & Baseline XGBoost Regressor
│   └── README.md
│
├── data/                         # Central Data Store
│   ├── osm/                      # Raw & processed OpenStreetMap files
│   ├── city/                     # City boundary & GIS layers
│   ├── processed/                # Road networks & spatial features
│   └── scenarios/                # Preserved scenario definitions
│
├── docs/                         # Documentation
│   ├── architecture/             # Architecture overview & diagrams
│   ├── api/                      # OpenAPI specs
│   └── models/                   # Mobility pipeline documentation
│
├── scripts/                      # Project automation scripts
├── .gitignore
└── README.md
```

---

## Development Placement Architecture

```
User selects land-use card (Residential, Hospital, Mall, School, Office, Hotel, Mixed-Use)
       │
       ▼
Placement Mode Active (usePlacement hook controller)
       │
       ▼
Move pointer across 3D Map (Cesium pickPosition + terrain raycasting)
       │  * Temporary preview entities excluded during raycast to avoid height snapping
       ▼
Buildability Engine (src/utils/buildabilityEngine.js)
       │  * Validates real footprint dimensions & setback buffers against road corridors & existing structures
       ▼
Click valid location on 3D map → Open Properties Modal (src/types/development.js)
       │  * User configures height, floors, capacity, GLA, residents, employees
       ▼
DevelopmentStore & ScenarioState updated (src/state/devStore.js)
       │
       ▼
3D Entity Renderer (src/components/map/DevelopmentRenderer.js)
       │  * Creates persistent selectable 3D building volume using user properties
       ▼
Run What-If Simulation (POST /api/simulate bridge)
       │
       ▼
Python 4-Stage Mobility Simulator (models/traffic-model/src/simulator.py)
       │  * Stage 1: Trip Generation → Stage 2: Routing → Stage 3: Aggregation → Stage 4: Impact (V/C & LOS)
       ▼
UI Dashboard & Metric Cards Updated
```

---

## How Components Communicate

1. **Frontend UI & State**: `DevelopmentStore` and `scenarioState` form the single source of truth. Any CRUD action (add, edit, move, delete) automatically triggers updates in the `DevelopmentRenderer` and sidebar list.
2. **Placement & Buildability**: `usePlacement` handles pointer drag and click interactions. `geoUtils` calculates exact 3D geographic coordinates (`pickGeographicLocation`), and `buildabilityEngine` tests real-world footprint geometry against road centerlines and existing structures.
3. **Backend API Bridge**: The frontend posts simulation requests via `services/api/simulationApi.js`. The Vite dev server proxies `/api/simulate` directly to `models/traffic-model/scripts/run_simulation_cli.py`, or routes to the standalone FastAPI server in `backend/main.py`.

---

## Getting Started

### 1. Frontend Setup & 3D Viewer

```bash
# Navigate to frontend directory
cd frontend

# Install dependencies
npm install

# Set your Cesium Ion access token in frontend/.env
# VITE_CESIUM_ION_TOKEN=your_cesium_token_here

# Run dev server
npm run dev
```

The frontend web application will start at `http://localhost:3000`.

### 2. Python Backend API Server

```bash
# Install backend requirements
pip install -r backend/requirements.txt

# Run FastAPI backend server
python -m backend.main
```

The REST API server will run at `http://localhost:8000`. API documentation is available at `http://localhost:8000/docs`.

### 3. Running Model Tests

```bash
# Run unit tests for traffic model and trip demand model
python -m pytest models/traffic-model/tests
python -m pytest models/trip-demand-model/tests
```
