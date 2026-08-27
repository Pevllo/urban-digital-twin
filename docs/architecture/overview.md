# System Architecture — AI Urban Digital Twin

## Target Architecture

```
urban-digital-twin/
│
├── frontend/             # 3D Digital Twin Web Application (Vite + Cesium)
│   ├── src/
│   │   ├── components/   # Map, Development, Simulation, Dashboard, UI
│   │   ├── pages/
│   │   ├── hooks/
│   │   ├── services/     # API client & Model adapters
│   │   ├── state/        # Scenario & Development store
│   │   ├── utils/        # Geo & Buildability engine
│   │   ├── types/        # Unified Development Model
│   │   └── data/
│   └── package.json
│
├── backend/              # REST API Server (FastAPI)
│   ├── api/
│   │   ├── routes/       # City, Map, Developments, Scenarios, Traffic, Trip Demand
│   │   ├── services/
│   │   └── schemas/
│   ├── main.py
│   └── requirements.txt
│
├── models/               # Computational Mobility Models
│   ├── traffic-model/    # 4-stage What-If Simulator & Network Assignment Engine
│   └── trip-demand-model/# Stage 1 Trip Generation Engine & Baseline Regressor
│
├── data/                 # Shared Data Store (OSM, Processed, Scenarios)
└── docs/                 # Documentation
```

## Communication Flow

1. **Development Selection**: User selects land-use type (Residential, Hospital, Mall, School, Office, Hotel, Mixed-Use).
2. **Placement & Dragging**: Pointer raycasts against 3D city terrain (`pickGeographicLocation`), temporarily hiding preview entities to prevent height snapping.
3. **Buildability Validation**: `validateBuildability` evaluates real footprint polygon offsets against road corridors and existing building footprints.
4. **Data Synchronization**: Confirmed developments create a canonical `DevelopmentModel` stored in `DevelopmentStore`.
5. **3D Entity Persistence**: `DevelopmentRenderer` creates/updates Cesium 3D volumes synchronized with user-edited properties.
6. **Simulation Execution**: Frontend calls POST `/api/simulate`, invoking the Python 4-stage mobility simulator bridge and displaying impact KPIs ($V/C$, assigned trips, Level of Service).
