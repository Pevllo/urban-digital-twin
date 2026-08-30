# Electricity Integration Gap Report

**Audit Date:** 2026-08-30
**Main Project:** `C:\Users\Pavlly\OneDrive\Desktop\urban-digital-twin`
**Electricity Model:** `C:\Users\Pavlly\OneDrive\Desktop\electricity_model`
**Status:** READ-ONLY AUDIT — No files modified in either project

---

## 1. Executive Summary

**Is the current main project structurally ready for electricity integration?**

**Partially.** The main project has a clean simulation pipeline architecture that can be extended, but the electricity model requires several data fields that the main project does not currently provide in its simulation payload. The most critical gap is **gross floor area (GFA)**, which is only available as an optional property on 2 of 7 development types.

**What is missing:**

| Gap | Severity | Description |
|-----|----------|-------------|
| GFA availability | **CRITICAL** | `gross_floor_area_sqm` exists only for `office` and `mixed_use`. All other types lack it. |
| Coordinates in payload | **CRITICAL** | `latitude`/`longitude` are NOT sent in `SimulationRequestSchema` — only `zone_id` is sent. |
| Timestamp granularity | **MODERATE** | Main project has `simulation_hour` (int 0-23) but no date/month. Electricity model needs month for weather. |
| Mixed-use components | **MODERATE** | Main project stores `mixed_use` as a single type with no component breakdown. |
| Weather infrastructure | **LOW** | Main project has no weather system. Electricity model handles this internally. |
| Result schema extension | **MODERATE** | No electricity results section exists in the current simulation response. |

---

## 2. Current Main Project Architecture

### Frontend (React + CesiumJS)

```
frontend/src/
├── types/development.js          — Canonical dev type definitions (7 types)
├── state/devStore.js             — In-memory CRUD store (Map-based)
├── state/scenarioState.js        — UI state (selection, simulation flags)
├── hooks/usePlacement.js         — Click/drag placement controller
├── utils/buildabilityEngine.js   — Spatial validation
├── utils/geoUtils.js             — Coordinate conversions (WGS84 ↔ ENU)
├── utils/zoneResolver.js         — Haversine nearest-zone lookup
├── services/api/client.js        — HTTP fetch wrapper
├── services/api/simulationApi.js — POST /api/simulate client
├── services/models/devModelAdapter.js — Serializes dev → API payload
├── components/simulation/SimulationResults.js — Renders results
└── App.js                        — Orchestrator
```

### Backend (FastAPI)

```
backend/
├── main.py                        — FastAPI app, 6 routers under /api/v1
├── api/schemas/development_schema.py — Pydantic schemas
├── api/routes/scenarios.py        — POST /api/v1/scenarios/simulate
├── api/routes/developments.py     — CRUD (in-memory)
├── api/services/simulator_service.py — Bridge to traffic model
└── requirements.txt               — fastapi, uvicorn, pydantic, pandas, numpy, sklearn, xgboost
```

### Models

```
models/
├── traffic-model/src/
│   ├── simulator.py               — Unified 4-stage pipeline entry point
│   ├── trip_generation.py         — Stage 1: Trip generation + OD demand
│   ├── traffic_assignment.py      — Stage 2: AON Dijkstra assignment
│   ├── traffic_aggregator.py      — Stage 3B: XGBoost baseline + scenario
│   ├── impact_assessment.py       — Stage 4: LOS + impact scoring
│   ├── predict.py                 — XGBoost model loading
│   └── config.py                  — Central configuration
├── trip-demand-model/src/
│   ├── trip_generation.py         — DevelopmentInput dataclass + OD calculation
│   └── config/                    — Trip rates, hourly profiles
```

### Data Flow

```
Frontend (devStore → devModelAdapter → simulationApi)
    ↓ POST /api/simulate
Backend (scenarios.py → simulator_service.py)
    ↓ sys.path injection → DevelopmentInput
Traffic Model (simulator.py: 4 stages)
    ↓ WhatIfSimulationResult.to_dict()
Backend → Frontend (scenarioState → SimulationResults.js)
```

---

## 3. Canonical Development Schema

### Frontend (`types/development.js` — `createDevelopmentModel()`)

```javascript
{
  id: string,                    // "DEV-001"
  development_id: string,        // same as id
  type: string,                  // "office"
  development_type: string,      // same as type
  name: string,                  // "Proposed Office Complex DEV-001"
  latitude: number,              // WGS84 float
  longitude: number,             // WGS84 float
  terrainHeight: number,         // meters (default 0)
  height: number,                // computed from type-specific formula
  x: number, y: number, z: number, // ENU coords (default 0)
  area: number,                  // width × length (footprint area)
  footprint: { width, length },  // computed from scale formula
  floors: number,                // computed: height / floor_height
  buildingHeight: number,        // same as height
  orientation: number,           // degrees (default 0)
  capacity: number,              // derived from primary property
  residents: number,             // from properties.num_residents
  jobs: number,                  // from properties.num_employees or staff_count
  parking: number,               // area / 100
  trafficGeneration: number,     // 0
  status: string,                // "proposed"
  zone_id: string,               // resolved zone or "unresolved"
  properties: object,            // raw user-provided fields
  simulation_hour: number,       // default 8
  created_at: string,            // ISO timestamp
}
```

### Backend Pydantic Schema (`development_schema.py`)

```python
class DevelopmentSchema(BaseModel):
    development_id: Optional[str]
    development_type: str           # alias: type
    name: str
    latitude: float
    longitude: float
    area: Optional[float]           # footprint area
    height: Optional[float]
    floors: Optional[int]
    capacity: Optional[float]
    residents: Optional[float]
    jobs: Optional[float]
    zone_id: str
    properties: Dict[str, Any]
    simulation_hour: Optional[int]  # default 8
```

### Backend Simulation Payload (`SimulationRequestSchema`)

```python
class SimulationRequestSchema(BaseModel):
    development_id: str
    development_type: str
    zone_id: str
    name: Optional[str] = ""
    properties: Dict[str, Any]      # type-specific fields
    simulation_hour: Optional[int] = 8
```

**Critical observation:** The simulation payload does NOT include `latitude`, `longitude`, `area`, `height`, `floors`, or any spatial/geometric fields. Only `development_type`, `zone_id`, `name`, `properties`, and `simulation_hour` are sent.

---

## 4. Electricity Model Schema

### Input (`predict_egypt()`)

```python
predict_egypt(
    building_type: str | None,        # BDG2 type OR
    development_type: str | None,     # Digital Twin type (auto-mapped)
    floor_area: float,                # REQUIRED — gross floor area in m²
    city: str | None,                 # Egyptian city (auto-resolved from lat/lon)
    latitude: float | None,           # WGS84 latitude
    longitude: float | None,          # WGS84 longitude
    month: int | None,                # 1-12 (derived from timestamp)
    hour: int | None,                 # 0-23 (derived from timestamp)
    timestamp: str | None,            # ISO timestamp
    weather: dict | None,             # optional override
    calibration: str,                 # "CAL-3" default
    floors: int | None,               # informational only
    occupants: int | None,            # informational only
    return_components: bool,          # include calibration breakdown
)
```

### Output

```python
{
    "electricity_kwh": float,         # predicted hourly demand
    "predicted_kwh": float,           # alias
    "building_type": str,             # resolved BDG2 type
    "floor_area_sqm": float,          # input echo
    "city": str,                      # resolved city
    "latitude": float,
    "longitude": float,
    "timestamp": str,
    "month": int,
    "hour": int,
    "calibration": str,
    "calibration_factor": float,
    "raw_kwh": float,                 # before calibration
    "weather": dict,
    "uncertainty": {
        "lower_kwh": float,
        "upper_kwh": float,
        "std_kwh": 88.47,
    },
    "metadata": { ... }
}
```

### Annual Output (`predict_egypt_annual()`)

```python
{
    "annual_kwh": float,
    "average_hourly_kwh": float,
    "peak_kwh": float,
    "peak_timestamp": str,
    "monthly_kwh": [float × 12],
    "eui_kwh_m2": float,
}
```

### Required Inputs (Minimum)

| Field | Type | Required | Source in Main Project |
|-------|------|----------|----------------------|
| `floor_area` | float | **YES** | `properties.gross_floor_area_sqm` (office, mixed_use only) OR `area` (footprint) |
| `development_type` | str | **YES** | `development_type` from payload |
| `latitude` | float | **YES** | `latitude` from dev model (NOT in payload) |
| `longitude` | float | **YES** | `longitude` from dev model (NOT in payload) |
| `timestamp` | str | Recommended | Construct from `simulation_hour` + assumed date |
| `month` | int | Recommended | Not available — must assume or add |

---

## 5. Field Mapping

| Electricity Model Field | Main Project Field | Status | Notes |
|------------------------|-------------------|--------|-------|
| `development_type` | `development_type` | **DIRECT** | Same string values |
| `building_type` | — | DERIVED | Auto-mapped from `development_type` via `DEVELOPMENT_TYPE_TO_BDG2` |
| `floor_area` (m²) | `properties.gross_floor_area_sqm` | **PARTIAL** | Only available for `office` and `mixed_use` |
| `floor_area` (m²) | `area` (footprint) | **WRONG SEMANTICS** | `area` is footprint (width × length), NOT gross floor area |
| `latitude` | `latitude` | **AVAILABLE but NOT in payload** | Exists on dev model but not sent to backend |
| `longitude` | `longitude` | **AVAILABLE but NOT in payload** | Exists on dev model but not sent to backend |
| `timestamp` | `simulation_hour` | **PARTIAL** | Only hour (0-23), no date/month |
| `month` | — | **MISSING** | Must be assumed or added to payload |
| `floors` | `floors` | **AVAILABLE but NOT in payload** | Computed in frontend, not sent |
| `occupants` / `num_employees` | `properties.num_employees` | **AVAILABLE** | Only for office type |
| `weather` | — | NOT NEEDED | Electricity model generates internally from city/month |
| `city` | — | **DERIVABLE** | Resolved from lat/lon via nearest-city lookup |
| `calibration` | — | NOT NEEDED | Use default "CAL-3" |

---

## 6. Missing Fields

### CRITICAL

1. **`gross_floor_area_sqm` not universally available**

   | Type | Has GFA? | Primary Property |
   |------|----------|-----------------|
   | `office` | YES | `gross_floor_area_sqm` (optional field) |
   | `mixed_use` | YES | `gross_floor_area_sqm` (required field) |
   | `residential_compound` | **NO** | `num_residents`, `num_units` |
   | `hospital` | **NO** | `num_beds`, `staff_count` |
   | `mall` | **NO** | `gross_leasable_area_sqm` (GLA, NOT GFA) |
   | `school` | **NO** | `num_students`, `staff_count` |
   | `hotel` | **NO** | `num_rooms`, `staff_count` |

   **Impact:** The electricity model REQUIRES `floor_area` (GFA). Without it, prediction is impossible for 5 of 7 types.

2. **`latitude`/`longitude` not in simulation payload**

   The `SimulationRequestSchema` only sends `zone_id`, not coordinates. The electricity model needs coordinates to resolve the nearest Egyptian city for weather generation.

   **Impact:** The electricity model would always default to Cairo unless coordinates are provided.

### REQUIRED (can be derived)

3. **`month` not available**

   The main project only provides `simulation_hour` (0-23). The electricity model needs `month` (1-12) to select appropriate climate data.

   **Mitigation:** Either add a `simulation_date` field, or assume a default month (e.g., 7 = July for peak demand).

### OPTIONAL

4. **`floors` available but not in payload** — informational only, not used by model
5. **`occupants`/`num_employees` available** — informational only, not used by model

### NOT NEEDED

6. **`weather`** — electricity model generates internally from city/month
7. **`city`** — resolved from lat/lon by electricity model

---

## 7. Development Type Mapping

| Main Project `development_type` | Electricity `building_type` (BDG2) | Confidence | Rationale |
|--------------------------------|-----------------------------------|------------|-----------|
| `school` | Education | **High** | Direct functional match |
| `office` | Office | **High** | Direct functional match |
| `hospital` | Healthcare | **High** | Direct functional match |
| `hotel` | Lodging/residential | **High** | Hotels are transient residential |
| `mall` | Entertainment/public assembly | **Medium** | Malls are public assembly/commercial. BDG2 type covers entertainment and public assembly — malls fit here |
| `residential_compound` | Lodging/residential | **Medium** | Permanent residential vs BDG2's transient "lodging" — same sector (residential) but different usage pattern |
| `mixed_use` | **REQUIRES DECOMPOSITION** | **N/A** | Cannot map to single type. Must split into components. |

**Already implemented in electricity model:** `DEVELOPMENT_TYPE_TO_BDG2` mapping in `egypt_config.py`.

---

## 8. Floor Area Analysis

### Current State

The main project computes `area = width × length` (footprint area) in `createDevelopmentModel()`. This is the building's ground footprint, NOT gross floor area.

For `office` and `mixed_use`, `gross_floor_area_sqm` is an optional user-provided property. For all other types, it does not exist.

### GFA Derivation Possibilities

| Type | Available Data | GFA Derivation | Assumption Required |
|------|---------------|----------------|-------------------|
| `office` | `gross_floor_area_sqm` (optional) | Direct if provided | None |
| `mixed_use` | `gross_floor_area_sqm` (required) | Direct | None |
| `residential_compound` | `num_residents`, `num_units`, `floors`, `area` (footprint) | `area × floors` | Assumes full-floor-plate multi-story |
| `hospital` | `num_beds`, `floors`, `area` (footprint) | `area × floors` | Assumes full-floor-plate multi-story |
| `mall` | `gross_leasable_area_sqm`, `floors` | GLA × 1.15-1.30 (efficiency ratio) | Industry standard: GLA/GFA ≈ 0.75-0.85 |
| `school` | `num_students`, `floors`, `area` (footprint) | `area × floors` | Assumes full-floor-plate |
| `hotel` | `num_rooms`, `floors`, `area` (footprint) | `area × floors` | Assumes full-floor-plate |

### Recommended Minimum Change

**Option A (Minimal):** Add `gross_floor_area_sqm` as an optional field to ALL development types in `SUPPORTED_DEV_TYPES.propertyFields`. Users who don't provide it get a default derived from `area × floors`.

**Option B (Automatic):** For types without explicit GFA, derive it as `area × floors` where `area` is the footprint and `floors` is computed from height. Document the assumption clearly.

**Option C (Per-type defaults):** Use type-specific multipliers based on the default dimensions. E.g., for hospital: `GFA ≈ footprint_area × floors × 0.85` (accounting for setbacks/courtyards).

### Recommendation

**Option A + B combined:**
1. Add `gross_floor_area_sqm` as optional field for all types
2. If not provided, derive as `area × floors` (footprint × floors)
3. Document this derivation clearly
4. For `mall`, use `gross_leasable_area_sqm × 1.2` as fallback

---

## 9. Mixed-Use Strategy

### Current State

The main project represents `mixed_use` as a single development type with:
- `gross_floor_area_sqm` (required) — total area
- `num_residents` (optional) — residential component

There is NO component-level decomposition. The frontend stores it as one unified development.

### Electricity Model Requirement

The electricity model's `predict_egypt_mixed_use()` expects:
```python
components_list = [
    {"building_type": "Office", "gross_floor_area_sqm": 12000},
    {"building_type": "Lodging/residential", "gross_floor_area_sqm": 10000},
]
```

### Gap

The main project cannot currently supply component-level breakdown for mixed-use.

### Recommended Strategy

**Phase 1 (Immediate):** For mixed-use, use a default split assumption:
- 40% Office, 30% Residential, 30% Commercial (based on typical Egyptian mixed-use)
- Apply to the total `gross_floor_area_sqm`
- Document as "default mixed-use decomposition"

**Phase 2 (Future):** Add optional `components` array to `mixed_use` properties:
```javascript
{
  gross_floor_area_sqm: 30000,
  components: [
    { type: "office", area: 12000 },
    { type: "residential_compound", area: 10000 },
    { type: "mall", area: 8000 },
  ]
}
```

---

## 10. Location Strategy

### Current State

- Frontend stores `latitude` and `longitude` on every development (WGS84 decimal degrees)
- Frontend resolves `zone_id` via Haversine nearest-lookup against 150 zones
- Backend receives `zone_id` but NOT coordinates
- The `DevelopmentSchema` Pydantic model has `latitude` and `longitude` fields, but `SimulationRequestSchema` does not include them

### Electricity Model Need

The electricity model needs `latitude` and `longitude` to:
1. Resolve the nearest Egyptian city (Cairo, Alexandria, Luxor, Aswan)
2. Select appropriate climate data for weather generation
3. Apply location-specific calibration

### Recommended Change

**Backend:** Extend `SimulationRequestSchema` to include `latitude` and `longitude`:

```python
class SimulationRequestSchema(BaseModel):
    development_id: str
    development_type: str
    zone_id: str
    name: Optional[str] = ""
    properties: Dict[str, Any] = Field(default_factory=dict)
    simulation_hour: Optional[int] = 8
    latitude: Optional[float] = None      # NEW
    longitude: Optional[float] = None     # NEW
```

**Frontend:** Update `devModelAdapter.js` to include coordinates in the payload:

```javascript
return {
    development_id: devId,
    development_type: devType,
    zone_id: zone_id,
    name: name || devId,
    properties: properties || {},
    simulation_hour: Number(simulationHour || devRecord.simulation_hour || 8),
    latitude: devRecord.latitude,      // NEW
    longitude: devRecord.longitude,    // NEW
};
```

---

## 11. Time Strategy

### Current State

- Frontend has `simulation_hour` (integer 0-23) per development
- No date, month, or day-of-week is stored or transmitted
- The `simulation_hour` defaults to 8 (8 AM)

### Electricity Model Need

The electricity model needs:
- `hour` (0-23) — available from `simulation_hour`
- `month` (1-12) — **NOT available**
- `timestamp` (ISO string) — can be constructed from hour + assumed date

### Recommended Change

**Option A (Minimal):** Assume a default month. For peak-demand estimation, use month=7 (July). Document this assumption.

**Option B (Better):** Add `simulation_date` (ISO date string) to the development model:
```javascript
simulation_date: raw.simulation_date || "2026-07-15"  // default: mid-July
```

**Option C (Best):** Add both `simulation_date` and derive `month`/`day_of_week` from it.

### Recommendation

**Option A for initial integration.** The electricity model already defaults to month=7, hour=14 if not provided. This gives a reasonable peak-summer estimate. Document that the electricity prediction represents "worst-case summer" unless a specific date is provided.

---

## 12. Weather Strategy

### Current State

The main project has NO weather infrastructure. No temperature, humidity, wind, or climate data.

### Electricity Model Capability

The electricity model handles weather internally:
1. Takes `city` name or `latitude`/`longitude`
2. Resolves to nearest Egyptian city
3. Generates weather from real NASA POWER / WeatherSpark monthly averages
4. Applies diurnal temperature variation
5. Supports optional `weather` dict override

### Recommendation

**No weather changes needed in the main project.** The electricity backend service should resolve weather internally from coordinates. If the main project later acquires real-time weather data, it can pass it as an optional override.

---

## 13. API Integration Recommendation

### Option A: Integrate into `/api/v1/scenarios/simulate`

Add electricity as an additional stage in the existing 4-stage pipeline.

**Pros:**
- Single API call from frontend
- Results appear alongside traffic results
- Follows existing pattern

**Cons:**
- Increases simulation latency
- Tightly couples electricity to traffic pipeline
- Harder to call electricity independently

### Option B: Create `/api/v1/electricity/predict`

Separate endpoint for electricity predictions.

**Pros:**
- Independent invocation
- Can be called without full simulation
- Cleaner separation of concerns
- Easier to test and debug

**Cons:**
- Requires separate frontend call
- Results displayed separately

### Option C: Both — extend simulate + add standalone endpoint

**Pros:**
- Best of both worlds
- Electricity available in simulation AND independently
- Backward compatible

**Cons:**
- More code to maintain

### Recommendation

**Option C (Both).**

1. **Extend `/api/v1/scenarios/simulate`** to include electricity results in the response when a development has the required fields. This is the primary integration path.

2. **Add `/api/v1/electricity/predict`** as a standalone endpoint for on-demand predictions without running the full traffic simulation.

This follows the existing architecture: the simulation endpoint runs all stages, while individual stages can also be called independently (as the traffic model already allows).

---

## 14. Backend Changes Required

**DO NOT modify these now. Document for future implementation.**

| File | Change | Reason |
|------|--------|--------|
| `backend/api/schemas/development_schema.py` | Add `latitude`, `longitude` to `SimulationRequestSchema` | Electricity needs coordinates |
| `backend/api/schemas/development_schema.py` | Add `ElectricityResultSchema` | Type-safe electricity results |
| `backend/api/routes/scenarios.py` | Call electricity prediction after traffic stages | Include electricity in simulation |
| `backend/api/routes/scenarios.py` | Add `/api/v1/electricity/predict` endpoint | Standalone electricity API |
| `backend/api/services/simulator_service.py` | Add electricity prediction call | Bridge to electricity model |
| `backend/requirements.txt` | Add `joblib>=1.3` | Required by electricity model |
| `backend/main.py` | Register electricity router | New endpoint |

### New Service: `backend/api/services/electricity_service.py`

```python
# Conceptual — NOT implemented now
def run_electricity_prediction(
    dev_type: str,
    latitude: float,
    longitude: float,
    properties: dict,
    simulation_hour: int = 8,
) -> dict:
    # Resolve GFA from properties
    # Call predict_egypt()
    # Return structured result
```

### New Router: `backend/api/routes/electricity.py`

```python
# Conceptual — NOT implemented now
@router.post("/predict")
def predict_electricity(payload: ElectricityRequestSchema):
    result = run_electricity_prediction(...)
    return result
```

---

## 15. Frontend Changes Required

**DO NOT modify these now. Document for future implementation.**

| File | Change | Reason |
|------|--------|--------|
| `src/services/models/devModelAdapter.js` | Add `latitude`, `longitude` to payload | Send coordinates to backend |
| `src/services/api/simulationApi.js` | No change needed | Already generic |
| `src/components/simulation/SimulationResults.js` | Add electricity results section | Display kWh, annual, peak |
| `src/types/development.js` | Add `gross_floor_area_sqm` to all types | Ensure GFA availability |
| `src/state/scenarioState.js` | No change needed | Results stored generically |

### Electricity Results Display (Conceptual)

Add to `SimulationResults.js` after traffic metrics:

```
┌─────────────────────────────────────────┐
│ ⚡ ELECTRICITY DEMAND                    │
│                                         │
│ Hourly Demand:     420.5 kWh            │
│ Annual Estimate:   2,485,000 kWh/year   │
│ Peak Demand:       610.0 kWh            │
│ EUI:               71.0 kWh/m²/year     │
│ Uncertainty:       332 - 509 kWh        │
└─────────────────────────────────────────┘
```

---

## 16. Model Packaging

### What Needs to Move

The main project does NOT need the full electricity model repository. Only these artifacts:

| Artifact | Path | Size | Purpose |
|----------|------|------|---------|
| Trained model | `models/step5/electricity_new_building_model_final.joblib` | ~small | Linear Regression pipeline |
| Prediction API | `src/predict_egypt.py` | ~800 lines | All prediction functions |
| BDG2 inference | `src/predict_new_building.py` | ~200 lines | Base model loading + inference |
| Feature engineering | `src/train_step5.py` (function only) | ~40 lines | `add_engineered_features_step5()` |
| Egypt config | `src/egypt_config.py` | ~340 lines | Climate data, calibration factors, mappings |
| Egypt calibration | `src/egypt_calibration.py` | ~760 lines | Calibration experiments (optional) |

### What Does NOT Need to Move

| Artifact | Reason |
|----------|--------|
| `data/processed/bdg2_electricity_ml.parquet` | 26M rows — training data only, not needed for inference |
| `data/raw/egypt_synthetic_electricity_dataset.csv` | Synthetic — NOT USED |
| `notebooks/` | Analysis notebooks |
| `tests/` | Test suite (should be adapted for main project) |
| Training scripts | `train_step5.py`, `train_step5a.py`, etc. |
| DL model | `electricity_new_building_model_dl.joblib` — not selected |

### Recommended Packaging

Create `models/electricity-model/` in the main project:

```
models/electricity-model/
├── electricity_new_building_model_final.joblib
├── src/
│   ├── predict_egypt.py
│   ├── predict_new_building.py
│   └── egypt_config.py
└── requirements.txt   # joblib, numpy, pandas, scikit-learn
```

Follow the same `sys.path` injection pattern used by the traffic model.

---

## 17. What-If Recalculation

### Current Trigger

The main project currently triggers simulation when:
1. User clicks "RUN WHAT-IF SIMULATION" button
2. `handleTriggerSimulation(devRecord)` is called
3. Full 4-stage traffic pipeline runs

### Electricity Recalculation Triggers

Electricity predictions should recalculate when:

| Input Change | Triggers Recalculation? |
|-------------|------------------------|
| Development type changed | YES — different building type = different demand |
| Floor area changed | YES — demand scales with area |
| Location moved | YES — different city = different climate |
| Hour changed | YES — different time = different demand |
| Month/date changed | YES — seasonal variation |
| Number of floors changed | NO — not used by model |
| Number of occupants changed | NO — not used by model |
| Building name changed | NO |
| Orientation changed | NO |

### Recommendation

For initial integration, recalculate electricity whenever the full simulation is triggered. This is simple and consistent. Optimize later if needed.

---

## 18. Performance Considerations

### Electricity Model Latency

| Operation | Estimated Time |
|-----------|---------------|
| Single hourly prediction | ~50ms (model load + inference) |
| Annual prediction (72 samples) | ~3-5s |
| Full hourly profile (8760 hours) | ~30-60s |
| Model loading (first call) | ~1-2s (joblib load) |

### Scaling

| Developments | Traffic Simulation | Electricity (per-dev) | Total |
|-------------|-------------------|----------------------|-------|
| 1 | ~1.5s | ~0.05s | ~1.55s |
| 10 | ~1.5s | ~0.5s | ~2.0s |
| 100 | ~1.5s | ~5s | ~6.5s |
| 1000 | ~1.5s | ~50s | ~51.5s |

### Caching Strategy

- **Model:** Load once, cache in memory (same as traffic XGBoost model)
- **Weather:** Generated from config, no API calls, negligible cost
- **Results:** Cache per development ID; invalidate on property change

### Recommendation

For the initial integration, compute electricity per-development synchronously within the simulation pipeline. The 50ms per-development cost is negligible compared to the traffic simulation. Optimize with caching only if profiling shows a bottleneck.

---

## 19. Dependency Risks

### Backend Dependencies

| Package | Main Project | Electricity Model | Compatible? |
|---------|-------------|-------------------|-------------|
| numpy | >=1.24.0 | >=1.24,<2 | YES |
| pandas | >=2.0.0 | >=2.0,<3 | YES |
| scikit-learn | >=1.2.0 | >=1.3,<2 | YES |
| joblib | (not listed) | >=1.3 | **NEEDS ADDING** |
| fastapi | >=0.100.0 | (not needed) | N/A |
| pydantic | >=2.0.0 | (not needed) | N/A |
| xgboost | >=1.7.0 | (not needed) | N/A |
| geopandas | >=0.13.0 | (not needed) | N/A |
| matplotlib | (not listed) | >=3.7,<4 | Not needed at runtime |

### Risk Assessment

**LOW RISK.** The only new dependency is `joblib`, which is already transitively installed (scikit-learn depends on it). No version conflicts detected.

### Python Version

Both projects use Python 3.13+. No compatibility issues.

---

## 20. Risks

| Risk | Severity | Likelihood | Mitigation |
|------|----------|------------|------------|
| **GFA mismatch** | CRITICAL | HIGH | Add `gross_floor_area_sqm` to all types; derive from `area × floors` as fallback |
| **Area semantics confusion** | HIGH | HIGH | `area` in main project is FOOTPRINT, not GFA. Must be explicit about which is used. |
| **Building type mismatch** | MEDIUM | LOW | Mapping already implemented in `DEVELOPMENT_TYPE_TO_BDG2` |
| **Mixed-use mismatch** | MEDIUM | MEDIUM | Default 40/30/30 split; document assumption |
| **Coordinate mismatch** | HIGH | LOW | Both use WGS84 decimal degrees — compatible |
| **Timestamp mismatch** | MEDIUM | HIGH | Main project only has hour, not month/date. Assume July for peak. |
| **Weather mismatch** | LOW | LOW | Electricity model handles internally |
| **Unit mismatch** | LOW | LOW | Both use meters, kWh, °C — compatible |
| **Dependency conflict** | LOW | LOW | Only `joblib` needed, already installed transitively |
| **Model loading latency** | LOW | LOW | Cache in memory after first load |
| **Runtime performance** | LOW | LOW | 50ms per prediction is negligible |
| **BDG2 campus → Egyptian building transfer** | MEDIUM | N/A | Known limitation; model is calibrated, not validated for Egypt |

---

## 21. Recommended Implementation Order

1. **Extend `SimulationRequestSchema`** to include `latitude`, `longitude`
2. **Update `devModelAdapter.js`** to send coordinates in payload
3. **Add `gross_floor_area_sqm`** as optional field to all development types in `development.js`
4. **Create `backend/api/services/electricity_service.py`** — bridge to electricity model
5. **Create `backend/api/routes/electricity.py`** — standalone prediction endpoint
6. **Extend `simulator_service.py`** — call electricity prediction after traffic stages
7. **Extend `scenarios.py`** — include electricity results in simulation response
8. **Extend `SimulationResults.js`** — display electricity metrics
9. **Add `joblib`** to `backend/requirements.txt`
10. **Package electricity model** into `models/electricity-model/`
11. **Test end-to-end** with all 7 development types
12. **Document assumptions** (GFA derivation, month default, mixed-use split)

---

## 22. Definition of Done

After integration, the following must be true:

- [ ] Every development type can produce an electricity prediction
- [ ] `gross_floor_area_sqm` is available for all types (direct or derived)
- [ ] Latitude/longitude are included in the simulation payload
- [ ] Electricity results appear in the simulation response
- [ ] Electricity results are displayed in the frontend
- [ ] Mixed-use produces a reasonable prediction (default split or component-based)
- [ ] All 169 electricity model tests pass
- [ ] All existing main project tests pass
- [ ] No regression in traffic simulation
- [ ] Model loads in <2s on first request
- [ ] Single prediction <100ms after model is cached
- [ ] Assumptions are documented (GFA derivation, month default, mixed-use split)
- [ ] Synthetic Egyptian data is NOT used
- [ ] BDG2 unseen-building performance (R²=0.4542) is documented as the real evaluation
- [ ] Egyptian calibration (CAL-3) is documented as adaptation, not validation

---

*Generated by READ-ONLY integration gap audit — 2026-08-30*
*Neither project was modified during this audit.*
