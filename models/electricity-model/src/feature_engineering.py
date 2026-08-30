"""
Feature engineering for BDG2 electricity prediction.

Extracted from electricity_model/src/train_step5.py for integration into Urban Digital Twin.
"""

from __future__ import annotations

import numpy as np
import pandas as pd


def add_engineered_features_step5(df: pd.DataFrame) -> pd.DataFrame:
    """Add log_sqm, cyclical time encodings, degree-days, non-linearities, and interactions."""
    df = df.copy()

    # 1. Log floor area
    if "sqm" in df.columns:
        sqm_clean = np.maximum(0.0, df["sqm"].astype(float))
        df["log_sqm"] = np.log1p(sqm_clean)

    # 2. Cyclical time encoding
    if "hour" in df.columns:
        hour_flt = df["hour"].astype(float)
        df["hour_sin"] = np.sin(2 * np.pi * hour_flt / 24.0)
        df["hour_cos"] = np.cos(2 * np.pi * hour_flt / 24.0)

    if "day_of_week" in df.columns:
        dow_flt = df["day_of_week"].astype(float)
        df["dow_sin"] = np.sin(2 * np.pi * dow_flt / 7.0)
        df["dow_cos"] = np.cos(2 * np.pi * dow_flt / 7.0)

    if "month" in df.columns:
        month_flt = df["month"].astype(float)
        df["month_sin"] = np.sin(2 * np.pi * (month_flt - 1) / 12.0)
        df["month_cos"] = np.cos(2 * np.pi * (month_flt - 1) / 12.0)

    # 3. Temperature non-linearities
    if "airTemperature" in df.columns:
        temp = df["airTemperature"].astype(float)
        df["cooling_degree"] = np.maximum(0.0, temp - 22.0)
        df["heating_degree"] = np.maximum(0.0, 18.0 - temp)
        df["temperature_squared"] = temp ** 2

    # 4. Explicit Interaction: log_sqm * cooling_degree
    if "log_sqm" in df.columns and "cooling_degree" in df.columns:
        df["sqm_x_cooling"] = df["log_sqm"] * df["cooling_degree"]

    return df
