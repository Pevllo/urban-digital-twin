# AI Urban Digital Twin + What-If Mobility Simulator

An end-to-end 3D AI Urban Digital Twin and multi-domain simulation platform designed for land-use scenario planning, traffic impact assessment, urban utilities modeling (power, water, waste), and environmental footprint evaluation in modern urban environments.

---

## 🌟 Key Features

- **3D CesiumJS Command Center**: High-performance 3D visualization centered around the New Administrative Capital (R3 District) with OSM buildings, boundaries, and high-resolution imagery.
- **Dynamic Basemap Switcher**: Seamless toggling between High-Resolution Satellite imagery and Google Roadmap without reloading map layers or resetting camera context.
- **Dynamic Traffic & Mobility Visualization**: Real-time coloring of road networks based on baseline Volume-to-Capacity (V/C) ratios and What-If scenario impact classifications (Healthy, Moderate, Worsened, High, Critical).
- **Procedural 3D Development Placement & Editing**: Interactive placement of realistic 3D architectural complexes (Residential Compounds, Hospitals, Schools, Malls, Offices, Mixed-Use) with collision detection, setback validation, and in-place configuration editing.
- **Comprehensive Full Report View**: Contained, responsive dashboard with executive summary, traffic assignment parameters, critical corridor bottlenecks, and multi-utility resource models (Electricity kWh, Water m³/hr, Solid Waste kg, CO₂ footprint).
- **Building What-If Report History & Versioning**: Completed simulations are persistently linked to buildings, retaining historical configuration snapshots and automatically identifying `CURRENT` vs `OUTDATED` scenarios.
- **Persistent SQLite Store**: Backend persistence for proposed developments and scenario parameters.

---

## 🏗️ Architecture Overview

```
urban-digital-twin/
│
├── frontend/                     # 3D Digital Twin UI (Vite + React + CesiumJS)
│   ├── src/
│   │   ├── api/                  # API client, developments, scenarios, utilities
│   │   ├── components/           # UI Components
│   │   │   ├── common/           # Error messages, panels, modals
│   │   │   ├── development/      # Palette, forms, details, report history, delete modal
│   │   │   ├── layout/           # AppShell, TopBar, Navigation, WorkflowPanel
│   │   │   ├── map/              # Cesium viewer, 3D layouts, layers, inspector, basemap
│   │   │   ├── pages/            # Command Center, Infrastructure, Data Layers, Full Report
│   │   │   ├── results/          # Summary cards, traffic details, impact overview
│   │   │   └── simulation/       # What-If engine controls and progress
│   │   ├── services/             # Development, simulation, report & basemap services
│   │   ├── store/                # Central AppContext (reducer & state store)
│   │   ├── tests/                # Frontend test suites (traffic, placement, delete, reports)
│   │   └── utils/                # Geo math, traffic colors, formatters
│   ├── package.json
│   └── vite.config.js
│
├── backend/                      # Python REST API Server (FastAPI + SQLite)
│   ├── api/
│   │   ├── routes/               # developments, scenarios, traffic, city, map, water, waste
│   │   ├── services/             # Simulator bridges & ML inference adapters
│   │   └── schemas/              # Pydantic validation schemas
│   ├── storage/                  # SQLite development & report store
│   └── main.py                   # Server entry point & routing
│
├── models/                       # Computational AI & Mobility Models
│   ├── traffic-model/            # 4-stage What-If Simulator & Network Assignment Engine
│   └── trip-demand-model/        # Trip Generation Engine & Baseline XGBoost Regressors
│
├── tests/                        # Backend API contract test suite
├── .gitignore
└── README.md
```

---

## 🔄 What-If Simulation & Workflow

```
1. SELECT OR PLACE BUILDING
   ├── Select coordinates on 3D map
   ├── Configure type (Residential, Healthcare, Commercial, etc.)
   └── Save development to persistent database
   ↓
2. RUN WHAT-IF SIMULATION
   ├── Multi-domain simulation engine executes (Traffic, Power, Water, Waste, CO₂)
   ├── Road network updates dynamically with scenario impact colors
   └── Full Report is generated and attached to the building
   ↓
3. ACCESS COMPLETED WHAT-IF REPORTS
   ├── View Latest Report directly from Building Details
   └── Access historical reports list with full original snapshots
   ↓
4. EDIT DEVELOPMENT & RE-SIMULATION
   ├── Edit parameters in-place (Floors, Beds, Units, GFA)
   ├── Previous reports are safely retained and flagged as OUTDATED
   ├── Roads reset to baseline until the updated scenario is executed
   └── New simulation generates a new CURRENT report
```

---

## 🚦 Traffic Color Legend

| Status / Severity | V/C Ratio / Change | Color Hex | Visual Meaning |
|:---|:---|:---|:---|
| **Optimal / Healthy** | $V/C < 0.60$ | `#10b981` (Green) | Free-flow traffic; minimal impact |
| **Moderate** | $0.60 \le V/C < 0.80$ | `#eab308` (Yellow) | Moderate volume; stable flow |
| **Worsened / High** | $0.80 \le V/C < 1.00$ | `#f97316` (Orange) | Significant delay; LOS deteriorated |
| **Critical** | $V/C \ge 1.00$ | `#b91c1c` (Dark Red) | At or above capacity; severe bottleneck |

---

## 🚀 Getting Started

### 1. Prerequisites
- **Node.js**: v18+
- **Python**: v3.10+
- **Cesium Ion Token**: Set in `frontend/.env`

### 2. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```
The frontend UI will start at `http://localhost:5173`.

### 3. Backend Setup
```bash
# From repository root
pip install -r backend/requirements.txt
python -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```
API Documentation is available at `http://127.0.0.1:8000/docs`.

---

## 🧪 Testing & Validation

### Run Frontend Tests
```bash
cd frontend
npm run lint
npm run build
node src/tests/buildingReports.test.js
node src/tests/trafficMapping.test.js
node src/tests/spatialPlacement.test.js
node src/tests/deleteDevelopment.test.js
```

### Run Backend Contract Tests
```bash
python -m pytest tests/
```
