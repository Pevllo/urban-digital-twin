#!/usr/bin/env python3
"""
Generate Solid Waste Dataset for AI Urban Digital Twin What-If Simulator.

Sources of truth (real published rates):
- World Bank What a Waste series (global / MENA / Egypt typical MSW generation
  ~0.7–1.1 kg/capita/day for upper-middle income urban areas; composition averages).
- Literature generation factors by land-use / building type (residential, commercial,
  institutional, healthcare) expressed as kg/capita or kg/sqm or kg/bed.
- Egyptian urban context aligned with project (Cairo-centric).

All rows are DERIVED from published rates + realistic synthetic development scenarios
and temporal profiles. No fabricated collection-truck observations of specific buildings.
Target is suitable for supervised ML predicting waste generation for new developments
in the What-If simulator.
"""

from __future__ import annotations

import json
import hashlib
from pathlib import Path
from datetime import datetime, timedelta

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
DATA_RAW = ROOT / "data" / "raw"
DATA_PROC = ROOT / "data" / "processed"
CONFIG = ROOT / "config"
DOCS = ROOT / "docs"

for p in (DATA_RAW, DATA_PROC, CONFIG, DOCS):
    p.mkdir(parents=True, exist_ok=True)

RNG = np.random.default_rng(43)

# ---------------------------------------------------------------------------
# Real published base rates (kg)
# Egypt / MENA urban reference from World Bank What a Waste ~0.8–1.0 kg/c/d
# Building-type factors from SWM literature (residential, commercial, healthcare, etc.)
# ---------------------------------------------------------------------------
WASTE_RATES = {
    "residential_compound": {
        "driver": "num_residents",
        "base_kg_per_capita_day": 0.85,   # World Bank Egypt/MENA urban mid
        "alt_driver": "num_units",
        "alt_kg_per_unit_day": 2.2,
        "min_kg": 0.4,
        "max_kg": 1.6,
        "composition": {  # typical residential fractions (sum≈1)
            "organic": 0.55,
            "paper_cardboard": 0.12,
            "plastic": 0.12,
            "glass": 0.04,
            "metal": 0.03,
            "other": 0.14,
        },
    },
    "hospital": {
        "driver": "num_beds",
        "base_kg_per_capita_day": 2.5,    # healthcare higher (general + infectious streams)
        "alt_driver": "staff_count",
        "alt_kg_per_unit_day": 0.6,
        "min_kg": 1.0,
        "max_kg": 5.0,
        "composition": {
            "organic": 0.25,
            "paper_cardboard": 0.15,
            "plastic": 0.20,
            "glass": 0.05,
            "metal": 0.05,
            "other": 0.30,  # includes medical/infectious fraction (aggregated)
        },
    },
    "mall": {
        "driver": "gross_leasable_area_sqm",
        "base_kg_per_capita_day": 0.025,  # kg/sqm GLA/day (commercial literature)
        "alt_driver": "visitor_capacity",
        "alt_kg_per_unit_day": 0.08,
        "min_kg": 0.008,
        "max_kg": 0.06,
        "composition": {
            "organic": 0.35,
            "paper_cardboard": 0.25,
            "plastic": 0.20,
            "glass": 0.05,
            "metal": 0.03,
            "other": 0.12,
        },
    },
    "school": {
        "driver": "num_students",
        "base_kg_per_capita_day": 0.25,   # institutional
        "alt_driver": "staff_count",
        "alt_kg_per_unit_day": 0.4,
        "min_kg": 0.1,
        "max_kg": 0.6,
        "composition": {
            "organic": 0.40,
            "paper_cardboard": 0.30,
            "plastic": 0.12,
            "glass": 0.03,
            "metal": 0.02,
            "other": 0.13,
        },
    },
    "office": {
        "driver": "num_employees",
        "base_kg_per_capita_day": 0.45,
        "alt_driver": "gross_floor_area_sqm",
        "alt_kg_per_unit_day": 0.015,
        "min_kg": 0.15,
        "max_kg": 1.0,
        "composition": {
            "organic": 0.20,
            "paper_cardboard": 0.40,
            "plastic": 0.15,
            "glass": 0.05,
            "metal": 0.05,
            "other": 0.15,
        },
    },
}

# Weekly profile (generation higher mid-week for offices/schools; weekend higher residential/mall)
# Daily fractions relative to mean; applied then normalized per week if needed
DOW_FACTOR = {
    "residential_compound": np.array([0.95, 0.95, 0.95, 0.95, 1.00, 1.15, 1.10]),
    "hospital": np.array([1.05, 1.05, 1.05, 1.05, 1.00, 0.90, 0.90]),
    "mall": np.array([0.90, 0.90, 0.95, 1.00, 1.10, 1.25, 1.15]),
    "school": np.array([1.15, 1.15, 1.15, 1.15, 1.10, 0.20, 0.10]),
    "office": np.array([1.15, 1.15, 1.15, 1.15, 1.05, 0.25, 0.15]),
}


def _sample_properties(dev_type: str) -> dict:
    if dev_type == "residential_compound":
        n_units = int(RNG.integers(20, 400))
        residents_per_unit = RNG.uniform(2.2, 3.5)
        return {
            "num_units": float(n_units),
            "num_residents": float(round(n_units * residents_per_unit)),
            "gross_floor_area_sqm": float(n_units * RNG.uniform(90, 140)),
            "floors": int(RNG.integers(3, 18)),
        }
    if dev_type == "hospital":
        beds = int(RNG.integers(50, 600))
        staff = int(beds * RNG.uniform(1.5, 3.0))
        return {
            "num_beds": float(beds),
            "staff_count": float(staff),
            "gross_floor_area_sqm": float(beds * RNG.uniform(40, 80)),
            "floors": int(RNG.integers(3, 12)),
        }
    if dev_type == "mall":
        gla = float(RNG.integers(5000, 80000))
        visitors = int(gla * RNG.uniform(0.3, 1.2))
        return {
            "gross_leasable_area_sqm": gla,
            "visitor_capacity": float(visitors),
            "gross_floor_area_sqm": gla * RNG.uniform(1.1, 1.4),
            "floors": int(RNG.integers(2, 6)),
        }
    if dev_type == "school":
        students = int(RNG.integers(200, 2500))
        staff = int(students * RNG.uniform(0.06, 0.12))
        return {
            "num_students": float(students),
            "staff_count": float(staff),
            "gross_floor_area_sqm": float(students * RNG.uniform(4, 10)),
            "floors": int(RNG.integers(2, 5)),
        }
    if dev_type == "office":
        employees = int(RNG.integers(50, 2000))
        return {
            "num_employees": float(employees),
            "gross_floor_area_sqm": float(employees * RNG.uniform(12, 25)),
            "floors": int(RNG.integers(4, 30)),
        }
    raise ValueError(dev_type)


def compute_daily_waste(dev_type: str, props: dict, dow: int) -> tuple[float, dict]:
    cfg = WASTE_RATES[dev_type]
    driver = cfg["driver"]
    base = cfg["base_kg_per_capita_day"]
    value = float(props.get(driver, 0) or 0)
    if value <= 0:
        alt = cfg["alt_driver"]
        value = float(props.get(alt, 0) or 0)
        base = cfg["alt_kg_per_unit_day"]

    daily = value * base
    daily *= float(DOW_FACTOR[dev_type][dow])
    noise = RNG.uniform(0.80, 1.20)
    daily *= noise
    min_d = value * cfg["min_kg"] * 0.6
    max_d = value * cfg["max_kg"] * 1.4
    daily = float(np.clip(daily, min_d, max_d))

    # Composition amounts (kg)
    comp = {k: round(daily * v, 3) for k, v in cfg["composition"].items()}
    return daily, comp


def generate_dataset(n_developments: int = 120, days_per_dev: int = 60) -> pd.DataFrame:
    """Daily resolution (waste usually collected daily); still supports What-If by type/size."""
    rows = []
    start_date = datetime(2024, 1, 1)
    dev_types = list(WASTE_RATES.keys())

    for i in range(n_developments):
        dev_type = dev_types[i % len(dev_types)]
        props = _sample_properties(dev_type)
        zone_id = f"Z{RNG.integers(1, 25):02d}"
        dev_id = f"SW-{dev_type[:3].upper()}-{i:04d}"
        name = f"{dev_type.replace('_', ' ').title()} {i+1}"

        day_offset = int(RNG.integers(0, 365 - days_per_dev))
        for d in range(days_per_dev):
            dt = start_date + timedelta(days=day_offset + d)
            dow = dt.weekday()
            daily_kg, comp = compute_daily_waste(dev_type, props, dow)

            rows.append({
                "record_id": f"{dev_id}-{dt.strftime('%Y%m%d')}",
                "development_id": dev_id,
                "development_type": dev_type,
                "zone_id": zone_id,
                "name": name,
                "date": dt.strftime("%Y-%m-%d"),
                "year": dt.year,
                "month": dt.month,
                "day": dt.day,
                "day_of_week": dow,
                "is_weekend": int(dow >= 5),
                "num_residents": props.get("num_residents", 0.0),
                "num_units": props.get("num_units", 0.0),
                "num_beds": props.get("num_beds", 0.0),
                "staff_count": props.get("staff_count", 0.0),
                "num_students": props.get("num_students", 0.0),
                "num_employees": props.get("num_employees", 0.0),
                "gross_leasable_area_sqm": props.get("gross_leasable_area_sqm", 0.0),
                "visitor_capacity": props.get("visitor_capacity", 0.0),
                "gross_floor_area_sqm": props.get("gross_floor_area_sqm", 0.0),
                "floors": props.get("floors", 1),
                "waste_generation_kg": round(daily_kg, 3),
                "waste_generation_tonnes": round(daily_kg / 1000.0, 5),
                "organic_kg": comp["organic"],
                "paper_cardboard_kg": comp["paper_cardboard"],
                "plastic_kg": comp["plastic"],
                "glass_kg": comp["glass"],
                "metal_kg": comp["metal"],
                "other_kg": comp["other"],
                "data_origin": "derived",
            })

    return pd.DataFrame(rows)


def add_engineered_features(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df["dow_sin"] = np.sin(2 * np.pi * df["day_of_week"] / 7.0)
    df["dow_cos"] = np.cos(2 * np.pi * df["day_of_week"] / 7.0)
    df["month_sin"] = np.sin(2 * np.pi * (df["month"] - 1) / 12.0)
    df["month_cos"] = np.cos(2 * np.pi * (df["month"] - 1) / 12.0)

    for col in ["num_residents", "num_beds", "num_students", "num_employees",
                "gross_leasable_area_sqm", "gross_floor_area_sqm"]:
        df[f"log1p_{col}"] = np.log1p(df[col].astype(float))

    # Primary activity intensity proxy
    df["activity_intensity"] = (
        df["log1p_num_residents"] + df["log1p_num_beds"] +
        df["log1p_num_students"] + df["log1p_num_employees"] +
        df["log1p_gross_leasable_area_sqm"]
    )
    return df


def main():
    print("Generating solid waste dataset...")
    df = generate_dataset(n_developments=150, days_per_dev=56)
    print(f"Raw rows: {len(df)}")
    df = add_engineered_features(df)

    rates_path = CONFIG / "solid_waste_rates.json"
    with open(rates_path, "w") as f:
        json.dump({
            "_meta": {
                "description": "Base solid waste generation rates used for derived dataset.",
                "sources": [
                    "World Bank What a Waste 2.0 / 3.0 (Egypt/MENA urban kg/capita/day)",
                    "Published land-use specific generation factors (residential, commercial, healthcare, institutional)",
                ],
                "note": "All observations are DERIVED; not direct weighbridge or collection records of named facilities.",
            },
            "rates": WASTE_RATES,
        }, f, indent=2)

    out_csv = DATA_PROC / "solid_waste_dataset.csv"
    df.to_csv(out_csv, index=False)
    print(f"Saved: {out_csv}  shape={df.shape}")
    print(df.groupby("development_type")["waste_generation_kg"].agg(["count", "mean", "std"]).round(2))
    print("Target: waste_generation_kg (also waste_generation_tonnes + composition columns)")
    print("Columns:", list(df.columns))
    h = hashlib.sha256(out_csv.read_bytes()).hexdigest()[:16]
    print(f"SHA256 (first 16): {h}")


if __name__ == "__main__":
    main()
