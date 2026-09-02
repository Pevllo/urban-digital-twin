"""
Error analysis and explainability for the selected Water Demand model.

Generates:
- Full model comparison table (ML + DL)
- Residual analysis
- Error by development type, hour, month, zone
- SHAP feature importance
- Permutation importance
"""
import sys
import json
import time
import warnings
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import shap
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.inspection import permutation_importance

sys.path.insert(0, str(Path(__file__).resolve().parent))
from config import (
    TARGET, SEED, MODELS_DIR, REPORTS_DIR, FIGURES_DIR, DATA_RAW, SPLIT_DATES
)
from feature_engineering import (
    load_raw, drop_leakage_and_identifiers, add_domain_features,
    chronological_split, get_feature_lists
)

warnings.filterwarnings("ignore")
np.random.seed(SEED)

REPORTS_DIR.mkdir(parents=True, exist_ok=True)
FIGURES_DIR.mkdir(parents=True, exist_ok=True)


def compute_metrics(y_true, y_pred):
    mae = mean_absolute_error(y_true, y_pred)
    rmse = np.sqrt(mean_squared_error(y_true, y_pred))
    r2 = r2_score(y_true, y_pred)
    mask = y_true > 0.1
    mape = np.mean(np.abs((y_true[mask] - y_pred[mask]) / y_true[mask])) * 100 if mask.sum() > 0 else np.nan
    denom = np.abs(y_true) + np.abs(y_pred)
    mask_s = denom > 1e-8
    smape = np.mean(2 * np.abs(y_true[mask_s] - y_pred[mask_s]) / denom[mask_s]) * 100 if mask_s.sum() > 0 else np.nan
    return {"MAE": mae, "RMSE": rmse, "R2": r2, "MAPE": mape, "sMAPE": smape}


def main():
    print("=" * 70)
    print("WATER DEMAND — ERROR ANALYSIS & EXPLAINABILITY")
    print("=" * 70)

    # 1. Load data and prepare
    print("\n[1] Loading data...")
    df = load_raw()
    df["_dev_id"] = df["development_id"].values
    df_orig = df.copy()
    df = drop_leakage_and_identifiers(df)
    df = add_domain_features(df)

    splits = chronological_split(df)
    num_feats, cat_feats = get_feature_lists()
    available_num = [c for c in num_feats if c in splits["train"].columns]
    available_cat = [c for c in cat_feats if c in splits["train"].columns]

    from sklearn.preprocessing import StandardScaler, OneHotEncoder
    cat_encoder = OneHotEncoder(handle_unknown="ignore", sparse_output=False, max_categories=50)
    cat_encoder.fit(splits["train"][available_cat])
    num_scaler = StandardScaler()
    num_scaler.fit(splits["train"][available_num])

    data = {}
    for split_name, split_df in splits.items():
        X_num = num_scaler.transform(split_df[available_num].fillna(0))
        X_cat = cat_encoder.transform(split_df[available_cat].astype(str))
        X = np.hstack([X_num, X_cat]).astype(np.float32)
        y = split_df[TARGET].values.astype(np.float32)
        data[split_name] = {"X": X, "y": y, "df": split_df}

    # 2. Load best model
    print("\n[2] Loading best model (extra_trees)...")
    bundle = joblib.load(MODELS_DIR / "water_demand_model.joblib")
    model = bundle["model"]
    model_num_feats = bundle["numeric_features"]
    model_cat_feats = bundle["categorical_features"]

    # Prepare test data matching what the model expects (raw features before encoding)
    df_test_raw = splits["test"].copy()
    # Ensure categorical columns are strings
    for col in model_cat_feats:
        if col in df_test_raw.columns:
            df_test_raw[col] = df_test_raw[col].astype(str)

    X_test_raw = df_test_raw[model_num_feats + model_cat_feats].copy()
    y_test = df_test_raw[TARGET].values.astype(np.float32)
    df_test = df_test_raw

    t0 = time.time()
    y_pred = model.predict(X_test_raw)
    inf_time = (time.time() - t0) / len(X_test_raw) * 1000

    test_metrics = compute_metrics(y_test, y_pred)
    print(f"  Test MAE:  {test_metrics['MAE']:.4f}")
    print(f"  Test RMSE: {test_metrics['RMSE']:.4f}")
    print(f"  Test R²:   {test_metrics['R2']:.4f}")
    print(f"  Test MAPE: {test_metrics['MAPE']:.2f}%")
    print(f"  Test sMAPE: {test_metrics['sMAPE']:.2f}%")
    print(f"  Inference: {inf_time:.4f} ms/sample")

    # 3. Full comparison table (ML + DL)
    print("\n[3] Building full comparison table...")
    ml_comparison = pd.read_csv(REPORTS_DIR / "model_comparison.csv")
    dl_comparison = pd.read_csv(REPORTS_DIR / "dl_results.csv")

    ml_rows = []
    for _, row in ml_comparison.iterrows():
        ml_rows.append({
            "Model": row["model"],
            "Type": "Classical ML",
            "Val MAE": row["validation_MAE"],
            "Val RMSE": row["validation_RMSE"],
            "Val R²": row["validation_R2"],
            "Test MAE": row["test_MAE"],
            "Test RMSE": row["test_RMSE"],
            "Test R²": row["test_R2"],
            "Train Time (s)": row["train_time"],
        })

    for _, row in dl_comparison.iterrows():
        ml_rows.append({
            "Model": row["model"],
            "Type": "Deep Learning",
            "Val MAE": row["val_MAE"],
            "Val RMSE": row["val_RMSE"],
            "Val R²": row["val_R2"],
            "Test MAE": row["test_MAE"],
            "Test RMSE": row["test_RMSE"],
            "Test R²": row["test_R2"],
            "Train Time (s)": row["train_time_s"],
        })

    full_comparison = pd.DataFrame(ml_rows).sort_values("Val MAE")
    full_comparison.to_csv(REPORTS_DIR / "full_model_comparison.csv", index=False)
    print(full_comparison.to_string(index=False))

    # 4. Residual analysis
    print("\n[4] Residual Analysis...")
    residuals = y_test - y_pred
    abs_residuals = np.abs(residuals)

    print(f"  Mean residual:     {residuals.mean():.4f}")
    print(f"  Std residual:      {residuals.std():.4f}")
    print(f"  Median abs res:    {np.median(abs_residuals):.4f}")
    print(f"  P95 abs residual:  {np.percentile(abs_residuals, 95):.4f}")
    print(f"  P99 abs residual:  {np.percentile(abs_residuals, 99):.4f}")
    print(f"  Max abs residual:  {abs_residuals.max():.4f}")

    # 5. Error by development type
    print("\n[5] Error by Development Type...")
    type_errors = []
    for dtype in df_test["development_type"].unique():
        mask = df_test["development_type"].values == dtype
        m = compute_metrics(y_test[mask], y_pred[mask])
        type_errors.append({
            "Type": dtype,
            "Count": mask.sum(),
            "MAE": m["MAE"],
            "RMSE": m["RMSE"],
            "R²": m["R2"],
            "MAPE%": m["MAPE"],
        })
    type_errors_df = pd.DataFrame(type_errors).sort_values("MAE")
    print(type_errors_df.to_string(index=False))

    # 6. Error by hour
    print("\n[6] Error by Hour...")
    hour_errors = []
    for h in range(24):
        mask = df_test["hour"].values == h
        if mask.sum() > 0:
            m = compute_metrics(y_test[mask], y_pred[mask])
            hour_errors.append({"Hour": h, "MAE": m["MAE"], "RMSE": m["RMSE"], "R²": m["R2"]})
    hour_errors_df = pd.DataFrame(hour_errors)
    print(hour_errors_df.to_string(index=False))

    # 7. Error by month
    print("\n[7] Error by Month...")
    month_errors = []
    for mo in df_test["month"].unique():
        mask = df_test["month"].values == mo
        m = compute_metrics(y_test[mask], y_pred[mask])
        month_errors.append({"Month": mo, "MAE": m["MAE"], "RMSE": m["RMSE"], "R²": m["R2"]})
    month_errors_df = pd.DataFrame(month_errors).sort_values("Month")
    print(month_errors_df.to_string(index=False))

    # 8. Error by demand level
    print("\n[8] Error by Demand Level...")
    demand_bins = pd.qcut(y_test, q=5, labels=["Very Low", "Low", "Medium", "High", "Very High"])
    level_errors = []
    for level in ["Very Low", "Low", "Medium", "High", "Very High"]:
        mask = demand_bins == level
        m = compute_metrics(y_test[mask], y_pred[mask])
        level_errors.append({
            "Level": level,
            "Range": f"{y_test[mask].min():.2f}-{y_test[mask].max():.2f}",
            "MAE": m["MAE"],
            "MAPE%": m["MAPE"],
        })
    level_errors_df = pd.DataFrame(level_errors)
    print(level_errors_df.to_string(index=False))

    # 9. Top errors
    print("\n[9] Top 10 Largest Errors...")
    top_idx = np.argsort(abs_residuals)[::-1][:10]
    top_errors = pd.DataFrame({
        "actual": y_test[top_idx],
        "predicted": y_pred[top_idx],
        "residual": residuals[top_idx],
        "abs_error": abs_residuals[top_idx],
        "type": df_test.iloc[top_idx]["development_type"].values,
        "hour": df_test.iloc[top_idx]["hour"].values,
        "temperature": df_test.iloc[top_idx]["temperature_c"].values,
    })
    print(top_errors.to_string(index=False))

    # 10. SHAP Explainability
    print("\n[10] Computing SHAP values...")
    try:
        inner_model = model.named_steps["model"]

        # Get feature names after preprocessing
        prep = model.named_steps["prep"]
        all_names = model_num_feats.copy()
        for cname, ct, cols in prep.transformers_:
            if cname == "cat" and hasattr(ct, "get_feature_names_out"):
                all_names.extend(list(ct.get_feature_names_out(model_cat_feats)))

        # Get transformed test data
        X_test_transformed = prep.transform(X_test_raw)
        if hasattr(X_test_transformed, "toarray"):
            X_test_transformed = X_test_transformed.toarray()

        X_test_df = pd.DataFrame(X_test_transformed, columns=all_names[:X_test_transformed.shape[1]])

        sample_idx = np.random.RandomState(SEED).choice(len(X_test_df), min(500, len(X_test_df)), replace=False)
        X_sample = X_test_df.iloc[sample_idx]

        explainer = shap.TreeExplainer(inner_model)
        shap_values = explainer.shap_values(X_sample)

        mean_abs_shap = np.abs(shap_values).mean(axis=0)
        feat_names = list(X_test_df.columns)
        shap_df = pd.DataFrame({
            "feature": feat_names[:len(mean_abs_shap)],
            "mean_abs_shap": mean_abs_shap
        }).sort_values("mean_abs_shap", ascending=False)

        shap_df.to_csv(REPORTS_DIR / "shap_importance.csv", index=False)
        print("  Top 15 SHAP features:")
        for _, row in shap_df.head(15).iterrows():
            print(f"    {row['feature']:45s} {row['mean_abs_shap']:.4f}")
    except Exception as e:
        print(f"  SHAP failed: {e}")

    # 11. Permutation importance
    print("\n[11] Computing permutation importance...")
    try:
        result = permutation_importance(model, X_test_raw, y_test,
                                        n_repeats=10, random_state=SEED, n_jobs=-1)
        feature_names = model_num_feats + model_cat_feats
        perm_df = pd.DataFrame({
            "feature": feature_names[:len(result.importances_mean)],
            "importance_mean": result.importances_mean,
            "importance_std": result.importances_std,
        }).sort_values("importance_mean", ascending=False)

        perm_df.to_csv(REPORTS_DIR / "permutation_importance.csv", index=False)
        print("  Top 15 permutation features:")
        for _, row in perm_df.head(15).iterrows():
            print(f"    {row['feature']:45s} {row['importance_mean']:.4f} +/- {row['importance_std']:.4f}")
    except Exception as e:
        print(f"  Permutation importance failed: {e}")

    # 12. Save summary report
    print("\n[12] Saving summary report...")
    report = {
        "selected_model": "extra_trees",
        "test_metrics": {k: float(v) if not np.isnan(v) else None for k, v in test_metrics.items()},
        "inference_time_ms": round(inf_time, 6),
        "error_by_type": type_errors_df.to_dict(orient="records"),
        "error_by_hour_summary": {
            "worst_hour": int(hour_errors_df.loc[hour_errors_df["MAE"].idxmax(), "Hour"]),
            "best_hour": int(hour_errors_df.loc[hour_errors_df["MAE"].idxmin(), "Hour"]),
        },
        "residual_stats": {
            "mean": float(residuals.mean()),
            "std": float(residuals.std()),
            "median_abs": float(np.median(abs_residuals)),
        },
    }
    (REPORTS_DIR / "analysis_report.json").write_text(
        json.dumps(report, indent=2, default=str), encoding="utf-8"
    )
    print("  Done.")


if __name__ == "__main__":
    main()
