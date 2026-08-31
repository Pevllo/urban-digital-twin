# Water Demand Model

## Model Card

### Selected Model
- **Algorithm:** Extra Trees Regressor (sklearn)
- **Why it won:** Best validation MAE (0.827) across all models tested. Competitive test MAE (0.795) with no overfitting. Fastest inference among top performers.

### Dataset
- **Source:** `water_demand_dataset.csv` (100,800 rows, 41 columns)
- **Structure:** Panel — 150 developments × 28 days × 24 hours
- **Target:** `water_demand_m3` (range 0.006–82.29, mean 7.41, skew 2.50)
- **Split:** Chronological (train: Jan–Aug, val: Sep–Oct, test: Nov–Dec)
- **Dropped for leakage:** `water_demand_liters` (corr=1.0 with target)

### Features (46 numeric + 10 categorical)
**Numeric:** hour, month, day_of_week, is_weekend, temperature_c, num_residents, num_units, num_beds, staff_count, num_students, num_employees, gross_leasable_area_sqm, visitor_capacity, gross_floor_area_sqm, floors, hour_sin, hour_cos, dow_sin, dow_cos, month_sin, month_cos, cooling_degree, heating_degree, activity_x_cooling, log1p_* (6 features), is_peak_hour_morning/evening/peak, temp_x_* (5 features), per_capita_gfa/gla, gfa_x_hour, gla_x_hour, is_weekday_morning/office_hour, day_of_year, week_of_year

**Categorical:** development_type, zone_id, time_period, type_x_hour, type_x_is_weekend, type_dummies (5)

### Performance
| Metric | Validation | Test |
|--------|-----------|------|
| MAE | 0.8272 | 0.7945 |
| RMSE | 1.5872 | 1.6254 |
| R² | 0.9812 | 0.9704 |
| MAPE | 14.92% | 18.33% |

### Top Features (SHAP)
1. hour_cos (1.20)
2. per_capita_gla (0.79)
3. gross_leasable_area_sqm (0.78)
4. time_period_night (0.77)
5. num_beds (0.69)

### What-If Variables
- development_type, zone_id, temperature_c, hour, month, day_of_week
- num_residents, num_beds, num_students, num_employees
- gross_leasable_area_sqm, visitor_capacity, gross_floor_area_sqm

### Saved Artifact
`models/water_demand_model.joblib` — contains model + preprocessor + feature lists + metadata

### API Endpoints
- `POST /api/v1/water-demand/predict` — single prediction
- `POST /api/v1/water-demand/simulate` — What-If comparison

### Tests
27/27 passed (model loading, prediction, validation, simulation, leakage audit, range checks)
