# Leakage Audit — `traffic_ml_dataset.csv.gz`

**Date:** 2026-08-23 · **Auditor:** automated pipeline (`src/inspect_data.py` + schema diff vs `synthetic_road_traffic.csv.gz`)
**Verdict: the ML dataset contains NO target-leaking columns.** Details below.

---

## 1. Dataset relationship

`traffic_ml_dataset.csv.gz` (22 cols) is a strict column-subset of
`synthetic_road_traffic.csv.gz` (28 cols), row-for-row identical (both 8,506,000 rows;
spot-checked values match). The raw file was already stripped of 8 columns during ML
preparation:

| Removed in raw → ML step | Reason |
|---|---|
| `road_name` | Arabic label, identifier-like metadata |
| `from_node`, `to_node` | OSM node IDs (high-cardinality identifiers) |
| `lane_count_is_fallback`, `speed_limit_is_fallback` | provenance flags |
| `road_capacity_proxy` | capacity estimate (post-assignment attribute) |
| `volume_capacity_ratio` | **directly computed as traffic_volume / road_capacity_proxy** |
| `congestion_level` | banded from `volume_capacity_ratio` |

## 2. Explicit leakage checks on the ML dataset

| Candidate | Present? | Status |
|---|---|---|
| `volume_capacity_ratio` | **No** | Already removed upstream. Verified absent. |
| `congestion_level` | **No** | Already removed upstream. Verified absent. |
| Features computed from `traffic_volume` | No | All remaining columns are static road attributes or calendar derivations; none reference the target. |
| Future traffic values / lags of target used as features | No | Dataset has no lag/lead/cumulative columns. |
| Cumulative / running aggregates | No | None present. |
| Post-assignment variables | No | Only `road_capacity_proxy`-family columns were post-assignment, and they were excluded. |

Remaining columns and why each is safe:

- `road_id` — identifier only (**excluded from model features**, kept for joins/What-If lookup).
- `highway`, `highway_code`, `road_hierarchy`, `road_length_m`, `lane_count`,
  `speed_limit_kmh`, `is_oneway`, `is_bridge`, `is_tunnel`, `node_degree`,
  `connected_road_count`, `intersection_density` — static OSM network attributes,
  fixed per road across all 200 days (verified: 0 roads vary). Safe.
- `date`, `hour`, `day_of_week`, `month`, `is_weekend`, `is_peak_hour`,
  `morning_peak`, `evening_peak` — pure functions of the timestamp. Safe.

## 3. Redundant / zero-information columns found (not leakage)

- `intersection_density` — **constant** (2.2116454 in every row) → dropped in cleaning.
- `highway_code` — arbitrary ordinal re-encoding of `highway`
  (motorway=0 … unclassified=12) → dropped in cleaning to avoid implying false order;
  `highway` retained as a true categorical.

## 4. Temporal-flag consistency (Step 4 audit)

- `day_of_week`, `month`, `is_peak_hour`, `morning_peak`, `evening_peak`:
  **0 mismatches** vs. recomputed values from `date`/`hour`.
  Peaks = {7,8,9} morning, {17,18,19} evening — but note only hours
  {0,3,6,7,8,9,12,15,18,21} are sampled in this dataset.
- `is_weekend`: 2,381,680 "mismatches" against an ISO Mon–Sun convention —
  **not an error**: it flags Fri(4)+Sat(5) as weekend (Egyptian work-week convention),
  which matches the observed demand dip exactly on those two days
  (mean volume ≈656 on Fri/Sat vs ≈1,550 other days). **Kept as-is.**
- Date coverage: 2024-01-01 → 2024-07-18, 200 consecutive days, no gaps;
  July is partial (18 days).

## 5. Target audit

`traffic_volume`: int, no missing/negative. min 0 · max 56,941 · mean 1,306.4 ·
median 145 · std 2,995.3 · skew 5.20 · kurtosis 42.1 · **36.8 % zeros**.
→ MAPE is mathematically inappropriate (division by zero); evaluation uses MAE/RMSE/R².

## 6. Actions taken

1. Drop `intersection_density` (constant).
2. Drop `highway_code` (redundant ordinal duplicate of `highway`).
3. Exclude `road_id` from features (identifier); keep in dataset for traceability.
4. Keep everything else; no imputation needed (0 missing cells in the entire table).

No rows deleted (0 duplicates, 0 invalid numerics found: lengths >0, speeds/lanes within
plausible sets, binary flags ∈ {0,1}).
