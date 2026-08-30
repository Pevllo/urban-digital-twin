# Synthetic Traffic Data Report

**SYNTHETIC TRAFFIC DATA GENERATED USING REAL OSM ROAD NETWORK DATA.**

- OSM provides the real road geometry, network topology and attributes.
- Traffic volumes are SYNTHETIC, generated from transparent documented assumptions.
- These are NOT real measurements, sensor data or official statistics.
- Intended use: ML pipeline development, prototyping, digital-twin demonstration,
  What-If simulation development.
- NOT a replacement for real traffic measurements.

## Methodology

```text
static_level_i = BASE_DEMAND x ROAD_CLASS_FACTOR x LANE_FACTOR
                x CONNECTIVITY_FACTOR x SPEED_FACTOR x lognormal_heterogeneity
levels smoothed across OSM graph (w=0.35, 2 passes)   [spatial correlation]
volume(i,t) = static_level_i x daily_factor(day) x event_factor(day)
              x HOURLY_PROFILE[h][weekday/weekend] x HIERARCHY_PEAK_BOOST
              x lognormal_noise(sigma=0.12)
clip(volume, 0, min(12000, capacity_proxy x 1.15))
```

## Configuration used

- **RANDOM_SEED**: `42`
- **START_DATE**: `2026-01-05`
- **NUM_DAYS**: `30`
- **BASE_DEMAND**: `300.0`
- **MORNING_PEAK_HOURS**: `(7, 10)`
- **EVENING_PEAK_HOURS**: `(16, 20)`
- **WEEKEND_DAYS(Fri,Sat)**: `(4, 5)`
- **WEEKEND_DEMAND_FACTOR**: `0.85`
- **NOISE_SIGMA**: `0.12`
- **DAILY_VARIATION_SCALE**: `0.08`
- **SPECIAL_EVENT_DAY_PROBABILITY**: `0.07`
- **SPATIAL_INFLUENCE_STRENGTH**: `0.35`
- **MAX_TRAFFIC_PER_ROAD**: `12000`

## Data-quality notes

- `maxspeed` is ABSENT from the source OSM export; `speed_limit_kmh` values are class-based IMPUTATIONS (`speed_source='imputed'`), not measured limits.
- `lanes` exists but is >99% missing; lane counts are class-default imputations flagged via `lanes_source='imputed'`.
- Non-drivable classes (footway/steps/pedestrian/construction) are excluded from traffic generation (`is_drivable=False`).

## Validation results

| check                         | value                                      | verdict   |
|:------------------------------|:-------------------------------------------|:----------|
| n_road_segments_real_OSM      | 6615                                       |           |
| n_observations_synthetic      | 4,762,800                                  |           |
| date_range                    | 2026-01-05 00:00:00 .. 2026-02-03 23:00:00 |           |
| volume_min                    | 4                                          | PASS      |
| volume_max                    | 8901                                       | PASS      |
| volume_mean_median_std        | 259 / 116 / 437                            |           |
| mean_HIGH_hierarchy           | 1841                                       | PASS      |
| mean_LOW_hierarchy            | 174                                        |           |
| mean_night(02-04)             | 48                                         | PASS      |
| mean_midday(10,11,14)         | 336                                        |           |
| peak_hours_mean               | 400                                        | PASS      |
| offpeak_mean                  | 201                                        |           |
| corr(volume,capacity_proxy)   | 0.745                                      | PASS      |
| neighbour_residual_median_r   | 0.867                                      | PASS      |
| random_pair_residual_median_r | 0.338                                      |           |
| weekend_vs_weekday_mean       | 240 vs 266                                 | PASS      |