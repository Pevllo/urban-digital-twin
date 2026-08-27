# Data Leakage Audit — Traffic Volume Prediction Model

**Date:** 2026-08-22  
**Model:** XGBoost (tuned, CUDA)  
**Dataset:** 1,219,368 usable rows (30 days × 2,209 roads, minus 7-day history warmup)

---

## Target Variable

| Column | Role | Notes |
|--------|------|-------|
| `traffic_volume` | TARGET | Synthetic, generated from OSM attributes + temporal model |

---

## Features Under Audit

Every feature used in the model was checked for:
- **Target leakage**: information derived from `traffic_volume` itself
- **Future information**: data from timestamps after the prediction time
- **Post-event information**: data that would only be known after the event
- **Audit columns from generation**: columns that encode the synthetic formula

### Feature Verdicts

| Feature | Source | Safe? | Reason |
|---------|--------|-------|--------|
| `road_type` (highway) | OSM tag | **SAFE** | Road attribute, known before prediction |
| `road_length_m` | OSM geometry | **SAFE** | Physical attribute, static |
| `lane_count` | OSM tag (99% imputed) | **SAFE** | Road attribute, known before prediction |
| `speed_limit_kmh` | Imputed from highway class | **SAFE** | Road attribute, known before prediction |
| `is_oneway` | OSM tag | **SAFE** | Road attribute, static |
| `is_bridge` | OSM tag | **SAFE** | Road attribute, static |
| `is_tunnel` | OSM tag | **SAFE** | Road attribute, static |
| `road_capacity_proxy` | Derived from OSM attributes | **SAFE** | Static road attribute, no traffic data used |
| `intersection_density` | Derived from OSM graph | **SAFE** | Network topology, static |
| `node_degree` | Derived from OSM graph | **SAFE** | Network topology, static |
| `connected_road_count` | Derived from OSM graph | **SAFE** | Network topology, static |
| `hour` | Timestamp | **SAFE** | Known at prediction time |
| `day_of_week` | Timestamp | **SAFE** | Known at prediction time |
| `month` | Timestamp | **SAFE** | Known at prediction time |
| `is_weekend` | Derived from timestamp | **SAFE** | Known at prediction time |
| `is_peak_hour` | Derived from hour | **SAFE** | Known at prediction time |
| `hour_sin` / `hour_cos` | Cyclical encoding of hour | **SAFE** | Derived from known time |
| `day_sin` / `day_cos` | Cyclical encoding of day | **SAFE** | Derived from known time |
| `traffic_volume_lag_1h` | Shifted traffic_volume (t-1) | **SAFE** | Only uses strictly past values (shift ≥ 1) |
| `traffic_volume_lag_2h` | Shifted traffic_volume (t-2) | **SAFE** | Only uses strictly past values |
| `traffic_volume_lag_24h` | Shifted traffic_volume (t-24) | **SAFE** | Only uses strictly past values |
| `traffic_volume_lag_168h` | Shifted traffic_volume (t-168) | **SAFE** | Only uses strictly past values |
| `rolling_mean_3h` | Rolling mean on shift(1) | **SAFE** | Window excludes current hour |
| `rolling_mean_6h` | Rolling mean on shift(1) | **SAFE** | Window excludes current hour |
| `rolling_mean_24h` | Rolling mean on shift(1) | **SAFE** | Window excludes current hour |

### Excluded from Model Features (Leakage Risk)

| Column | Reason for Exclusion |
|--------|---------------------|
| `synthetic_demand_factor` | Encodes the generation formula; would leak the hidden model |
| `daily_variation_factor` | Encodes daily variation from the generation formula |
| `spatial_influence_factor` | Encodes spatial smoothing from the generation formula |
| `daily_factor` | Encodes day-of-series variation from the generation formula |
| `event_factor` | Encodes special events from the generation formula |
| `morning_peak` | Redundant with hour; excluded to reduce collinearity |
| `evening_peak` | Redundant with hour; excluded to reduce collinearity |
| `road_hierarchy` | Encoded via road_type one-hot; redundant |
| `road_id` | Identifier, not a predictive feature |
| `timestamp` | Represented via temporal features |

---

## Verification

1. **Lag computation**: All lag features use `groupby("road_id").shift(n)` where n ≥ 1. The current hour's traffic_volume is never included in any lag or rolling feature.

2. **Rolling windows**: Computed on `shift(1)` then grouped, ensuring the window covers hours [t-3, t-2, t-1] for rolling_mean_3h, [t-24, ..., t-1] for rolling_mean_24h. The current hour t is never in the window.

3. **Chronological split**: Train/val/test split is by timestamp, not random. Test set (Jan 30 – Feb 3) is strictly after training (Jan 12–25) and validation (Jan 25–30). No future data leaks into training.

4. **No generation formula in features**: The five audit columns from the synthetic data generation are all excluded from model features. The model must learn relationships from road attributes + temporal features + lag history, not from the hidden generation formula.

---

## Conclusion

**All 27 model features are safe.** No target leakage, no future information, no post-event data, and no synthetic generation formula leakage. The model learns from:
- Road network attributes (from real OSM data)
- Temporal context (hour, day, peak status)
- Historical traffic patterns (lag features from strictly past observations)

The model is suitable for What-If scenario analysis where road attributes are modified to simulate infrastructure changes.
