"""
Reproducible model-training pipeline for road-level traffic volume prediction.

1. load cleaned/engineered data   (data/processed/traffic_ml_clean.parquet)
2. chronological train/val/test split
3. encode categoricals            (native categorical for XGBoost,
                                   one-hot for Linear/RF - no arbitrary ordinals)
4. train mean/median baselines, Linear Regression, Random Forest, XGBoost
5. evaluate MAE / RMSE / R2       (MAPE excluded: 36.8% zero-volume rows)
6. save model_results.csv, feature_importance.csv, plots, best model + metadata

Run:  python src/train_models.py
"""
from __future__ import annotations

import gc
import json
import platform
import time
from pathlib import Path

import numpy as np
import pandas as pd
import sklearn
import xgboost as xgb
from sklearn.ensemble import RandomForestRegressor
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

from common import DATA_PATH, META_PATH, MODELS_DIR, PLOTS_DIR, SEED, log
from plots import make_plots

np.random.seed(SEED)


def metrics(y_true: np.ndarray, y_pred: np.ndarray) -> dict[str, float]:
    return {
        "MAE": float(mean_absolute_error(y_true, y_pred)),
        "RMSE": float(np.sqrt(mean_squared_error(y_true, y_pred))),
        "R2": float(r2_score(y_true, y_pred)),
    }


def load_data():
    meta = json.loads(META_PATH.read_text())
    feats = meta["features"]
    cat_feats = meta["categorical_features"]
    target = meta["target"]
    df = pd.read_parquet(DATA_PATH)
    num_dtypes = {c: "float32" for c in feats if c not in cat_feats}
    df[feats] = df[feats].astype({**num_dtypes, **{c: "category" for c in cat_feats}})
    df[target] = df[target].astype("int32")
    df = df.sort_values(["date", "road_id", "hour"], kind="mergesort").reset_index(drop=True)
    splits = {k: tuple(v) for k, v in meta["split_dates"].items()}
    masks = {n: (df["date"] >= a) & (df["date"] <= b) for n, (a, b) in splits.items()}
    for n, m in masks.items():
        log(f"split {n:10s}: {m.sum():>9,} rows ({splits[n][0]} .. {splits[n][1]})")
    return df, feats, cat_feats, target, masks


def main() -> None:
    PLOTS_DIR.mkdir(parents=True, exist_ok=True)
    MODELS_DIR.mkdir(exist_ok=True)

    df, feats, cat_feats, target, masks = load_data()
    X, y = df[feats], df[target].to_numpy()

    results: list[dict] = []

    def record(name, mdl, Xs, ys, tag):
        p = mdl.predict(Xs)
        m = metrics(ys, p)
        results.append({"model": name, "split": tag, **m})
        log(f"{name:18s} {tag:5s} MAE={m['MAE']:8.2f} RMSE={m['RMSE']:9.2f} R2={m['R2']:.4f}")
        return p

    # ------------------------------------------------------------- baselines
    log("baselines ...")
    tr_y = y[masks["train"]]
    for name, const in [("mean_baseline", float(tr_y.mean())),
                        ("median_baseline", float(np.median(tr_y)))]:
        for tag in ["validation", "test"]:
            m = metrics(y[masks[tag]], np.full(masks[tag].sum(), const))
            results.append({"model": name, "split": tag, **m})
            log(f"{name:18s} {tag:5s} MAE={m['MAE']:8.2f} RMSE={m['RMSE']:9.2f} R2={m['R2']:.4f}")

    # ---------------------------------------------------------------- XGBoost
    log("training XGBoost ...")
    t0 = time.time()
    xgb_params = dict(
        n_estimators=1500, learning_rate=0.05, max_depth=9, min_child_weight=5,
        subsample=0.8, colsample_bytree=0.8, reg_lambda=1.0,
        tree_method="hist", enable_categorical=True, random_state=SEED,
        n_jobs=-1, objective="reg:squarederror",
        early_stopping_rounds=60, eval_metric="rmse",
    )
    xgb_model = xgb.XGBRegressor(**xgb_params)
    xgb_model.fit(X[masks["train"]], y[masks["train"]],
                  eval_set=[(X[masks["validation"]], y[masks["validation"]])],
                  verbose=False)
    log(f"xgboost done in {time.time()-t0:.0f}s "
        f"(best_iteration={getattr(xgb_model, 'best_iteration', 'n/a')})")
    for tag in ["train", "validation", "test"]:
        record("XGBoost", xgb_model, X[masks[tag]], y[masks[tag]], tag)
    test_pred = xgb_model.predict(X[masks["test"]])
    booster = xgb_model.get_booster()
    fi = pd.DataFrame({
        "feature": list(booster.get_score(importance_type="gain").keys()),
        "gain_importance": list(booster.get_score(importance_type="gain").values()),
        "split_count": [booster.get_score(importance_type="weight").get(f, 0)
                        for f in booster.get_score(importance_type="gain")],
    }).sort_values("gain_importance", ascending=False).reset_index(drop=True)

    # save main model immediately
    booster.save_model(MODELS_DIR / "traffic_xgboost_model.json")
    log("saved models/traffic_xgboost_model.json")

    # ------------------------------------------------------ linear regression
    log("linear regression (one-hot) ...")
    cols = None
    Xtr = pd.get_dummies(X[masks["train"]], columns=cat_feats, dtype="float32")
    cols = list(Xtr.columns)
    lin = LinearRegression().fit(Xtr.to_numpy(), y[masks["train"]])
    del Xtr; gc.collect()
    for tag in ["validation", "test"]:
        Xt = pd.get_dummies(X[masks[tag]], columns=cat_feats, dtype="float32") \
               .reindex(columns=cols, fill_value=0).to_numpy()
        record("LinearRegression", lin, Xt, y[masks[tag]], tag)
        del Xt
    del lin; gc.collect()

    # ----------------------------------------------------------- random forest
    log("random forest ...")
    rf = RandomForestRegressor(n_estimators=80, max_depth=22, min_samples_leaf=100,
                               max_features=0.5, n_jobs=-1, random_state=SEED)
    Xtr = pd.get_dummies(X[masks["train"]], columns=cat_feats, dtype="float32").to_numpy()
    t0 = time.time()
    rf.fit(Xtr, y[masks["train"]])
    del Xtr; gc.collect()
    log(f"random forest fitted in {time.time()-t0:.0f}s")
    for tag in ["validation", "test"]:
        Xt = pd.get_dummies(X[masks[tag]], columns=cat_feats, dtype="float32") \
               .reindex(columns=cols, fill_value=0).to_numpy()
        record("RandomForest", rf, Xt, y[masks[tag]], tag)
        del Xt
    del rf; gc.collect()

    # ----------------------------------------------------------------- results
    res_df = pd.DataFrame(results)
    res_df.to_csv("reports/model_results.csv", index=False)
    fi.to_csv("reports/feature_importance.csv", index=False)
    trained = res_df[(res_df["model"].isin(["XGBoost", "RandomForest", "LinearRegression"]))
                     & (res_df["split"] == "validation")]
    best_name = trained.loc[trained["RMSE"].idxmin(), "model"]
    log(f"BEST MODEL by validation RMSE: {best_name}")

    _write_metadata(xgb_params, feats, cat_feats, target, masks, res_df, fi)
    make_plots(df, masks, y, test_pred, best_name)
    log("all artifacts saved.")


def _write_metadata(xgb_params, feats, cat_feats, target, masks, res_df, fi):
    meta_out = {
        "python_version": platform.python_version(),
        "numpy": np.__version__, "pandas": pd.__version__,
        "sklearn": sklearn.__version__, "xgboost": xgb.__version__,
        "random_seed": SEED,
        "dataset": str(DATA_PATH),
        "features": feats,
        "categorical_encoding": {
            "xgboost": "native categorical (enable_categorical=True), category order = sorted",
            "linear_randomforest": "one-hot via pd.get_dummies",
        },
        "split_dates": {"train": ["2024-01-01", "2024-04-30"],
                        "validation": ["2024-05-01", "2024-06-15"],
                        "test": ["2024-06-16", "2024-07-18"]},
        "split_rows": {k: int(v.sum()) for k, v in masks.items()},
        "xgboost_params": xgb_params,
        "mape_excluded_reason": "36.8% zero-volume rows -> division by zero",
        "results_preview": res_df.to_dict(orient="records"),
        "top10_features_gain": fi.head(10)["feature"].tolist(),
    }
    (MODELS_DIR / "preprocessing_metadata.json").write_text(json.dumps(meta_out, indent=2))
    log("saved models/preprocessing_metadata.json")


if __name__ == "__main__":
    main()
