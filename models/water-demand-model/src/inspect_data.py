"""Comprehensive data inspection for Water Demand dataset."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

import numpy as np
import pandas as pd
from config import DATA_RAW, REPORTS_DIR, TARGET, TARGET_LITERS, SEED

np.random.seed(SEED)


def inspect():
    df = pd.read_csv(DATA_RAW)
    lines = []

    def p(s=""):
        lines.append(str(s))

    p("=" * 70)
    p("WATER DEMAND DATASET — COMPREHENSIVE INSPECTION")
    p("=" * 70)

    p(f"\nShape: {df.shape[0]:,} rows x {df.shape[1]} columns")
    p(f"\nColumns ({len(df.columns)}):")
    for i, col in enumerate(df.columns):
        p(f"  {i:2d}. {col:40s} dtype={df[col].dtype}")

    p("\n--- Missing Values ---")
    missing = df.isnull().sum()
    p(f"Total missing: {missing.sum()}")
    if missing.sum() > 0:
        p(missing[missing > 0].to_string())

    p("\n--- Duplicates ---")
    p(f"Full row duplicates: {df.duplicated().sum()}")
    p(f"record_id duplicates: {df['record_id'].duplicated().sum()}")

    p("\n--- Data Types ---")
    p(df.dtypes.to_string())

    p("\n--- Numeric Summary ---")
    numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
    p(df[numeric_cols].describe().round(4).to_string())

    p("\n--- Target Variable: water_demand_m3 ---")
    target = df[TARGET]
    p(f"  Min:     {target.min():.4f}")
    p(f"  Max:     {target.max():.4f}")
    p(f"  Mean:    {target.mean():.4f}")
    p(f"  Median:  {target.median():.4f}")
    p(f"  Std:     {target.std():.4f}")
    p(f"  Skew:    {target.skew():.4f}")
    p(f"  Kurt:    {target.kurtosis():.4f}")
    p(f"  Zeros:   {(target == 0).sum()} ({(target == 0).mean()*100:.2f}%)")
    p(f"  Neg:     {(target < 0).sum()}")
    p(f"  P1:      {target.quantile(0.01):.4f}")
    p(f"  P5:      {target.quantile(0.05):.4f}")
    p(f"  P25:     {target.quantile(0.25):.4f}")
    p(f"  P50:     {target.quantile(0.50):.4f}")
    p(f"  P75:     {target.quantile(0.75):.4f}")
    p(f"  P95:     {target.quantile(0.95):.4f}")
    p(f"  P99:     {target.quantile(0.99):.4f}")

    p("\n--- Leakage Check ---")
    p(f"  water_demand_liters corr with water_demand_m3: {df[TARGET_LITERS].corr(df[TARGET]):.6f}")
    p(f"  water_demand_liters == water_demand_m3 * 1000: {(abs(df[TARGET_LITERS] - df[TARGET]*1000) < 0.01).all()}")

    p("\n--- Categorical Columns ---")
    cat_cols = df.select_dtypes(include=["object"]).columns.tolist()
    for col in cat_cols:
        nuniq = df[col].nunique()
        p(f"\n  {col}: {nuniq} unique")
        if nuniq < 30:
            vc = df[col].value_counts()
            for val, cnt in vc.items():
                p(f"    {val}: {cnt}")

    p("\n--- DateTime Analysis ---")
    df["_date"] = pd.to_datetime(df["date"])
    p(f"  Date range: {df['_date'].min()} to {df['_date'].max()}")
    p(f"  Unique dates: {df['_date'].nunique()}")
    p(f"  Unique hours: {df['hour'].nunique()} (range {df['hour'].min()}-{df['hour'].max()})")
    p(f"  Records per dev: {df.groupby(['development_id', '_date']).size().min()}")
    p(f"  Days per dev: {df.groupby('development_id')['_date'].nunique().describe().to_string()}")
    p(f"  Unique developments: {df['development_id'].nunique()}")
    p(f"  Unique zones: {df['zone_id'].nunique()}")
    df.drop("_date", axis=1, inplace=True)

    p("\n--- Hourly Demand Pattern ---")
    hourly = df.groupby("hour")[TARGET].agg(["mean", "std", "min", "max", "median"])
    p(hourly.round(3).to_string())

    p("\n--- Daily of Week Pattern ---")
    dow = df.groupby("day_of_week")[TARGET].agg(["mean", "std", "count"])
    p(dow.round(3).to_string())

    p("\n--- Monthly Pattern ---")
    monthly = df.groupby("month")[TARGET].agg(["mean", "std", "count"])
    p(monthly.round(3).to_string())

    p("\n--- Weekend vs Weekday ---")
    we = df.groupby("is_weekend")[TARGET].agg(["mean", "std", "count"])
    p(we.round(3).to_string())

    p("\n--- Development Type Distribution ---")
    dt = df.groupby("development_type")[TARGET].agg(["mean", "std", "min", "median", "max", "count"])
    p(dt.round(3).to_string())

    p("\n--- Top Correlations with Target ---")
    corr = df[numeric_cols].corr()[TARGET].drop(TARGET).sort_values(ascending=False)
    for feat, val in corr.items():
        p(f"  {feat:40s} {val:+.4f}")

    p("\n--- Correlation Matrix (top features) ---")
    top_feats = corr.abs().head(8).index.tolist()
    top_feats.append(TARGET)
    cmat = df[top_feats].corr().round(3)
    p(cmat.to_string())

    p("\n--- Records per Development ---")
    recs = df.groupby("development_id").size()
    p(f"  Min: {recs.min()}, Max: {recs.max()}, Mean: {recs.mean():.1f}, Std: {recs.std():.1f}")

    p("\n--- Zone Distribution ---")
    zd = df.groupby("zone_id")[TARGET].agg(["mean", "count"]).sort_values("mean", ascending=False)
    p(zd.round(3).to_string())

    p("\n--- Temperature Stats ---")
    t = df["temperature_c"]
    p(f"  Min: {t.min():.1f}, Max: {t.max():.1f}, Mean: {t.mean():.1f}, Std: {t.std():.1f}")

    p("\n--- Type x Hour Interaction ---")
    th = df.groupby(["development_type", "hour"])[TARGET].mean().unstack(level=0).round(2)
    p(th.to_string())

    report = "\n".join(lines)
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    (REPORTS_DIR / "data_inspection.txt").write_text(report, encoding="utf-8")
    print(report)
    return df


if __name__ == "__main__":
    inspect()
