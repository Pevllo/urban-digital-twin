# Traffic Model — AI Urban Digital Twin

The **Traffic Model** component predicts hourly vehicle traffic volumes across OpenStreetMap (OSM) road network segments and simulates What-If scenarios for urban infrastructure planning.

---

## 1. Overview & Purpose

As part of the **AI Urban Digital Twin** platform, the Traffic Model enables:
- **Hourly Traffic Prediction**: Estimating vehicle volumes (	raffic_volume in veh/h) across individual road network links based on spatial, topological, and temporal features.
- **What-If Scenario Simulation**: Evaluating how infrastructure modifications (e.g., changing lane counts, road classification, or capacity proxies) impact road network traffic distribution.

---

## 2. Input Features & Output Variables

### Input Features (MODEL_FEATURES)

| Feature | Category | Type | Description |
| :--- | :--- | :--- | :--- |
| oad_type | Spatial | Categorical | OSM highway classification (primary, secondary, 	ertiary, 	runk, etc.) |
| oad_length_m | Spatial | Numeric | Segment length in meters (computed in metric CRS EPSG:32636) |
| lane_count | Spatial | Numeric | Number of lanes per segment |
| speed_limit_kmh | Spatial | Numeric | Estimated or explicit speed limit (km/h) |
| is_oneway | Spatial | Boolean | Indicator for one-way road operation |
| is_bridge | Spatial | Boolean | Indicator for bridge segments |
| is_tunnel | Spatial | Boolean | Indicator for tunnel segments |
| oad_capacity_proxy | Spatial | Numeric | Estimated hourly lane capacity proxy (veh/h) |
| intersection_density | Topology | Numeric | Density of connected intersections around segment nodes |
| 
ode_degree | Topology | Numeric | Network node degree in road graph |
| connected_road_count| Topology | Numeric | Count of directly adjacent road segments |
| hour, day_of_week, month | Temporal | Numeric | Calendar time components |
| is_weekend, is_peak_hour | Temporal | Boolean | Flags for weekend status and morning/evening peak hours |
| hour_sin, hour_cos, day_sin, day_cos | Temporal | Numeric | Cyclical encoding of hour-of-day and day-of-week |
| 	raffic_volume_lag_1h .. 168h | Historical | Numeric | Past traffic volume observations at 1h, 2h, 24h, 168h lags |
| olling_mean_3h .. 24h | Historical | Numeric | Past 3h, 6h, 24h rolling average traffic volume (shift(1)) |

### Explicit Anti-Leakage Exclusions
The following variables from the synthetic data generator are strictly **excluded** from model training to prevent formula leakage:
- synthetic_demand_factor, daily_variation_factor, spatial_influence_factor, daily_factor, event_factor

### Output Variable
- 	raffic_volume (Numeric): Predicted hourly vehicle flow in vehicles per hour (veh/h).

---

## 3. Data Preprocessing & Feature Engineering

1. **OSM Data Parsing (osm_loader.py)**:
   - Parses raw OpenStreetMap XML (data/raw/osm/map.osm), extracting ways with highway tags and network nodes.
   - Builds a GeoDataFrame in WGS84 (EPSG:4326).
2. **Road Attributes & Topology (osm_features.py, oad_network.py)**:
   - Reprojects to UTM 36N (EPSG:32636) for metric length computation.
   - Infers missing lane counts and speed limits based on standard Egyptian/urban road defaults.
   - Computes segment capacity proxy: capacity_proxy = effective_lanes * base_capacity_per_lane * adjustments.
   - Builds network graph topology using 
etworkx to calculate node degree and segment connectivity.
3. **Historical Lags & Rolling Features (	rain.py)**:
   - Computes time series lags (1h, 2h, 24h, 168h) and rolling means (3h, 6h, 24h).
   - All historical rolling windows are applied with shift(1) to ensure strict anti-leakage (no future or current timestamp leakage).
4. **Encoding Pipeline**:
   - Uses scikit-learn ColumnTransformer with OneHotEncoder(handle_unknown='ignore') for oad_type and passthrough for numeric features.

---

## 4. Model Architecture, Training & Evaluation

- **Algorithm**: Tuned XGBoost Regressor (XGBRegressor) enclosed in a scikit-learn Pipeline.
- **Baselines Compared**: DummyRegressor (mean baseline), LinearRegression, RandomForestRegressor.
- **Data Splitting**: Chronological 60% Train / 20% Validation / 20% Test split based on timestamp quantiles.
- **Hyperparameter Optimization**: RandomizedSearchCV with 3-fold TimeSeriesSplit minimizing MAE.
- **Saved Model Artifact**: models/traffic_xgb_model.joblib.
- **Evaluation Metrics & Diagnostic Output**:
  - Test Set Performance: Evaluated on MAE, RMSE, R2, and MAPE.
  - Error breakdowns produced across hour of day, road type, road hierarchy, traffic range, and capacity quartile (eports/model_error_breakdowns.csv).
  - Diagnostic figures saved to eports/figures/ (Actual vs Predicted, Residuals, Error Distribution, SHAP Summary, Gain Feature Importance).

---

## 5. How to Run

### Installation
Ensure dependencies listed in equirements.txt are installed:
`ash
pip install -r requirements.txt
`

### Run Model Inference & What-If Demo
`ash
python src/predict.py
`
Or execute custom What-If scenario simulations:
`ash
python src/custom_whatif.py
`

### Train & Evaluate Model
`ash
python src/train.py
python src/evaluate.py
`

### Re-generate Synthetic Traffic Dataset & Full Pipeline
`ash
python src/run_synthetic_pipeline.py
`

---

## 7. Stage 2: Traffic Assignment Engine (`src/traffic_assignment.py`)

### Urban Mobility Pipeline Integration

```
STAGE 1: Development Scenario → Trip Generation → OD Demand Matrix
       │
       ▼
STAGE 2: Traffic Assignment Engine (src/traffic_assignment.py)
       │  Routes OD trips over OSM graph via free-flow shortest paths
       ▼
---

## 8. Stage 3B: Scenario Traffic Aggregator (`src/traffic_aggregator.py`)

### Urban Mobility Pipeline Integration

```
STAGE 1: Development Scenario → Trip Generation → OD Demand Matrix
       │
       ▼
STAGE 2: Traffic Assignment Engine (src/traffic_assignment.py)
       │  Routes OD trips over OSM graph via free-flow shortest paths
       ▼
Assigned Link Traffic Volume Deltas (ΔV_assigned per road segment & hour)
       │
       ▼
STAGE 3B: Scenario Traffic Aggregator (src/traffic_aggregator.py)
       │  Hybrid ML baseline prediction + Stage 2 deterministic demand addition
       ▼
Scenario Traffic Volume per Road Link (V_scenario = V_base + ΔV_assigned) & V/C Ratios
       │
       ▼
---

## 9. Stage 4: Impact Assessment & Unified What-If Simulator (`src/impact_assessment.py`, `src/simulator.py`)

### Urban Mobility Pipeline Flow

```
Development Scenario (e.g. 8,000-resident compound at Z0008)
        │
        ▼
Stage 1: Trip Generation & OD Demand Matrix (src/trip_generation.py)
        │
        ▼
Stage 2: AON Traffic Assignment Engine (src/traffic_assignment.py)
        │
        ▼
Stage 3B: Baseline XGBoost + Scenario Traffic Aggregator (src/traffic_aggregator.py)
        │
        ▼
Stage 4: Traffic Impact & Level-of-Service Assessment (src/impact_assessment.py)
        │
        ▼
ONE Unified What-If Function: simulate_what_if_scenario() (src/simulator.py)
```

### Key Capabilities
- **Single Function Call**: `simulate_what_if_scenario(dev_input, hour=8)` executes all 4 stages end-to-end.
- **Level of Service (LOS A–F)**: Classifies baseline vs scenario $V/C$ into HCM-style Level of Service grades ($A: V/C < 0.60$ up to $F: V/C \ge 1.00$).
- **LOS Deterioration**: Detects road degradation ($\text{LOS}_{\text{base}} \rightarrow \text{LOS}_{\text{scen}}$).
- **Impact Severity**: Categorizes link impact into `LOW`, `MODERATE`, `HIGH`, or `CRITICAL`.
- **Bottleneck Scoring**: Ranks problematic links deterministically based on weighted $V/C$, assigned volume $\Delta V$, and LOS drop.
- **Scenario Impact Level**: Evaluates total network health (`LOW`, `MODERATE`, `HIGH`, `CRITICAL`).



