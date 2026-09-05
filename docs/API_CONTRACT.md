# API Contract — Frozen

Backend API for AI Urban Digital Twin — New Administrative Capital District R3.

**Status:** FROZEN — This document is the authoritative contract for frontend integration.
**Version:** 2.0.0
**Base URL:** `http://localhost:8000`

---

## Canonical Development Types

All endpoints that accept `development_type` use these canonical values:

| Value | Description |
|-------|-------------|
| `residential_compound` | Residential compound / housing |
| `hospital` | Hospital / healthcare facility |
| `mall` | Mall / commercial / retail |
| `school` | School / educational institution |
| `office` | Office / commercial workspace |

**Aliases** (resolved internally, accepted by `/scenarios/simulate`):

| Alias | Resolves to |
|-------|-------------|
| `residential` | `residential_compound` |
| `hotel` | `residential_compound` |
| `commercial` | `mall` |
| `retail` | `mall` |

**Special type:**

| Type | Behavior |
|------|----------|
| `mixed_use` | Decomposed into office (40%), residential (30%), mall (30%) for electricity/water/waste |

---

## Endpoints

### `GET /health`

Health check.

**Response:** `200 OK`
```json
{
  "status": "healthy",
  "service": "Urban Digital Twin API Server",
  "developments_persisted": 0
}
```

---

### `GET /api/v1/developments`

List all stored developments.

**Response:** `200 OK`
```json
[
  {
    "development_id": "string",
    "development_type": "string",
    "name": "string",
    "latitude": 0.0,
    "longitude": 0.0,
    "area": 0.0,
    "height": 0.0,
    "floors": 1,
    "capacity": 0.0,
    "status": "string",
    "zone_id": "string",
    "properties": {},
    "created_at": "string"
  }
]
```

---

### `POST /api/v1/developments`

Create or update a development.

**Request:**
```json
{
  "development_id": "string (required)",
  "development_type": "string (required)",
  "name": "string (optional, default: '')",
  "latitude": 0.0,
  "longitude": 0.0,
  "area": 0.0,
  "height": 0.0,
  "floors": 1,
  "capacity": 0.0,
  "status": "string (default: 'proposed')",
  "zone_id": "string (default: '')",
  "properties": {
    "num_residents": 0,
    "num_units": 0,
    "num_beds": 0,
    "staff_count": 0,
    "gross_leasable_area_sqm": 0,
    "visitor_capacity": 0,
    "num_students": 0,
    "num_employees": 0,
    "gross_floor_area_sqm": 0
  }
}
```

**Response:** `201 Created` — same structure as request + `created_at`.

**Errors:**
- `400`: `development_id` missing
- `422`: `development_type` not in accepted set

---

### `GET /api/v1/developments/{development_id}`

Retrieve a single development by ID.

**Response:** `200 OK` — same structure as creation response.

**Errors:**
- `404`: Development not found

---

### `DELETE /api/v1/developments/{development_id}`

Delete a development.

**Response:** `200 OK`
```json
{
  "status": "deleted",
  "id": "string"
}
```

**Errors:**
- `404`: Development not found

---

### `POST /api/v1/water/predict`

Standalone water demand prediction.

**Request:**
```json
{
  "development_type": "string (required)",
  "zone_id": "string (default: '')",
  "temperature_c": 25.0,
  "hour": 8,
  "month": 7,
  "day_of_week": 3,
  "is_weekend": false,
  "properties": {
    "num_residents": 0,
    "num_units": 0,
    "num_beds": 0,
    "staff_count": 0,
    "num_students": 0,
    "num_employees": 0,
    "gross_leasable_area_sqm": 0,
    "visitor_capacity": 0,
    "gross_floor_area_sqm": 0,
    "floors": 1
  }
}
```

**Response:** `200 OK`
```json
{
  "prediction": 3.2294,
  "unit": "m3",
  "prediction_liters": 3229.36,
  "model": "extra_trees",
  "scenario": {}
}
```

**Units:** `prediction` is m³/hour. `prediction_liters` is liters/hour.

**Errors:**
- `400`: Invalid `development_type` or out-of-range values
- `422`: Pydantic validation error (missing required fields, type mismatch)
- `503`: Model artifact unavailable

---

### `POST /api/v1/waste/predict`

Standalone solid waste generation prediction.

**Request:**
```json
{
  "development_type": "string (required)",
  "month": 6,
  "day_of_week": 2,
  "temperature_c": 25.0,
  "zone_lat": null,
  "zone_lon": null,
  "properties": {
    "num_residents": 0,
    "num_beds": 0,
    "staff_count": 0,
    "num_students": 0,
    "num_employees": 0,
    "gross_leasable_area_sqm": 0,
    "weekend_multiplier_applied": 1.0,
    "seasonal_multiplier_applied": 1.0
  }
}
```

**Response:** `200 OK`
```json
{
  "waste_generation_kg": 432.98,
  "waste_generation_tonnes": 0.43298,
  "development_type": "residential_compound",
  "model": "XGBRegressor"
}
```

**Units:** `waste_generation_kg` is kg/day. `waste_generation_tonnes` is tonnes/day.

**Errors:**
- `400`: Invalid `development_type`
- `422`: Pydantic validation error
- `503`: Model artifact unavailable

---

### `POST /api/v1/scenarios/simulate` — UNIFIED WHAT-IF ENGINE

The core endpoint. One development → full urban impact simulation.

**Request:**
```json
{
  "development_id": "string (required)",
  "development_type": "string (required)",
  "zone_id": "string (optional, resolved from coordinates if absent)",
  "name": "string (optional)",
  "properties": {},
  "simulation_hour": 8,
  "latitude": 30.05,
  "longitude": 31.75
}
```

**Response:** `200 OK` — Full 8-stage simulation result:

```json
{
  "development_input": {
    "development_type": "residential_compound",
    "zone_id": "Z0016",
    "properties": { "num_residents": 500 }
  },
  "hour": 8,

  "stage1_od_demand": {
    "hour": 8,
    "development_type": "residential_compound",
    "origin_zone": "Z0016",
    "total_trips": 28.0,
    "od_matrix": [
      {"origin_zone": "Z0016", "destination_zone": "Z0000", "trips": 0.12}
    ]
  },

  "stage2_assignment": { "..." : "Traffic assignment results" },

  "stage3_scenario_traffic": { "..." : "Scenario traffic volumes" },

  "stage4_impact_assessment": {
    "total_development_trips": 28.0,
    "assigned_external_trips": 28.0,
    "unassigned_internal_trips": 0.0,
    "number_of_affected_roads": 963,
    "roads_worsened_count": 0,
    "roads_reaching_los_E_or_F_count": 5,
    "roads_reaching_vc_1_or_more_count": 5,
    "baseline_average_vc": 0.4485,
    "average_scenario_vc": 0.4489,
    "avg_vc_change": 0.0004,
    "max_vc_change": 0.0202,
    "overall_impact_level": "LOW",
    "development_impact": "LOW",
    "network_condition": "CRITICAL",
    "top_bottlenecks": [
      {"road_id": "osm_543021784_2", "scenario_vc": 1.1958, "baseline_vc": 1.1756, "is_los_worsened": false}
    ]
  },

  "stage5_electricity": {
    "electricity_available": true,
    "electricity_kwh": 123.45,
    "building_type": "residential_compound",
    "floor_area_sqm": 5000.0,
    "city": "Cairo",
    "timestamp": "2024-07-15T08:00:00",
    "calibration": "CAL-3",
    "uncertainty": {}
  },

  "stage6_water": {
    "water_available": true,
    "water_demand_m3_hour": 3.29,
    "water_demand_liters_hour": 3293.38,
    "unit": "m3",
    "model": "extra_trees"
  },

  "stage7_waste": {
    "waste_available": true,
    "waste_generation_kg_day": 433.04,
    "waste_generation_tonnes_day": 0.433,
    "model": "XGBRegressor"
  },

  "stage8_environment": {
    "co2_available": true,
    "co2_electricity_kg": 61.73,
    "co2_waste_kg": 0.22,
    "co2_transport_kg": 0.0,
    "total_co2_kg": 61.95,
    "total_co2_tonnes": 0.062,
    "method": "Transparent emissions calculation using published emission factors",
    "factors": {
      "electricity_kg_co2_per_kwh": 0.5,
      "road_transport_kg_co2_per_vkm": 0.18,
      "waste_kg_co2_per_kg": 0.0005,
      "sources": "IPCC / BEIS / DEFRA"
    }
  }
}
```

**Notes:**
- `stage5_electricity` may have `electricity_available: false` if GFA cannot be determined.
- `stage6_water` may have `water_available: false` if model artifact is missing.
- `stage7_waste` may have `waste_available: false` if model artifact is missing.
- `stage8_environment` uses transparent emission factors, not an ML model.
- When `development_type` is `mixed_use`, water/waste/electricity stages include `components` arrays with per-type decomposition.
- Zone ID is resolved from `latitude`/`longitude` via Haversine nearest-centroid lookup. If both `zone_id` and coordinates are provided, coordinates take precedence.

**Errors:**
- `400`: Invalid development type, zone not found, or model unavailable
- `422`: Pydantic validation error
- `500`: Internal simulation failure

---

## Error Response Format

All errors follow FastAPI's standard format:

```json
{
  "detail": "error message string"
}
```

For Pydantic validation errors (422):
```json
{
  "detail": [
    {
      "type": "value_error",
      "loc": ["body", "development_type"],
      "msg": "Value error, development_type 'bogus' not supported...",
      "input": "bogus"
    }
  ]
}
```

---

## Development Properties Reference

These properties are passed in the `properties` object and used by different models:

| Property | Type | Used by | Unit |
|----------|------|---------|------|
| `num_residents` | float | Water, Waste, Trip Demand | persons |
| `num_units` | float | Water, Trip Demand | dwelling units |
| `num_beds` | float | Water, Waste | beds |
| `staff_count` | float | Water, Waste | staff |
| `num_students` | float | Water, Waste | students |
| `num_employees` | float | Water, Waste, Trip Demand | employees |
| `gross_leasable_area_sqm` | float | Water, Waste, Electricity | m² |
| `visitor_capacity` | float | Water | persons |
| `gross_floor_area_sqm` | float | Water, Electricity | m² |
| `floors` | int | Water, Electricity | count |
| `weekend_multiplier_applied` | float | Waste | ratio (default 1.0) |
| `seasonal_multiplier_applied` | float | Waste | ratio (default 1.0) |

---

## Zone Resolution

Zone IDs (e.g., `Z0000`–`Z0149`) are resolved from WGS84 coordinates using Haversine nearest-centroid lookup against the authoritative zone dataset at `models/trip-demand-model/data/raw/zone_osm_mapping_v2.csv`.

If `latitude`/`longitude` are provided in the simulate request, the backend resolves the zone automatically. The `zone_id` field in the request is optional when coordinates are present.

---

## Timestamps

- `created_at` on developments: stored but currently empty string (SQLite timestamp to be added).
- `timestamp` in electricity response: ISO 8601 string from the electricity model.

---

## Performance Characteristics

| Endpoint | Typical latency | Notes |
|----------|----------------|-------|
| `GET /health` | <10ms | |
| `GET /api/v1/developments` | <50ms | SQLite query |
| `POST /api/v1/developments` | <50ms | SQLite insert |
| `DELETE /api/v1/developments/{id}` | <50ms | SQLite delete |
| `POST /api/v1/water/predict` | ~500ms | First call loads model; cached after |
| `POST /api/v1/waste/predict` | ~300ms | First call loads model; cached after |
| `POST /api/v1/scenarios/simulate` | ~9-10s | Dominated by traffic pipeline (stages 1-4) |

---

## Models

| Model | Algorithm | Artifact | Target | Unit |
|-------|-----------|----------|--------|------|
| Water Demand | Extra Trees Regressor | `water_demand_model.joblib` | `water_demand_m3` | m³/hour |
| Solid Waste | XGBoost (Tuned) | `solid_waste_model.joblib` | `waste_generation_kg` | kg/day |
| Electricity | BDG2/ASHRAE calibrated | `electricity_new_building_model_final.joblib` | `electricity_kwh` | kWh |
| Traffic | XGBoost | `traffic_xgb_model.joblib` | traffic volume | vehicles/hour |
| Trip Demand | Gravity model | (rule-based) | trips | trips/day |
