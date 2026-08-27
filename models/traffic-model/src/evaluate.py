"""
Model evaluation: metrics, error breakdowns, diagnostic plots, SHAP analysis.

Loads the saved model bundle and test data, produces:
  reports/model_evaluation.csv
  reports/model_error_breakdowns.csv
  reports/figures/H_actual_vs_predicted.png
  reports/figures/I_residual_plot.png
  reports/figures/J_error_distribution.png
  reports/figures/K_error_by_hour.png
  reports/figures/L_error_by_road_type.png
  reports/figures/M_shap_summary.png
  reports/figures/N_feature_importance.png
"""

import joblib
import numpy as np
import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import shap

import config
import train


def load_bundle():
    return joblib.load(config.MODEL_ARTIFACTS)


def get_test_data(df=None):
    if df is None:
        df = train.build_features()
    _, _, (_, q80) = train.chronological_splits(df)
    test = df[df["timestamp"] >= q80].copy()
    return test, df


def overall_metrics(y_true, y_pred) -> pd.DataFrame:
    rows = []
    for name, yt, yp in [("full_test", y_true, y_pred)]:
        mae = float(np.mean(np.abs(yt - yp)))
        rmse = float(np.sqrt(np.mean((yt - yp) ** 2)))
        r2 = 1 - np.sum((yt - yp) ** 2) / np.sum((yt - yt.mean()) ** 2)
        mape = float(np.mean(np.abs((yt - yp) / np.maximum(yt, 1))) * 100)
        rows.append({"subset": name, "MAE": round(mae, 2),
                      "RMSE": round(rmse, 2), "R2": round(r2, 4),
                      "MAPE_%": round(mape, 2), "n": len(yt)})
    return pd.DataFrame(rows)


def breakdown_by(test: pd.DataFrame, y_pred: np.ndarray, col: str) -> pd.DataFrame:
    test = test.copy()
    test["pred"] = y_pred
    test["abs_error"] = np.abs(test["traffic_volume"] - y_pred)
    test["squared_error"] = (test["traffic_volume"] - y_pred) ** 2
    grp = test.groupby(col).agg(
        n=("abs_error", "size"),
        mean_true=("traffic_volume", "mean"),
        mean_pred=("pred", "mean"),
        MAE=("abs_error", "mean"),
        RMSE=("squared_error", lambda x: float(np.sqrt(x.mean()))),
    ).round(2)
    return grp


def fig_actual_vs_predicted(y_true, y_pred):
    fig, ax = plt.subplots(figsize=(7, 7))
    sample_n = min(50000, len(y_true))
    idx = np.random.default_rng(config.RANDOM_SEED).choice(len(y_true), sample_n, replace=False)
    ax.scatter(y_true[idx], y_pred[idx], alpha=0.15, s=3, c="steelblue")
    lim = max(y_true.max(), y_pred.max()) * 1.05
    ax.plot([0, lim], [0, lim], "r--", lw=1.5, label="perfect")
    ax.set_xlabel("actual traffic_volume (veh/h)")
    ax.set_ylabel("predicted traffic_volume (veh/h)")
    ax.set_title("Actual vs Predicted (test set, sampled)")
    ax.legend()
    fig.savefig(config.FIGURES_DIR / "H_actual_vs_predicted.png", dpi=150, bbox_inches="tight")
    plt.close(fig)


def fig_residuals(y_true, y_pred):
    res = y_true - y_pred
    fig, axes = plt.subplots(1, 2, figsize=(12, 4.5))
    axes[0].scatter(y_pred, res, alpha=0.12, s=2, c="steelblue")
    axes[0].axhline(0, color="red", ls="--")
    axes[0].set_xlabel("predicted"); axes[0].set_ylabel("residual")
    axes[0].set_title("Residuals vs predicted")
    axes[1].hist(res, bins=80, color="steelblue")
    axes[1].set_title(f"Residual distribution (mean={res.mean():.1f}, std={res.std():.1f})")
    axes[1].set_xlabel("residual")
    fig.savefig(config.FIGURES_DIR / "I_residual_plot.png", dpi=150, bbox_inches="tight")
    plt.close(fig)


def fig_error_distribution(y_true, y_pred):
    ae = np.abs(y_true - y_pred)
    fig, axes = plt.subplots(1, 2, figsize=(12, 4.5))
    axes[0].hist(ae, bins=80, color="steelblue")
    axes[0].set_title("Absolute error distribution")
    axes[0].set_xlabel("|error| veh/h")
    axes[1].hist(np.log1p(ae), bins=80, color="seagreen")
    axes[1].set_title("log(1+|error|)")
    fig.savefig(config.FIGURES_DIR / "J_error_distribution.png", dpi=150, bbox_inches="tight")
    plt.close(fig)


def fig_error_by_hour(test: pd.DataFrame, y_pred: np.ndarray):
    test = test.copy()
    test["abs_error"] = np.abs(test["traffic_volume"] - y_pred)
    by_h = test.groupby("hour")["abs_error"].mean()
    fig, ax = plt.subplots(figsize=(9, 4.5))
    ax.bar(by_h.index, by_h.values, color="steelblue")
    ax.set_xlabel("hour"); ax.set_ylabel("mean |error| veh/h")
    ax.set_title("Mean absolute error by hour of day")
    fig.savefig(config.FIGURES_DIR / "K_error_by_hour.png", dpi=150, bbox_inches="tight")
    plt.close(fig)


def fig_error_by_road_type(test: pd.DataFrame, y_pred: np.ndarray):
    test = test.copy()
    test["abs_error"] = np.abs(test["traffic_volume"] - y_pred)
    by_h = test.groupby("road_type")["abs_error"].mean().sort_values()
    fig, ax = plt.subplots(figsize=(9, 5))
    ax.barh(by_h.index, by_h.values, color="steelblue")
    ax.set_xlabel("mean |error| veh/h")
    ax.set_title("Mean absolute error by road type")
    fig.savefig(config.FIGURES_DIR / "L_error_by_road_type.png", dpi=150, bbox_inches="tight")
    plt.close(fig)


def fig_feature_importance(model, feature_names):
    booster = model.named_steps["model"].get_booster()
    imp = booster.get_score(importance_type="gain")
    name_map = {f"f{i}": feature_names[i] for i in range(len(feature_names))}
    imp_df = pd.DataFrame({"feature": [name_map.get(k, k) for k in imp.keys()],
                            "gain": list(imp.values())})
    imp_df = imp_df.sort_values("gain", ascending=False).head(20)
    fig, ax = plt.subplots(figsize=(8, 6))
    ax.barh(imp_df["feature"][::-1], imp_df["gain"][::-1], color="steelblue")
    ax.set_xlabel("gain importance")
    ax.set_title("XGBoost feature importance (top 20)")
    fig.savefig(config.FIGURES_DIR / "N_feature_importance.png", dpi=150, bbox_inches="tight")
    plt.close(fig)
    return imp_df


def fig_shap_summary(model, X_sample, feature_names):
    try:
        prep = model.named_steps["prep"]
        X_t = prep.transform(X_sample)
        xgb_model = model.named_steps["model"]
        explainer = shap.TreeExplainer(xgb_model, feature_perturbation="tree_path_dependent")
        shap_values = explainer.shap_values(X_t)
        fig, ax = plt.subplots(figsize=(9, 7))
        shap.summary_plot(shap_values, features=X_t, feature_names=feature_names,
                          show=False, max_display=20)
        plt.title("SHAP feature importance (XGBoost test sample)")
        plt.tight_layout()
        plt.savefig(config.FIGURES_DIR / "M_shap_summary.png", dpi=150, bbox_inches="tight")
        plt.close("all")
        print("SHAP summary saved")
    except Exception as e:
        print(f"SHAP failed ({type(e).__name__}: {e}) -> using gain importance instead")
        return None


def main():
    print("=== Loading model + test data ===")
    bundle = load_bundle()
    model = bundle["model"]
    test, full_df = get_test_data()
    X_test = test[train.MODEL_FEATURES]
    y_test = test["traffic_volume"].values
    print(f"test rows: {len(test):,}")

    print("=== Predictions ===")
    y_pred = model.predict(X_test)

    print("=== Overall metrics ===")
    metrics = overall_metrics(y_test, y_pred)
    metrics.to_csv(config.REPORTS_DIR / "model_evaluation.csv", index=False)
    print(metrics.to_string(index=False))

    print("=== Error breakdowns ===")
    breakdowns = {}
    test_q = test.copy()
    test_q["traffic_range"] = pd.qcut(test_q["traffic_volume"], q=4,
                                       labels=["low", "mid_low", "mid_high", "high"])
    test_q["capacity_quartile"] = pd.qcut(test_q["road_capacity_proxy"], q=4,
                                           labels=["cap_low", "cap_mid", "cap_high", "cap_max"],
                                           duplicates="drop")

    for col in ["hour", "road_type", "road_hierarchy", "traffic_range", "capacity_quartile"]:
        bd = breakdown_by(test_q, y_pred, col)
        breakdowns[col] = bd
        print(f"\n--- {col} ---")
        print(bd.to_string())

    bd_df = pd.concat({k: v for k, v in breakdowns.items()}, names=["breakdown", "value"])
    bd_df.to_csv(config.REPORTS_DIR / "model_error_breakdowns.csv")

    print("=== Diagnostic plots ===")
    fig_actual_vs_predicted(y_test, y_pred)
    fig_residuals(y_test, y_pred)
    fig_error_distribution(y_test, y_pred)
    fig_error_by_hour(test, y_pred)
    fig_error_by_road_type(test, y_pred)
    print("Diagnostic plots saved")

    print("=== Feature importance + SHAP ===")
    prep = model.named_steps["prep"]
    feat_names = list(prep.get_feature_names_out())
    imp_df = fig_feature_importance(model, feat_names)
    print("Top-10 features by gain:")
    print(imp_df.head(10).to_string(index=False))

    rng = np.random.default_rng(config.RANDOM_SEED)
    shap_sample = X_test.sample(n=min(2000, len(X_test)), random_state=config.RANDOM_SEED)
    fig_shap_summary(model, shap_sample, feat_names)

    print("=== DONE ===")
    return metrics, breakdowns


if __name__ == "__main__":
    main()
