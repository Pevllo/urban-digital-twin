"""Quick train + evaluate: subsampled data, fewer search iterations."""

import sys, time
import numpy as np
import pandas as pd
import joblib
from sklearn.metrics import mean_absolute_error, r2_score, root_mean_squared_error

import config
import train


def main():
    t0 = time.time()
    print("=== Building features ===")
    df = train.build_features()

    # Subsample to ~200k rows for speed
    if len(df) > 200_000:
        rng = np.random.default_rng(config.RANDOM_SEED)
        idx = rng.choice(len(df), 200_000, replace=False)
        df = df.iloc[idx].reset_index(drop=True)
        print(f"  Subsampled to {len(df):,} rows for fast training")

    splits, split_info, _ = train.chronological_splits(df)

    X_train, y_train = splits["train"][train.MODEL_FEATURES], splits["train"][train.TARGET]
    X_val, y_val = splits["val"][train.MODEL_FEATURES], splits["val"][train.TARGET]
    X_test, y_test = splits["test"][train.MODEL_FEATURES], splits["test"][train.TARGET]

    print("=== Training baselines + RF ===")
    from sklearn.dummy import DummyRegressor
    from sklearn.linear_model import LinearRegression
    from sklearn.ensemble import RandomForestRegressor

    models = {
        "mean_baseline": train._pipeline(DummyRegressor(strategy="mean")),
        "linear_regression": train._pipeline(LinearRegression()),
        "random_forest": train._pipeline(RandomForestRegressor(
            n_estimators=80, max_depth=12, min_samples_leaf=10,
            max_features=0.5, n_jobs=-1, random_state=config.RANDOM_SEED)),
    }
    fitted, metrics_rows = {}, []
    for name, m in models.items():
        m.fit(X_train, y_train)
        val_m = train.regression_metrics(y_val, m.predict(X_val))
        test_m = train.regression_metrics(y_test, m.predict(X_test))
        fitted[name] = m
        metrics_rows.append({"model": name, **{f"val_{k}": v for k, v in val_m.items()},
                             **{f"test_{k}": v for k, v in test_m.items()}})
        print(f"    {name}: val MAE={val_m['MAE']} | test MAE={test_m['MAE']}")

    print("=== Tuning XGBoost (5 candidates x 2 folds) ===")
    device = train.detect_device()
    from xgboost import XGBRegressor
    from sklearn.model_selection import RandomizedSearchCV, TimeSeriesSplit

    param_dist = {
        "model__n_estimators": [200, 400, 600],
        "model__max_depth": [4, 6, 8],
        "model__learning_rate": [0.05, 0.08, 0.12],
        "model__subsample": [0.8, 1.0],
        "model__colsample_bytree": [0.7, 1.0],
    }
    search = RandomizedSearchCV(
        train._pipeline(XGBRegressor(tree_method="hist", device=device,
                                     verbosity=0, random_state=config.RANDOM_SEED,
                                     objective="reg:squarederror")),
        param_distributions=param_dist, n_iter=5,
        cv=TimeSeriesSplit(n_splits=2), scoring="neg_mean_absolute_error",
        random_state=config.RANDOM_SEED, n_jobs=1, verbose=1, refit=True,
    )
    search.fit(X_train, y_train)
    best_xgb = search.best_estimator_
    print(f"    best params: {search.best_params_}")
    val_m = train.regression_metrics(y_val, best_xgb.predict(X_val))
    test_m = train.regression_metrics(y_test, best_xgb.predict(X_test))
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
        "numeric_features": train.NUMERIC_FEATURES,
        "categorical_features": train.CATEGORICAL_FEATURES,
        "model_features": train.MODEL_FEATURES,
        "leakage_excluded_columns": train.LEAKAGE_EXCLUDED,
        "target": train.TARGET,
        "split_info": split_info,
        "metrics": metrics_df.to_dict(orient="records"),
        "training_metadata": {
            "trained_at": time.strftime("%Y-%m-%d %H:%M:%S"),
            "random_seed": config.RANDOM_SEED,
            "n_iter_search": 5,
            "cv": "TimeSeriesSplit(2)",
            "device": device,
            "data_file": str(config.SYNTHETIC_TRAFFIC_CSV.name),
            "disclaimer": "Model trained on SYNTHETIC traffic data.",
            "runtime_seconds": round(time.time() - t0, 1),
        },
    }
    joblib.dump(bundle, config.MODEL_ARTIFACTS)
    print(f"\nSaved model bundle -> {config.MODEL_ARTIFACTS}")
    print(f"Runtime: {time.time() - t0:.1f}s")
    print(metrics_df.to_string(index=False))


if __name__ == "__main__":
    main()
