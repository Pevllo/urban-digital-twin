#!/usr/bin/env python3
"""Comprehensive dataset inspection."""
import pandas as pd
import numpy as np
import json
from pathlib import Path

CSV = Path(r"C:\Users\PC\OneDrive\Desktop\ACUD Intern\Water Demand Model\solid-waste-extracted\solid-waste-model\data\raw\solid_waste_dataset.csv")

df = pd.read_csv(CSV)

print("=" * 60)
print("DATASET INSPECTION")
print("=" * 60)
print(f"\nShape: {df.shape}")
print(f"\nColumns ({len(df.columns)}):")
for i, c in enumerate(df.columns):
    print(f"  {i}: {c} -> {df[c].dtype}")

print(f"\nHead (3 rows):")
print(df.head(3).to_string())

print(f"\n\nNull counts:")
print(df.isnull().sum()[df.isnull().sum() > 0])
if df.isnull().sum().sum() == 0:
    print("  (none)")

print(f"\nDuplicated rows: {df.duplicated().sum()}")

print(f"\nUnique development types: {df['development_type'].unique()}")
print(f"Unique zone IDs: {df['zone_id'].unique()}")
print(f"N unique development IDs: {df['development_id'].nunique()}")
print(f"N unique zones: {df['zone_id'].nunique()}")

print(f"\nDate range: {df['date'].min()} to {df['date'].max()}")
print(f"Unique dates: {df['date'].nunique()}")

# Check data_quality vs data_origin
for col in ['data_quality', 'data_origin']:
    if col in df.columns:
        print(f"\n{col} values: {df[col].unique()}")
    else:
        print(f"\n{col}: NOT PRESENT")

print(f"\n--- TARGET: waste_generation_kg ---")
print(df['waste_generation_kg'].describe())

print(f"\n--- Development type distribution ---")
print(df['development_type'].value_counts())

print(f"\n--- Rows per development ---")
rows_per_dev = df.groupby('development_id').size()
print(rows_per_dev.describe())

print(f"\n--- Date range per development_type ---")
for dt in df['development_type'].unique():
    sub = df[df['development_type'] == dt]
    print(f"  {dt}: {sub['date'].min()} to {sub['date'].max()}, {sub['development_id'].nunique()} devs")

print(f"\n--- Composition columns sum check ---")
comp_cols = [c for c in df.columns if c.endswith('_kg') and c != 'waste_generation_kg']
print(f"Composition cols: {comp_cols}")
for c in comp_cols:
    if c in df.columns:
        print(f"  {c}: min={df[c].min():.4f}, max={df[c].max():.4f}, mean={df[c].mean():.4f}")

# Check if waste_generation_kg = sum of composition cols
comp_present = [c for c in ['waste_organic_kg', 'waste_paper_cardboard_kg', 'waste_plastic_kg', 
                              'waste_glass_kg', 'waste_metal_kg', 'waste_other_kg'] if c in df.columns]
if not comp_present:
    comp_present = [c for c in comp_cols if 'waste_generation' not in c and 'waste_general' not in c and 'waste_infectious' not in c]
    
if comp_present:
    df['_comp_sum'] = df[comp_present].sum(axis=1)
    diff = (df['waste_generation_kg'] - df['_comp_sum']).abs()
    print(f"\n  waste_generation_kg vs sum({comp_present}):")
    print(f"  Max abs diff: {diff.max():.6f}")
    print(f"  Mean abs diff: {diff.mean():.6f}")
    df.drop('_comp_sum', axis=1, inplace=True)

print(f"\n--- Numerical feature distributions ---")
num_cols = df.select_dtypes(include=[np.number]).columns.tolist()
for c in num_cols:
    print(f"  {c}: min={df[c].min():.4f}, max={df[c].max():.4f}, mean={df[c].mean():.4f}, std={df[c].std():.4f}")

print(f"\n--- Correlation with target (waste_generation_kg) ---")
corr = df[num_cols].corr()['waste_generation_kg'].sort_values(ascending=False)
print(corr.to_string())

print(f"\n--- Statistical formula investigation ---")
# Check: waste_generation_kg = driver_value * base_rate * dow_factor * noise
for dt in df['development_type'].unique():
    sub = df[df['development_type'] == dt].head(10)
    print(f"\n  {dt}:")
    print(f"    waste_generation_kg range: {sub['waste_generation_kg'].min():.2f} - {sub['waste_generation_kg'].max():.2f}")
    for c in num_cols:
        if sub[c].std() > 0 and c != 'waste_generation_kg':
            r = sub['waste_generation_kg'].corr(sub[c])
            if abs(r) > 0.9:
                print(f"    HIGH corr with {c}: {r:.4f}")

print("\nDone.")
