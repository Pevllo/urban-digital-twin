#!/usr/bin/env python3
"""Validation checks for solid_waste_dataset.csv"""
from pathlib import Path
import pandas as pd
import sys

CSV = Path(__file__).resolve().parents[1] / "data" / "processed" / "solid_waste_dataset.csv"
EXPECTED_TYPES = {"residential_compound", "hospital", "mall", "school", "office"}
TARGET = "waste_generation_kg"
COMP_COLS = ["organic_kg", "paper_cardboard_kg", "plastic_kg", "glass_kg", "metal_kg", "other_kg"]

def main():
    assert CSV.exists(), f"Missing {CSV}"
    df = pd.read_csv(CSV)
    print(f"Shape: {df.shape[0]} rows × {df.shape[1]} columns")

    errors = []
    if TARGET not in df.columns:
        errors.append(f"Missing target {TARGET}")
    if df[TARGET].isna().any() or (df[TARGET] < 0).any():
        errors.append("Invalid target values")
    if set(df["development_type"].unique()) != EXPECTED_TYPES:
        errors.append("Unexpected development types")
    if not (df["data_origin"] == "derived").all():
        errors.append("data_origin not all derived")

    # Composition should approximately sum to total
    comp_sum = df[COMP_COLS].sum(axis=1)
    rel_err = (comp_sum - df[TARGET]).abs() / df[TARGET].clip(lower=1e-6)
    if (rel_err > 0.02).mean() > 0.05:
        errors.append("Composition does not sum to total within 2% for >5% of rows")

    for t in EXPECTED_TYPES:
        sub = df[df["development_type"] == t]
        if t == "residential_compound":
            corr = sub["num_residents"].corr(sub[TARGET])
        elif t == "hospital":
            corr = sub["num_beds"].corr(sub[TARGET])
        elif t == "mall":
            corr = sub["gross_leasable_area_sqm"].corr(sub[TARGET])
        elif t == "school":
            corr = sub["num_students"].corr(sub[TARGET])
        else:
            corr = sub["num_employees"].corr(sub[TARGET])
        if corr < 0.3:
            errors.append(f"Weak correlation for {t}: {corr:.3f}")

    print("Target stats:")
    print(df[TARGET].describe().round(2))
    print("\nBy type (mean kg/day):")
    print(df.groupby("development_type")[TARGET].mean().round(2))

    if errors:
        print("\nVALIDATION FAILED:")
        for e in errors:
            print(" -", e)
        sys.exit(1)
    print("\nVALIDATION PASSED")
    return 0

if __name__ == "__main__":
    main()
