"""
Complete training pipeline for Water Demand prediction.

Trains baselines, classical ML models, tunes top candidates,
evaluates on validation and test sets, saves artifacts.
"""
import sys
import json
import time
import warnings
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.dummy import DummyRegressor
from sklearn.ensemble import RandomForestRegressor, ExtraTreesRegressor, GradientBoostingRegressor
from sklearn.linear_model import LinearRegression, Ridge, Lasso, ElasticNet
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import RandomizedSearchCV, TimeSeriesSplit
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler, OrdinalEncoder
from sklearn.inspection import permutation_importance
import xgboost as xgb
import lightgbm as lgb

sys.path.insert(0, str(Path(__file__).resolve().parent))
from config import (
    TARGET, SEED, MODELS_DIR, REPORTS_DIR, FIGURES_DIR,
    DATA_RAW, SPLIT_DATES
)
from feature_engineering import (
    load_raw, drop_leakage_and_identifiers, add_domain_features,
    chronological_split, get_feature_lists
)

warnings.filterwarnings("ignore")
np.random.seed(SEED)

MODELS_DIR.mkdir(parents=True, exist_ok=True)
REPORTS_DIR.mkdir(parents=True, exist_ok=True)
FIGURES_DIR.mkdir(parents=True, exist_ok=True)


# ── Metrics ──────────────────────────────────────────────────────────────────

def compute_metrics(y_true, y_pred, prefix=""):
    mae = mean_absolute_error(y_true, y_pred)
    rmse = np.sqrt(mean_squared_error(y_true, y_pred))
    r2 = r2_score(y_true, y_pred)

    mask = y_true > 0.1
    if mask.sum() > 0:
        mape = np.mean(np.abs((y_true[mask] - y_pred[mask]) / y_true[mask])) * 100
    else:
        mape = np.nan

    denom = np.abs(y_true) + np.abs(y_pred)
    mask_smape = denom > 1e-8
    if mask_smape.sum() > 0:
        smape = np.mean(2 * np.abs(y_true[mask_smape] - y_pred[mask_smape]) /
                        denom[mask_smape]) * 100
    else:
        smape = np.nan

    return {
        f"{prefix}MAE": round(float(mae), 4),
        f"{prefix}RMSE": round(float(rmse), 4),
        f"{prefix}R2": round(float(r2), 4),
        f"{prefix}MAPE": round(float(mape), 2) if not np.isnan(mape) else None,
        f"{prefix}sMAPE": round(float(smape), 2) if not np.isnan(smape) else None,
    }


# ── Preprocessor ─────────────────────────────────────────────────────────────

def build_preprocessor(numeric_features, categorical_features):
    """Build sklearn ColumnTransformer."""
    return ColumnTransformer(
        transformers=[
            ("num", StandardScaler(), numeric_features),
            ("cat", OneHotEncoder(handle_unknown="ignore", sparse_output=False,
                                  max_categories=50), categorical_features),
        ],
        remainder="drop"
    )


def make_pipeline(estimator, numeric_features, categorical_features):
    """Create sklearn Pipeline with preprocessor + estimator."""
    return Pipeline([
        ("prep", build_preprocessor(numeric_features, categorical_features)),
        ("model", estimator)
    ])


# ── Training ─────────────────────────────────────────────────────────────────

def train_all_models(X_train, y_train, X_val, y_val, X_test, y_test,
                     numeric_features, categorical_features):
    """Train all candidate models and return results."""

    results = []
    fitted_models = {}

    def evaluate(name, model, Xs, ys, tag):
        t0 = time.time()
        preds = model.predict(Xs)
        inf_time = (time.time() - t0) / max(len(Xs), 1) * 1000
        m = compute_metrics(ys, preds, prefix=f"{tag}_")
        m["model"] = name
        m["split"] = tag
        m["inference_time_ms_per_sample"] = round(inf_time, 6)
        results.append(m)
        return m

    def train_and_eval(name, pipe, tag_list):
        nonlocal results
        t0 = time.time()
        pipe.fit(X_train, y_train)
        train_time = time.time() - t0
        fitted_models[name] = pipe
        val_m = None
        test_m = None
        for tag, Xs, ys in tag_list:
            m = evaluate(name, pipe, Xs, ys, tag)
            m["train_time"] = round(train_time, 3)
            if tag == "validation":
                val_m = m
            elif tag == "test":
                test_m = m
        val_str = f"val MAE={val_m['validation_MAE']:.4f}" if val_m else ""
        test_str = f"test MAE={test_m['test_MAE']:.4f}" if test_m else ""
        print(f"  {name}: {val_str}, {test_str}")
        return pipe

    tag_list = [("train", X_train, y_train),
                ("validation", X_val, y_val),
                ("test", X_test, y_test)]

    # ── Baselines ────────────────────────────────────────────────────────
    print("Training baselines...")
    for name, strategy in [("mean_baseline", "mean"), ("median_baseline", "median")]:
        pipe = make_pipeline(DummyRegressor(strategy=strategy),
                             numeric_features, categorical_features)
        train_and_eval(name, pipe, tag_list)

    # ── Linear Models ────────────────────────────────────────────────────
    print("Training linear models...")
    linear_models = {
        "linear_regression": LinearRegression(),
        "ridge": Ridge(alpha=1.0),
        "lasso": Lasso(alpha=0.01, max_iter=10000),
        "elasticnet": ElasticNet(alpha=0.01, l1_ratio=0.5, max_iter=10000),
    }
    for name, est in linear_models.items():
        pipe = make_pipeline(est, numeric_features, categorical_features)
        train_and_eval(name, pipe, tag_list)

    # ── Random Forest ────────────────────────────────────────────────────
    print("Training Random Forest...")
    rf = RandomForestRegressor(
        n_estimators=300, max_depth=16, min_samples_leaf=5,
        max_features=0.5, n_jobs=-1, random_state=SEED
    )
    pipe_rf = make_pipeline(rf, numeric_features, categorical_features)
    train_and_eval("random_forest", pipe_rf, tag_list)

    # ── Extra Trees ──────────────────────────────────────────────────────
    print("Training Extra Trees...")
    et = ExtraTreesRegressor(
        n_estimators=300, max_depth=16, min_samples_leaf=5,
        max_features=0.5, n_jobs=-1, random_state=SEED
    )
    pipe_et = make_pipeline(et, numeric_features, categorical_features)
    train_and_eval("extra_trees", pipe_et, tag_list)

    # ── HistGradientBoosting ─────────────────────────────────────────────
    print("Training HistGradientBoosting...")
    hgb = GradientBoostingRegressor(
        n_estimators=500, max_depth=6, learning_rate=0.05,
        subsample=0.8, min_samples_leaf=10, random_state=SEED
    )
    pipe_hgb = make_pipeline(hgb, numeric_features, categorical_features)
    train_and_eval("hist_gradient_boosting", pipe_hgb, tag_list)

    # ── XGBoost (tuned via RandomizedSearchCV) ───────────────────────────
    print("Tuning XGBoost (RandomizedSearchCV)...")
    xgb_base = xgb.XGBRegressor(
        tree_method="hist", device="cuda" if _detect_cuda() else "cpu",
        random_state=SEED, objective="reg:squarederror", verbosity=0
    )
    pipe_xgb = make_pipeline(xgb_base, numeric_features, categorical_features)

    param_dist = {
        "model__n_estimators": [300, 500, 800, 1200],
        "model__max_depth": [4, 6, 8, 10],
        "model__learning_rate": [0.01, 0.03, 0.05, 0.08, 0.12],
        "model__subsample": [0.7, 0.8, 0.9, 1.0],
        "model__colsample_bytree": [0.6, 0.7, 0.8, 1.0],
        "model__min_child_weight": [1, 3, 5, 10],
        "model__reg_lambda": [0.5, 1.0, 2.0],
    }

    t0 = time.time()
    xgb_search = RandomizedSearchCV(
        pipe_xgb, param_dist, n_iter=25,
        cv=TimeSeriesSplit(n_splits=3),
        scoring="neg_mean_absolute_error",
        random_state=SEED, n_jobs=1, verbose=0, refit=True
    )
    xgb_search.fit(X_train, y_train)
    train_time = time.time() - t0
    fitted_models["xgboost_tuned"] = xgb_search.best_estimator_
    print(f"  Best XGB params: {xgb_search.best_params_}")
    print(f"  XGB CV MAE: {-xgb_search.best_score_:.4f}")
    for tag, Xs, ys in [("train", X_train, y_train),
                         ("validation", X_val, y_val),
                         ("test", X_test, y_test)]:
        m = evaluate("xgboost_tuned", xgb_search.best_estimator_, Xs, ys, tag)
        m["train_time"] = round(train_time, 3)
    # Find the val and test results for this model
    xgb_val = [r for r in results if r["model"] == "xgboost_tuned" and r["split"] == "validation"][0]
    xgb_test = [r for r in results if r["model"] == "xgboost_tuned" and r["split"] == "test"][0]
    print(f"  xgboost_tuned: val MAE={xgb_val['validation_MAE']:.4f}, "
          f"test MAE={xgb_test['test_MAE']:.4f}")

    # ── LightGBM (tuned) ─────────────────────────────────────────────────
    print("Tuning LightGBM (RandomizedSearchCV)...")
    lgb_base = lgb.LGBMRegressor(
        random_state=SEED, verbose=-1, n_jobs=-1
    )
    pipe_lgb = make_pipeline(lgb_base, numeric_features, categorical_features)

    lgb_param_dist = {
        "model__n_estimators": [300, 500, 800, 1200],
        "model__max_depth": [4, 6, 8, 10, -1],
        "model__learning_rate": [0.01, 0.03, 0.05, 0.08],
        "model__subsample": [0.7, 0.8, 0.9, 1.0],
        "model__colsample_bytree": [0.6, 0.7, 0.8, 1.0],
        "model__min_child_samples": [5, 10, 20, 50],
        "model__reg_lambda": [0.5, 1.0, 2.0],
    }

    t0 = time.time()
    lgb_search = RandomizedSearchCV(
        pipe_lgb, lgb_param_dist, n_iter=25,
        cv=TimeSeriesSplit(n_splits=3),
        scoring="neg_mean_absolute_error",
        random_state=SEED, n_jobs=1, verbose=0, refit=True
    )
    lgb_search.fit(X_train, y_train)
    train_time = time.time() - t0
    fitted_models["lightgbm_tuned"] = lgb_search.best_estimator_
    print(f"  Best LGB params: {lgb_search.best_params_}")
    print(f"  LGB CV MAE: {-lgb_search.best_score_:.4f}")
    for tag, Xs, ys in [("train", X_train, y_train),
                         ("validation", X_val, y_val),
                         ("test", X_test, y_test)]:
        m = evaluate("lightgbm_tuned", lgb_search.best_estimator_, Xs, ys, tag)
        m["train_time"] = round(train_time, 3)
    lgb_val = [r for r in results if r["model"] == "lightgbm_tuned" and r["split"] == "validation"][0]
    lgb_test = [r for r in results if r["model"] == "lightgbm_tuned" and r["split"] == "test"][0]
    print(f"  lightgbm_tuned: val MAE={lgb_val['validation_MAE']:.4f}, "
          f"test MAE={lgb_test['test_MAE']:.4f}")

    return results, fitted_models


def _detect_cuda():
    try:
        import xgboost as xgb_probe
        p = xgb_probe.XGBRegressor(n_estimators=1, max_depth=1, tree_method="hist",
                                    device="cuda", verbosity=0)
        rng = np.random.default_rng(0)
        p.fit(rng.random((64, 4)), rng.random(64))
        return True
    except Exception:
        return False


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    t_start = time.time()
    print("=" * 70)
    print("WATER DEMAND MODEL — TRAINING PIPELINE")
    print("=" * 70)

    # 1. Load and engineer features
    print("\n[1] Loading data and engineering features...")
    df = load_raw()
    print(f"  Raw shape: {df.shape}")
    df = drop_leakage_and_identifiers(df)
    df = add_domain_features(df)
    print(f"  After feature engineering: {df.shape}")

    # 2. Chronological split
    print("\n[2] Chronological train/val/test split...")
    splits = chronological_split(df)

    # 3. Prepare features
    print("\n[3] Preparing feature matrices...")
    num_feats, cat_feats = get_feature_lists()
    available_num = [c for c in num_feats if c in splits["train"].columns]
    available_cat = [c for c in cat_feats if c in splits["train"].columns]
    print(f"  Numeric features: {len(available_num)}")
    print(f"  Categorical features: {len(available_cat)}")

    # One-hot encode categoricals for the feature matrices
    X_train_raw = splits["train"][available_num + available_cat].copy()
    X_val_raw = splits["validation"][available_num + available_cat].copy()
    X_test_raw = splits["test"][available_num + available_cat].copy()

    for col in available_cat:
        X_train_raw[col] = X_train_raw[col].astype(str)
        X_val_raw[col] = X_val_raw[col].astype(str)
        X_test_raw[col] = X_test_raw[col].astype(str)

    y_train = splits["train"][TARGET].values
    y_val = splits["validation"][TARGET].values
    y_test = splits["test"][TARGET].values

    # 4. Train all models
    print("\n[4] Training all models...")
    results, fitted_models = train_all_models(
        X_train_raw, y_train, X_val_raw, y_val, X_test_raw, y_test,
        available_num, available_cat
    )

    # 5. Create comparison table
    print("\n[5] Creating comparison table...")
    results_df = pd.DataFrame(results)

    # Pivot for readability
    val_results = results_df[results_df["split"] == "validation"].copy()
    test_results = results_df[results_df["split"] == "test"].copy()
    train_results = results_df[results_df["split"] == "train"].copy()

    comparison = val_results[["model", "validation_MAE", "validation_RMSE", "validation_R2",
                               "validation_MAPE", "train_time"]].merge(
        test_results[["model", "test_MAE", "test_RMSE", "test_R2",
                       "test_MAPE", "inference_time_ms_per_sample"]],
        on="model"
    ).merge(
        train_results[["model", "train_MAE"]],
        on="model"
    )

    comparison = comparison.sort_values("validation_MAE")
    print("\n" + "=" * 100)
    print("MODEL COMPARISON (sorted by validation MAE)")
    print("=" * 100)
    print(comparison.to_string(index=False))

    # 6. Select best model
    best_name = comparison.iloc[0]["model"]
    best_val_mae = comparison.iloc[0]["validation_MAE"]
    best_test_mae = comparison.iloc[0]["test_MAE"]
    print(f"\n{'='*70}")
    print(f"BEST MODEL: {best_name}")
    print(f"  Val MAE:  {best_val_mae:.4f}")
    print(f"  Test MAE: {best_test_mae:.4f}")
    print(f"{'='*70}")

    # 7. Save everything
    print("\n[6] Saving artifacts...")

    comparison.to_csv(REPORTS_DIR / "model_comparison.csv", index=False)
    results_df.to_csv(REPORTS_DIR / "full_results.csv", index=False)

    best_model = fitted_models[best_name]

    bundle = {
        "model_name": best_name,
        "model": best_model,
        "numeric_features": available_num,
        "categorical_features": available_cat,
        "target": TARGET,
        "split_dates": SPLIT_DATES,
        "split_rows": {k: len(v) for k, v in splits.items()},
        "comparison": comparison.to_dict(orient="records"),
        "training_metadata": {
            "trained_at": time.strftime("%Y-%m-%d %H:%M:%S"),
            "random_seed": SEED,
            "n_rows": len(df),
            "n_features": len(available_num) + len(available_cat),
            "python_version": sys.version,
            "runtime_seconds": round(time.time() - t_start, 1),
        }
    }
    joblib.dump(bundle, MODELS_DIR / "water_demand_model.joblib")
    print(f"  Saved: {MODELS_DIR / 'water_demand_model.joblib'}")

    feature_meta = {
        "numeric_features": available_num,
        "categorical_features": available_cat,
        "all_features": available_num + available_cat,
        "target": TARGET,
        "split_dates": SPLIT_DATES,
        "best_model": best_name,
        "best_val_mae": float(best_val_mae),
        "best_test_mae": float(best_test_mae),
        "n_rows": len(df),
    }
    (MODELS_DIR / "feature_metadata.json").write_text(
        json.dumps(feature_meta, indent=2, default=str), encoding="utf-8"
    )
    print(f"  Saved: {MODELS_DIR / 'feature_metadata.json'}")

    # 8. Feature importance for tree models
    if best_name in ["xgboost_tuned", "lightgbm_tuned", "random_forest",
                      "extra_trees", "hist_gradient_boosting"]:
        print("\n[7] Computing feature importance...")
        _save_feature_importance(best_model, best_name, available_num, available_cat)

    total_time = time.time() - t_start
    print(f"\nTotal training time: {total_time:.1f}s")
    print("Done.")
    return comparison, fitted_models


def _save_feature_importance(model, name, num_feats, cat_feats):
    """Extract and save feature importance."""
    try:
        if name in ["xgboost_tuned", "lightgbm_tuned"]:
            inner = model.named_steps["model"]
            if hasattr(inner, "feature_importances_"):
                importances = inner.feature_importances_
            else:
                return
        elif name in ["random_forest", "extra_trees", "hist_gradient_boosting"]:
            inner = model.named_steps["model"]
            importances = inner.feature_importances_
        else:
            return

        prep = model.named_steps["prep"]
        cat_encoder = None
        for cname, ct, cols in prep.transformers_:
            if cname == "cat":
                cat_encoder = ct
                break

        if cat_encoder is not None and hasattr(cat_encoder, "get_feature_names_out"):
            cat_names = list(cat_encoder.get_feature_names_out(cat_feats))
        else:
            cat_names = [f"cat_{i}" for i in range(len(importances) - len(num_feats))]

        all_names = num_feats + cat_names

        if len(importances) != len(all_names):
            print(f"  Warning: importance length {len(importances)} != feature count {len(all_names)}")
            min_len = min(len(importances), len(all_names))
            importances = importances[:min_len]
            all_names = all_names[:min_len]

        fi_df = pd.DataFrame({
            "feature": all_names,
            "importance": importances
        }).sort_values("importance", ascending=False)

        fi_df.to_csv(REPORTS_DIR / "feature_importance.csv", index=False)
        print(f"  Top 10 features:")
        for _, row in fi_df.head(10).iterrows():
            print(f"    {row['feature']:45s} {row['importance']:.4f}")
    except Exception as e:
        print(f"  Warning: could not extract feature importance: {e}")


if __name__ == "__main__":
    main()
