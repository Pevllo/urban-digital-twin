"""
Feature engineering and preprocessing for Water Demand prediction.

Drops leakage, creates domain-driven features, handles temporal structure.
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))

import numpy as np
import pandas as pd
from config import (
    TARGET, LEAKAGE_COLUMNS, IDENTIFIER_COLUMNS, DATE_COLUMN,
    CATEGORICAL_FEATURES, SPLIT_DATES, DEVELOPMENT_TYPES, SEED
)

np.random.seed(SEED)


def load_raw(path: str = None) -> pd.DataFrame:
    """Load raw CSV and parse dates."""
    from config import DATA_RAW
    p = Path(path) if path else DATA_RAW
    df = pd.read_csv(p)
    df[DATE_COLUMN] = pd.to_datetime(df[DATE_COLUMN])
    return df


def drop_leakage_and_identifiers(df: pd.DataFrame) -> pd.DataFrame:
    """Remove target-leaking and identifier columns."""
    cols_to_drop = LEAKAGE_COLUMNS + IDENTIFIER_COLUMNS
    cols_to_drop = [c for c in cols_to_drop if c in df.columns]
    return df.drop(columns=cols_to_drop)


def add_domain_features(df: pd.DataFrame) -> pd.DataFrame:
    """Add domain-driven engineered features."""
    df = df.copy()

    df["is_peak_hour_morning"] = df["hour"].isin([7, 8, 9, 10]).astype(int)
    df["is_peak_hour_evening"] = df["hour"].isin([17, 18, 19, 20]).astype(int)
    df["is_peak_hour"] = ((df["hour"] >= 7) & (df["hour"] <= 10)) | \
                          ((df["hour"] >= 17) & (df["hour"] <= 20))
    df["is_peak_hour"] = df["is_peak_hour"].astype(int)

    df["time_period"] = pd.cut(
        df["hour"],
        bins=[-1, 5, 11, 17, 23],
        labels=["night", "morning", "afternoon", "evening"]
    ).astype(str)

    df["temp_x_residents"] = df["temperature_c"] * df["num_residents"]
    df["temp_x_beds"] = df["temperature_c"] * df["num_beds"]
    df["temp_x_students"] = df["temperature_c"] * df["num_students"]
    df["temp_x_employees"] = df["temperature_c"] * df["num_employees"]
    df["temp_x_visitors"] = df["temperature_c"] * df["visitor_capacity"]

    total_pop = (df["num_residents"] + df["num_beds"] + df["num_students"] +
                 df["num_employees"] + 1)
    df["per_capita_gfa"] = df["gross_floor_area_sqm"] / total_pop
    df["per_capita_gla"] = df["gross_leasable_area_sqm"] / total_pop

    df["gfa_x_hour"] = df["log1p_gross_floor_area_sqm"] * df["hour"]
    df["gla_x_hour"] = df["log1p_gross_leasable_area_sqm"] * df["hour"]

    df["day_of_year"] = df[DATE_COLUMN].dt.dayofyear
    df["week_of_year"] = df[DATE_COLUMN].dt.isocalendar().week.astype(int)

    df["is_weekday_morning"] = ((df["is_weekend"] == 0) &
                                 (df["hour"].isin([7, 8, 9, 10]))).astype(int)
    df["is_weekday_office_hour"] = ((df["is_weekend"] == 0) &
                                     (df["hour"] >= 9) & (df["hour"] <= 17)).astype(int)

    type_dummies = pd.get_dummies(df["development_type"], prefix="type", dtype=int)
    df = pd.concat([df, type_dummies], axis=1)

    df["type_x_hour"] = df["development_type"] + "_h" + df["hour"].astype(str)
    df["type_x_is_weekend"] = df["development_type"] + "_we" + df["is_weekend"].astype(str)

    return df


def get_feature_lists():
    """Return the feature lists after engineering."""
    numeric_features = [
        "hour", "month", "day_of_week", "is_weekend",
        "temperature_c",
        "num_residents", "num_units", "num_beds", "staff_count",
        "num_students", "num_employees",
        "gross_leasable_area_sqm", "visitor_capacity",
        "gross_floor_area_sqm", "floors",
        "hour_sin", "hour_cos", "dow_sin", "dow_cos", "month_sin", "month_cos",
        "cooling_degree", "heating_degree", "activity_x_cooling",
        "log1p_num_residents", "log1p_num_beds", "log1p_num_students",
        "log1p_num_employees", "log1p_gross_leasable_area_sqm",
        "log1p_gross_floor_area_sqm",
        "is_peak_hour_morning", "is_peak_hour_evening", "is_peak_hour",
        "temp_x_residents", "temp_x_beds", "temp_x_students",
        "temp_x_employees", "temp_x_visitors",
        "per_capita_gfa", "per_capita_gla",
        "gfa_x_hour", "gla_x_hour",
        "day_of_year", "week_of_year",
        "is_weekday_morning", "is_weekday_office_hour",
    ]

    categorical_features = ["development_type", "zone_id", "time_period",
                            "type_x_hour", "type_x_is_weekend"]

    type_dummy_features = [c for c in pd.get_dummies(
        pd.Series(DEVELOPMENT_TYPES), prefix="type", dtype=int
    ).columns]

    all_numeric = numeric_features
    all_categorical = categorical_features + type_dummy_features

    return all_numeric, all_categorical


def chronological_split(df: pd.DataFrame):
    """Split data chronologically: train (Jan-Aug), val (Sep-Oct), test (Nov-Dec)."""
    splits = {}
    for name, (start, end) in SPLIT_DATES.items():
        mask = (df[DATE_COLUMN] >= start) & (df[DATE_COLUMN] <= end)
        splits[name] = df[mask].copy()
        print(f"  {name}: {mask.sum():,} rows ({start} to {end})")
    return splits


def prepare_features(df: pd.DataFrame, fit_encoders=True, encoders=None):
    """
    Prepare final feature matrix for ML models.

    Returns X (DataFrame), y (Series), encoder_info dict.
    """
    all_num, all_cat = get_feature_lists()

    available_num = [c for c in all_num if c in df.columns]
    available_cat = [c for c in all_cat if c in df.columns]

    X_num = df[available_num].copy()
    X_cat = df[available_cat].copy()

    for col in X_cat.columns:
        X_cat[col] = X_cat[col].astype(str)

    X = pd.concat([X_num, X_cat], axis=1)
    y = df[TARGET].copy()

    return X, y, {"numeric": available_num, "categorical": available_cat}


def get_model_features():
    """Return features for different model types."""
    all_num, all_cat = get_feature_lists()
    return {
        "all_numeric": all_num,
        "all_categorical": all_cat,
        "tree_numeric": all_num,
        "tree_categorical": all_cat,
    }
