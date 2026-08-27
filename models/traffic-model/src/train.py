"""
Model training for the Traffic Volume Prediction component.

Design notes
------------
- Chronological train/validation/test split (traffic is time-dependent;
  random splitting would leak the future into training).
- Historical features (lags / rolling means) are computed ONLY from
  strictly earlier timestamps of the same road segment (shift >= 1).
- Generation-audit columns (synthetic_demand_factor, daily_variation_factor,
  spatial_influence_factor, daily_factor, event_factor) are EXCLUDED from
  model features - they would leak the synthetic generation formula.
- The saved bundle contains model + preprocessing + feature list +
  metadata so the What-If simulator can reload everything reproducibly.
"""

import json
import time
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.dummy import DummyRegressor
from sklearn.ensemble import RandomForestRegressor
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_absolute_error, r2_score, root_mean_squared_error
from sklearn.model_selection import RandomizedSearchCV, TimeSeriesSplit
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder
from xgboost import XGBRegressor

import config

TARGET = "traffic_volume"

NUMERIC_FEATURES = [
    "road_length_m", "lane_count", "speed_limit_kmh",
    "is_oneway", "is_bridge", "is_tunnel",
    "road_capacity_proxy", "intersection_density",
    "node_degree", "connected_road_count",
    "hour", "day_of_week", "month", "is_weekend", "is_peak_hour",
    "hour_sin", "hour_cos", "day_sin", "day_cos",
    "traffic_volume_lag_1h", "traffic_volume_lag_2h",
    "traffic_volume_lag_24h", "traffic_volume_lag_168h",
    "rolling_mean_3h", "rolling_mean_6h", "rolling_mean_24h",
]
CATEGORICAL_FEATURES = ["road_type"]
MODEL_FEATURES = NUMERIC_FEATURES + CATEGORICAL_FEATURES

LEAKAGE_EXCLUDED = [
    "synthetic_demand_factor", "daily_variation_factor",
    "spatial_influence_factor", "daily_factor", "event_factor",
    "morning_peak", "evening_peak",          # redundant with hour; audited out
    "road_hierarchy",                        # encoded via road_type
]


# ---------------------------------------------------------------------------
# Feature engineering
# ---------------------------------------------------------------------------
def add_cyclical_time(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df["hour_sin"] = np.sin(2 * np.pi * df["hour"] / 24)
    df["hour_cos"] = np.cos(2 * np.pi * df["hour"] / 24)
    df["day_sin"] = np.sin(2 * np.pi * df["day_of_week"] / 7)
    df["day_cos"] = np.cos(2 * np.pi * df["day_of_week"] / 7)
    return df


def add_historical_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Lags and rolling means per road, using ONLY past observations.
    rolling windows are applied to shift(1) so the current hour is never
    included (strict anti-leakage).
    """
    df = df.sort_values(["road_id", "timestamp"]).copy()
    g = df.groupby("road_id", sort=False)[TARGET]
    df["traffic_volume_lag_1h"] = g.shift(1)
    df["traffic_volume_lag_2h"] = g.shift(2)
    df["traffic_volume_lag_24h"] = g.shift(24)
    df["traffic_volume_lag_168h"] = g.shift(168)
    past = g.shift(1)
    grp = past.groupby(df["road_id"], sort=False)
    df["rolling_mean_3h"] = grp.transform(lambda s: s.rolling(3).mean())
    df["rolling_mean_6h"] = grp.transform(lambda s: s.rolling(6).mean())
    df["rolling_mean_24h"] = grp.transform(lambda s: s.rolling(24).mean())
    return df


def build_features(csv_path: Path = None) -> pd.DataFrame:
    csv_path = csv_path or config.SYNTHETIC_TRAFFIC_CSV
    df = pd.read_csv(csv_path, parse_dates=["timestamp"])
    df = add_cyclical_time(df)
    df = add_historical_features(df)
    before = len(df)
    df = df.dropna(subset=[c for c in MODEL_FEATURES if "lag" in c or "rolling" in c])
    print(f"feature table: {len(df):,} usable rows "
          f"(dropped {before - len(df):,} history-warmup rows)")
    return df.reset_index(drop=True)


def chronological_splits(df: pd.DataFrame):
    """60/20/20 split of the usable timeline into TRAIN/VAL/TEST."""
    t = df["timestamp"]
    q60, q80 = t.quantile(0.60), t.quantile(0.80)
    splits = {
        "train": df[t < q60],
        "val": df[(t >= q60) & (t < q80)],
        "test": df[t >= q80],
    }
    info = {k: {"start": str(v.timestamp.min()), "end": str(v.timestamp.max()),
                "rows": len(v)} for k, v in splits.items()}
    for k, v in info.items():
        print(f"    {k}: {v['start']} .. {v['end']}  ({v['rows']:,} rows)")
    return splits, info, (q60, q80)


def build_preprocessor() -> ColumnTransformer:
    return ColumnTransformer(
        [("cat", OneHotEncoder(handle_unknown="ignore", sparse_output=False),
          CATEGORICAL_FEATURES),
         ("num", "passthrough", NUMERIC_FEATURES)])


def _pipeline(estimator) -> Pipeline:
    return Pipeline([("prep", build_preprocessor()), ("model", estimator)])


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------
def detect_device() -> str:
    """Return 'cuda' if XGBoost can actually use the GPU, else 'cpu'."""
    try:
        probe = XGBRegressor(n_estimators=1, max_depth=1, tree_method="hist",
                             device="cuda", verbosity=0)
        rng = np.random.default_rng(0)
        probe.fit(rng.random((64, 4)), rng.random(64))
        print("CUDA GPU detected -> XGBoost will train on device='cuda'")
        return "cuda"
    except Exception as exc:
        print(f"CUDA unavailable ({type(exc).__name__}) -> XGBoost on CPU")
        return "cpu"


def get_models():
    device = detect_device()
    models = {
        "mean_baseline": _pipeline(DummyRegressor(strategy="mean")),
        "linear_regression": _pipeline(LinearRegression()),
        "random_forest": _pipeline(RandomForestRegressor(
            n_estimators=120, max_depth=14, min_samples_leaf=10,
            max_features=0.5, n_jobs=-1, random_state=config.RANDOM_SEED)),
        "xgboost_tuned": None,
    }

    param_dist = {
        "model__n_estimators": [300, 500, 800],
        "model__max_depth": [4, 6, 8],
        "model__learning_rate": [0.03, 0.05, 0.08, 0.12],
        "model__subsample": [0.7, 0.85, 1.0],
        "model__colsample_bytree": [0.6, 0.8, 1.0],
        "model__min_child_weight": [1, 5, 10],
    }
    search = RandomizedSearchCV(
        _pipeline(XGBRegressor(tree_method="hist", device=device,
                               verbosity=0,
                               random_state=config.RANDOM_SEED,
                               objective="reg:squarederror")),
        param_distributions=param_dist, n_iter=15,
        cv=TimeSeriesSplit(n_splits=3), scoring="neg_mean_absolute_error",
        random_state=config.RANDOM_SEED, n_jobs=1, verbose=1,
        refit=True,
    )
    models["xgboost_tuned"] = search
    return models, device


def regression_metrics(y_true, y_pred) -> dict:
    mae = mean_absolute_error(y_true, y_pred)
    rmse = root_mean_squared_error(y_true, y_pred)
    r2 = r2_score(y_true, y_pred)
    return {"MAE": round(float(mae), 2), "RMSE": round(float(rmse), 2),
            "R2": round(float(r2), 4)}


# ---------------------------------------------------------------------------
# Main training entry point
# ---------------------------------------------------------------------------
def main():
    t0 = time.time()
    print("=== Building features ===")
    df = build_features()
    splits, split_info, _ = chronological_splits(df)

    X_train, y_train = splits["train"][MODEL_FEATURES], splits["train"][TARGET]
    X_val, y_val = splits["val"][MODEL_FEATURES], splits["val"][TARGET]
    X_test, y_test = splits["test"][MODEL_FEATURES], splits["test"][TARGET]

    print("=== Training baselines + RF ===")
    models, device = get_models()
    fitted, metrics_rows = {}, []
    for name in ["mean_baseline", "linear_regression", "random_forest"]:
        m = models[name]
        m.fit(X_train, y_train)
        val_m = regression_metrics(y_val, m.predict(X_val))
        test_m = regression_metrics(y_test, m.predict(X_test))
        fitted[name] = m
        metrics_rows.append({"model": name, **{f"val_{k}": v for k, v in val_m.items()},
                             **{f"test_{k}": v for k, v in test_m.items()}})
        print(f"    {name}: val MAE={val_m['MAE']} | test MAE={test_m['MAE']}")

    print("=== Tuning XGBoost (RandomizedSearchCV, 15 candidates x 3 folds) ===")
    search = models["xgboost_tuned"]
    search.fit(X_train, y_train)
    best_xgb = search.best_estimator_
    print(f"    best params: {search.best_params_}")
    val_m = regression_metrics(y_val, best_xgb.predict(X_val))
    test_m = regression_metrics(y_test, best_xgb.predict(X_test))
    metrics_rows.append({"model": "xgboost_tuned",
                         **{f"val_{k}": v for k, v in val_m.items()},
                         **{f"test_{k}": v for k, v in test_m.items()}})
    print(f"    xgboost_tuned: val MAE={val_m['MAE']} | test MAE={test_m['MAE']}")

    metrics_df = pd.DataFrame(metrics_rows)
    metrics_df.to_csv(config.REPORTS_DIR / "model_metrics.csv", index=False)

    bundle = {
        "model_name": "xgboost_tuned",
        "model": best_xgb,
        "search_best_params": search.best_params_,
        "search_cv_mae": float(-search.best_score_),
        "numeric_features": NUMERIC_FEATURES,
        "categorical_features": CATEGORICAL_FEATURES,
        "model_features": MODEL_FEATURES,
        "leakage_excluded_columns": LEAKAGE_EXCLUDED,
        "target": TARGET,
        "split_info": split_info,
        "metrics": metrics_df.to_dict(orient="records"),
        "training_metadata": {
            "trained_at": time.strftime("%Y-%m-%d %H:%M:%S"),
            "random_seed": config.RANDOM_SEED,
            "n_iter_search": 15,
            "cv": "TimeSeriesSplit(3)",
            "device": device,
            "data_file": str(config.SYNTHETIC_TRAFFIC_CSV.name),
            "disclaimer": ("Model trained on SYNTHETIC traffic data generated "
                           "from real OSM road network attributes."),
            "runtime_seconds": round(time.time() - t0, 1),
        },
    }
    joblib.dump(bundle, config.MODEL_ARTIFACTS)
    print(f"Saved model bundle -> {config.MODEL_ARTIFACTS}")
    print(metrics_df.to_string(index=False))
    return df, bundle, splits


if __name__ == "__main__":
    main()
