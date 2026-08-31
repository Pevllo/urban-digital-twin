"""Shared constants for Water Demand Model."""
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DATA_RAW = PROJECT_ROOT / "data" / "raw" / "water_demand_dataset.csv"
DATA_PROCESSED = PROJECT_ROOT / "data" / "processed"
MODELS_DIR = PROJECT_ROOT / "models"
REPORTS_DIR = PROJECT_ROOT / "reports"
FIGURES_DIR = REPORTS_DIR / "figures"

SEED = 42
TARGET = "water_demand_m3"
TARGET_LITERS = "water_demand_liters"

LEAKAGE_COLUMNS = [TARGET_LITERS]
IDENTIFIER_COLUMNS = ["record_id", "development_id", "name", "data_origin"]
DATE_COLUMN = "date"

CATEGORICAL_FEATURES = ["development_type", "zone_id"]
NUMERICAL_FEATURES = [
    "hour", "month", "day_of_week", "is_weekend",
    "temperature_c",
    "num_residents", "num_units", "num_beds", "staff_count",
    "num_students", "num_employees",
    "gross_leasable_area_sqm", "visitor_capacity",
    "gross_floor_area_sqm", "floors",
]
CYCLICAL_FEATURES = ["hour_sin", "hour_cos", "dow_sin", "dow_cos", "month_sin", "month_cos"]
ENGINEERED_NUMERICAL = ["cooling_degree", "heating_degree", "activity_x_cooling",
                        "log1p_num_residents", "log1p_num_beds", "log1p_num_students",
                        "log1p_num_employees", "log1p_gross_leasable_area_sqm",
                        "log1p_gross_floor_area_sqm"]

SPLIT_DATES = {
    "train": ("2024-01-01", "2024-08-31"),
    "validation": ("2024-09-01", "2024-10-31"),
    "test": ("2024-11-01", "2024-12-26"),
}

DEVELOPMENT_TYPES = ["residential_compound", "hospital", "mall", "school", "office"]
