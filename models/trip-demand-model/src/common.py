"""Shared constants/helpers for the training pipeline."""
from __future__ import annotations

import time
from pathlib import Path

SEED = 42
DATA_PATH = Path("data/processed/traffic_ml_clean.parquet")
META_PATH = Path("data/processed/feature_metadata.json")
PLOTS_DIR = Path("reports/plots")
MODELS_DIR = Path("models")


def log(msg: str) -> None:
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)
