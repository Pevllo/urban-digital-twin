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

## 6. Dependencies & Limitations

- **Dependencies**: Python 3.10+, pandas, 
umpy, geopandas, shapely, pyogrio, pyproj, 
etworkx, matplotlib, scikit-learn, xgboost, shap, joblib, 	abulate.
- **Current Limitations**:
  - Model training was performed on synthetic hourly traffic observations generated from real OSM road network topology and configurable demand heuristics.
  - Generated output datasets (synthetic_traffic.csv ~270MB, synthetic_traffic.gpkg ~716MB) exceed normal GitHub file storage limits (>100MB) and are excluded from git. They can be reproduced locally via src/run_synthetic_pipeline.py.
- **Trip Demand Model Dependency**:
  - Currently standalone. Future integration phases will connect origin-destination outputs from the Trip Demand Model directly into the Traffic Model.
