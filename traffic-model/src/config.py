"""
Central configuration for the traffic_model project.

All tunable parameters live here so that every stage (OSM loading,
feature extraction, synthetic traffic generation, model training)
is reproducible and configurable from one place.

Paths are RELATIVE to the project root - no absolute paths anywhere.
"""

from pathlib import Path

# ---------------------------------------------------------------------------
# Project structure (relative paths only)
# ---------------------------------------------------------------------------
PROJECT_ROOT = Path(__file__).resolve().parents[1]

DATA_DIR = PROJECT_ROOT / "data"
RAW_OSM_DIR = DATA_DIR / "raw" / "osm"
RAW_TRAFFIC_DIR = DATA_DIR / "raw" / "traffic"
PROCESSED_DIR = DATA_DIR / "processed"
FEATURES_DIR = DATA_DIR / "features"

MODELS_DIR = PROJECT_ROOT / "models"
REPORTS_DIR = PROJECT_ROOT / "reports"
FIGURES_DIR = REPORTS_DIR / "figures"

for _d in (PROCESSED_DIR, FEATURES_DIR, MODELS_DIR, REPORTS_DIR, FIGURES_DIR):
    _d.mkdir(parents=True, exist_ok=True)

# ---------------------------------------------------------------------------
# Reproducibility
# ---------------------------------------------------------------------------
RANDOM_SEED = 42

# ---------------------------------------------------------------------------
# Synthetic-data generation period
# ---------------------------------------------------------------------------
START_DATE = "2026-01-05"          # a Monday
NUM_DAYS = 30                      # 30 days x 24 hourly observations = 720 rows/road

# ---------------------------------------------------------------------------
# Peak-hour assumptions for the NAC study area (CONFIGURABLE, not measured).
# Morning peak 07:00-09:59 inclusive, evening peak 16:00-19:59 inclusive.
# ---------------------------------------------------------------------------
MORNING_PEAK_HOURS = (7, 10)       # [start, end)
EVENING_PEAK_HOURS = (16, 20)      # [start, end)

# ---------------------------------------------------------------------------
# Hourly temporal demand profile (multiplicative factors around 1.0).
# Derived from typical metropolitan commute patterns; NOT measured NAC data.
# ---------------------------------------------------------------------------
HOURLY_PROFILE_WEEKDAY = {
    0: 0.25, 1: 0.18, 2: 0.14, 3: 0.12, 4: 0.15, 5: 0.30,
    6: 0.65, 7: 1.15, 8: 1.45, 9: 1.20, 10: 1.00, 11: 0.95,
    12: 1.05, 13: 1.00, 14: 0.95, 15: 1.05, 16: 1.35, 17: 1.50,
    18: 1.30, 19: 0.95, 20: 0.70, 21: 0.55, 22: 0.45, 23: 0.32,
}
HOURLY_PROFILE_WEEKEND = {
    0: 0.40, 1: 0.30, 2: 0.22, 3: 0.16, 4: 0.15, 5: 0.25,
    6: 0.45, 7: 0.60, 8: 0.80, 9: 1.00, 10: 1.15, 11: 1.25,
    12: 1.30, 13: 1.25, 14: 1.20, 15: 1.15, 16: 1.20, 17: 1.25,
    18: 1.20, 19: 1.05, 20: 0.90, 21: 0.80, 22: 0.70, 23: 0.50,
}

# In Egypt the weekend is Friday-Saturday (not Saturday-Sunday).
WEEKEND_DAYS = (4, 5)              # Monday=0 ... Friday=4, Saturday=5
WEEKEND_DEMAND_FACTOR = 0.85       # overall weekend demand vs weekday

# ---------------------------------------------------------------------------
# Base demand (veh/h) entering the synthetic generation model.
# ---------------------------------------------------------------------------
BASE_DEMAND = 300.0

# ---------------------------------------------------------------------------
# Road-class demand multipliers keyed by OSM 'highway' value.
# Values reflect the intuitive hierarchy: bigger roads carry more traffic.
# Classes absent from the data simply never get used.
# ---------------------------------------------------------------------------
ROAD_CLASS_FACTORS = {
    "motorway":        5.00,
    "motorway_link":   2.80,
    "trunk":           4.20,
    "trunk_link":      2.40,
    "primary":         3.40,
    "primary_link":    2.00,
    "secondary":       2.60,
    "secondary_link":  1.60,
    "tertiary":        2.00,
    "tertiary_link":   1.30,
    "unclassified":    1.10,
    "residential":     0.85,
    "living_street":   0.60,
    "service":         0.45,
}
UNKNOWN_CLASS_FACTOR = 1.00        # fallback for unexpected highway values

# ---------------------------------------------------------------------------
# Lane-count multiplier: demand grows sub-linearly with lanes (congestion
# dilutes per-lane throughput at the demand level), capped for sanity.
# ---------------------------------------------------------------------------
LANE_FACTORS = {1: 0.75, 2: 1.00, 3: 1.25, 4: 1.45, 5: 1.60, 6: 1.70}
DEFAULT_LANE_FACTOR = 1.00
MAX_LANES_PLAUSIBLE = 8            # lane counts above this are treated as data errors

# ---------------------------------------------------------------------------
# Connectivity multiplier: intersections indicate through-traffic potential.
# ---------------------------------------------------------------------------
CONNECTIVITY_FACTOR_MAX = 1.35
CONNECTIVITY_FACTOR_MIN = 0.85

# ---------------------------------------------------------------------------
# Speed influence multiplier (higher design speed -> more through traffic).
# ---------------------------------------------------------------------------
SPEED_FACTOR_MIN = 0.80
SPEED_FACTOR_MAX = 1.25
DEFAULT_SPEED_LIMIT = 50           # used when maxspeed is missing (urban default)

# ---------------------------------------------------------------------------
# Capacity proxy methodology:
#   capacity_proxy = effective_lanes x base_capacity_by_class x adjustments
# base_capacity_by_class is saturated flow per lane (veh/h/lane),
# typical HCM-style planning values scaled down for mixed urban traffic.
# THIS IS A PROXY, NOT MEASURED CAPACITY.
# ---------------------------------------------------------------------------
BASE_CAPACITY_PER_LANE = {
    "motorway":        2200,
    "motorway_link":   1600,
    "trunk":           2000,
    "trunk_link":      1500,
    "primary":         1800,
    "primary_link":    1400,
    "secondary":       1500,
    "secondary_link":  1200,
    "tertiary":        1200,
    "tertiary_link":   1000,
    "unclassified":     900,
    "residential":      800,
    "living_street":    600,
    "service":          500,
}
DEFAULT_CAPACITY_PER_LANE = 800
ONEWAY_CAPACITY_BONUS = 1.15       # one-way operation raises effective capacity
BRIDGE_TUNNEL_CAPACITY_PENALTY = 0.95
CAPACITY_JUNCTION_PENALTY = 0.90   # signalised/junction-heavy segments lose capacity

# ---------------------------------------------------------------------------
# Noise model (bounded, multiplicative log-normal variation).
# ---------------------------------------------------------------------------
NOISE_SIGMA = 0.12                 # std of log-noise (~ +/-12% typical)
NOISE_CLIP_MIN = 0.0               # traffic volume can never be negative

# Daily (day-of-month) shared variation across the whole network.
DAILY_VARIATION_SCALE = 0.08

# Rare special-event days: whole-network surge or drop.
SPECIAL_EVENT_DAY_PROBABILITY = 0.07
SPECIAL_EVENT_FACTOR_RANGE = (0.65, 1.35)

# ---------------------------------------------------------------------------
# Spatial correlation: traffic on each road inherits part of its level from
# neighbouring roads in the OSM network graph.
# ---------------------------------------------------------------------------
SPATIAL_INFLUENCE_STRENGTH = 0.35  # 0 = independent roads, 1 = fully coupled
SPATIAL_INFLUENCE_ITERATIONS = 2   # smoothing passes over the road graph

# ---------------------------------------------------------------------------
# Physical plausibility bounds for generated traffic_volume (veh/h).
# ---------------------------------------------------------------------------
MAX_TRAFFIC_PER_ROAD = 12000       # hard ceiling for any single observation
MIN_TRAFFIC_FLOOR = 0

# ---------------------------------------------------------------------------
# Coordinate reference systems
# ---------------------------------------------------------------------------
CRS_WGS84 = "EPSG:4326"
CRS_METRIC = "EPSG:32636"          # UTM 36N - metric CRS covering ~31.75E (NAC)

# ---------------------------------------------------------------------------
# Output files
# ---------------------------------------------------------------------------
OSM_ROADS_GPKG = PROCESSED_DIR / "osm_roads.gpkg"
SYNTHETIC_TRAFFIC_CSV = PROCESSED_DIR / "synthetic_traffic.csv"
SYNTHETIC_TRAFFIC_GPKG = PROCESSED_DIR / "synthetic_traffic.gpkg"
VALIDATION_CSV = REPORTS_DIR / "synthetic_data_validation.csv"
SYNTH_REPORT_MD = REPORTS_DIR / "synthetic_data_report.md"
MODEL_ARTIFACTS = MODELS_DIR / "traffic_xgb_model.joblib"
