# Model Card — Road-Level Traffic Volume Prediction

**Project:** AI Urban Digital Twin + What-If Simulator · **Stage:** ML (traffic volume)
**Date:** 2026-08-23

## 1. Purpose

Predict hourly `traffic_volume` for each OSM road segment from static road/network
attributes and calendar features. The model is the prediction core of the future
"What-If" road-network simulator: given a (possibly modified) network and a time
stamp, it must estimate road-level traffic without re-running the full assignment.

## 2. Dataset

| Item | Value |
|---|---|
| Source of truth | `data/raw/traffic_ml_dataset.csv.gz` (**never modified**) |
| Cleaned/engineered | `data/processed/traffic_ml_clean.csv` (+ `.parquet`) |
| Rows | 8,506,000 = 4,253 roads × 200 days × 10 sampled hours |
| Period | 2024-01-01 → 2024-07-18 (continuous, no gaps; July partial) |
| Hours present | {0, 3, 6, 7, 8, 9, 12, 15, 18, 21} — subsampled by upstream pipeline |
| Target | `traffic_volume` (int): min 0 · max 56,941 · mean 1,306.4 · median 145 · skew 5.20 · **36.8 % zeros** |
| Leakage handling | `volume_capacity_ratio`, `congestion_level`, `road_capacity_proxy` never entered the ML dataset (see `reports/leakage_audit.md`) |
| Dropped columns | `intersection_density` (constant), `highway_code` (ordinal duplicate of `highway`) |

No lag/history features exist in the source data and none were synthesized;
the model is therefore a *profile* predictor (road traits × calendar), not a
time-series forecaster. This also keeps it usable for hypothetical networks.

## 3. Features (22)

- **Temporal:** hour, day_of_week, month, is_weekend, is_peak_hour, morning_peak,
  evening_peak, hour_sin/cos, dow_sin/cos
- **Road:** road_length_m, road_length_log, lane_count, speed_limit_kmh,
  lane_speed_product, is_oneway, is_bridge, is_tunnel
- **Network topology:** node_degree, connected_road_count
- **Categorical:** highway (13 levels)

Excluded by design: `traffic_volume`, `road_id` (identifier),
`volume_capacity_ratio`, `congestion_level`.

## 4. Encoding

- XGBoost: **native categorical split** (`enable_categorical=True`,
  category order = sorted) — no arbitrary numeric semantics.
- LinearRegression / RandomForest: one-hot via `pd.get_dummies`
  (`handle unknown → all-zero row` on reload).

## 5. Splits (chronological)

| Split | Dates | Days | Rows |
|---|---|---|---|
| TRAIN | 2024-01-01 → 2024-04-30 | 121 | 5,146,130 |
| VALIDATION | 2024-05-01 → 2024-06-15 | 46 | 1,956,380 |
| TEST | 2024-06-16 → 2024-07-18 | 33 | 1,403,490 |

No naive random split was used. Validation drove early stopping + model selection.

## 6. Models & metrics

MAPE excluded (36.8 % zero targets ⇒ division by zero). Accuracy N/A (regression).

| Model | Val MAE | Val RMSE | Val R² | Test MAE | Test RMSE | Test R² |
|---|---|---|---|---|---|---|
| Mean baseline | 1650.1 | 2960.2 | −0.000 | 1686.5 | 3050.2 | −0.000 |
| Median baseline | 1270.2 | 3172.3 | −0.149 | 1322.9 | 3275.5 | −0.153 |
| LinearRegression (one-hot) | 1650.1 | 2960.1 | −0.000 | 1686.6 | 3050.2 | −0.000 |
| RandomForest | 571.2 | 1121.5 | 0.856 | 592.1 | 1157.6 | 0.856 |
| **XGBoost (best)** | **465.1** | **1014.6** | **0.883** | **488.0** | **1060.7** | **0.879** |

LinearRegression ≈ mean baseline ⇒ the signal lives in non-linear interactions
(e.g., highway × hour), which tree ensembles capture.

Train R² (0.887) ≈ val (0.883) ≈ test (0.879): no meaningful overfitting or drift.

## 7. Winning configuration (XGBoost)

```json
{
  "n_estimators": 1500, "learning_rate": 0.05, "max_depth": 9,
  "min_child_weight": 5, "subsample": 0.8, "colsample_bytree": 0.8,
  "reg_lambda": 1.0, "tree_method": "hist", "enable_categorical": true,
  "objective": "reg:squarederror", "eval_metric": "rmse",
  "early_stopping_rounds": 60, "random_state": 42, "n_jobs": -1
}
```

Early stopping did not trigger (`best_iteration = 1499`); all 1500 rounds used.
Single controlled extension from a 500-round probe — not a hyperparameter search.

## 8. Feature importance

Gain importance (`reports/feature_importance.csv`, plot in
`reports/plots/feature_importance.png`) — top:

| Feature | Category | Note |
|---|---|---|
| highway | road characteristic | dominant: road class sets demand scale |
| is_peak_hour / hour_cos | temporal | daily cycle & peaks |
| lane_count, speed_limit_kmh, lane_speed_product | road characteristics | capacity proxies |
| road_length_m / road_length_log | road characteristic | longer links carry more flow |
| node_degree, connected_road_count | network topology | intersection position effects |
| is_weekend | temporal | Fri/Sat dip |
| is_oneway | road characteristic | |

SHAP (`reports/shap_importance.csv`, `reports/plots/shap_summary.png`, 20 k test
sample) agrees: highway > road_length_m > hour_cos > connected_road_count >
node_degree > is_weekend > is_peak_hour.

Interpretation: demand is driven first by **what kind of road it is**, then
**when** (peaks/weekend), then by **where it sits in the network** — exactly the
structure needed for credible What-If rerouting scenarios.

## 9. Artifacts & reloadability

```
models/traffic_xgboost_model.json     best model (Booster JSON, 1500 trees)
models/preprocessing_metadata.json    features, encoding, splits, params, versions
reports/model_results.csv             all metric rows
reports/feature_importance.csv        gain + split-count
reports/shap_importance.csv           mean |SHAP|
reports/plots/*.png                   7 diagnostic plots
```

Reload (verified in notebook 02):

```python
import xgboost as xgb, pandas as pd, json
meta = json.load(open("models/preprocessing_metadata.json"))
booster = xgb.Booster(); booster.load_model("models/traffic_xgboost_model.json")
X["highway"] = X["highway"].astype("category")   # required dtype
pred = booster.inplace_predict(X[meta["features"]])
```

## 10. Reproducibility

| Item | Value |
|---|---|
| Python | 3.13.14 |
| numpy / pandas / scikit-learn | 2.2.6 / 2.3.3 / 1.8.0 |
| xgboost / shap / matplotlib / pyarrow | 3.4.1 / 0.52.0 / 3.10.9 / 23.0.0 |
| Random seed | 42 (numpy, RF, XGBoost; SHAP sample) |
| Entry points | `python src/feature_engineering.py` → `python src/train_models.py` |

## 11. Limitations

- Profile model: cannot react to within-day dynamics beyond sampled hours or to
  congestion feedback (no capacity constraint in features).
- Trained on synthetic demand (Jan–Jul 2024); real-world transfer unvalidated.
- Zero-inflated target: MAE is the most interpretable headline metric here;
  RMSE/R² are dominated by high-volume arterial segments.
