"""Diagnostic plots + optional SHAP for the traffic volume model."""
from __future__ import annotations

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

from common import MODELS_DIR, PLOTS_DIR, SEED, log


def make_plots(df, masks, y, test_pred, best_name) -> None:
    yt = y[masks["test"]]
    pt = np.asarray(test_pred)
    resid = yt - pt

    log("plots ...")
    # 1. actual vs predicted
    fig, ax = plt.subplots(figsize=(6.5, 6))
    ax.hexbin(yt, pt, gridsize=80, bins="log", cmap="viridis", mincnt=1)
    lim = float(max(yt.max(), pt.max())) * 1.02
    ax.plot([0, lim], [0, lim], "r--", lw=1, label="ideal")
    ax.set(xlabel="actual traffic_volume", ylabel="predicted",
           title=f"Actual vs Predicted - test ({best_name})")
    ax.legend()
    fig.tight_layout()
    fig.savefig(PLOTS_DIR / "actual_vs_predicted.png", dpi=150)
    plt.close(fig)

    # 2. residual distribution
    fig, ax = plt.subplots(figsize=(8, 5))
    ax.hist(resid, bins=120, color="#3b6fb6")
    ax.set(title="Residual distribution (actual - predicted), test set", xlabel="residual")
    fig.tight_layout()
    fig.savefig(PLOTS_DIR / "residual_distribution.png", dpi=150)
    plt.close(fig)

    # 3. residual vs predicted
    fig, ax = plt.subplots(figsize=(8, 5.5))
    ax.hexbin(pt, resid, gridsize=80, bins="log", cmap="magma", mincnt=1)
    ax.axhline(0, color="r", ls="--", lw=1)
    ax.set(xlabel="predicted", ylabel="residual", title="Residuals vs Predicted, test set")
    fig.tight_layout()
    fig.savefig(PLOTS_DIR / "residual_vs_predicted.png", dpi=150)
    plt.close(fig)

    # 4. traffic by hour
    hour = df.loc[masks["test"], "hour"].to_numpy()
    grp = pd.DataFrame({"h": hour, "y": yt, "p": pt}).groupby("h").mean()
    fig, ax = plt.subplots(figsize=(8, 5))
    ax.plot(grp.index, grp["y"], "o-", label="actual")
    ax.plot(grp.index, grp["p"], "s--", label="predicted")
    ax.set(xlabel="hour of day", ylabel="mean traffic_volume",
           title="Traffic volume by hour - actual vs predicted (test)")
    ax.legend()
    fig.tight_layout()
    fig.savefig(PLOTS_DIR / "traffic_by_hour.png", dpi=150)
    plt.close(fig)

    # 5. performance over time (daily MAE in test window)
    dts = df.loc[masks["test"], "date"]
    daily = pd.DataFrame({"d": dts, "ae": np.abs(resid)}).groupby("d")["ae"].mean()
    fig, ax = plt.subplots(figsize=(10, 4.5))
    ax.plot(daily.index, daily.values)
    ax.set(title="Mean absolute error per day - test period", xlabel="date", ylabel="MAE")
    fig.autofmt_xdate()
    fig.tight_layout()
    fig.savefig(PLOTS_DIR / "performance_over_time.png", dpi=150)
    plt.close(fig)

    # 6. feature importance
    fi = pd.read_csv("reports/feature_importance.csv").head(20)[::-1]
    fig, ax = plt.subplots(figsize=(8, 6.5))
    ax.barh(fi["feature"], fi["gain_importance"], color="#2a7f62")
    ax.set(title=f"XGBoost feature importance (gain) - {best_name}",
           xlabel="gain")
    fig.tight_layout()
    fig.savefig(PLOTS_DIR / "feature_importance.png", dpi=150)
    plt.close(fig)

    _try_shap(df, masks, best_name)


def _try_shap(df, masks, best_name) -> None:
    """Optional SHAP on a small test sample; silently skipped if unavailable."""
    try:
        import shap

        import xgboost as xgb

        feats = [c for c in df.columns if c not in ("road_id", "date", "traffic_volume")]
        Xs = df.loc[masks["test"], feats]
        idx = np.random.RandomState(SEED).choice(
            len(Xs), size=min(20_000, len(Xs)), replace=False)
        Xsamp = Xs.iloc[idx]

        import xgboost as xgb
        booster = xgb.Booster()
        booster.load_model(MODELS_DIR / "traffic_xgboost_model.json")

        log(f"SHAP on {len(Xsamp):,}-row sample ...")
        explainer = shap.TreeExplainer(booster)
        sv = explainer.shap_values(Xsamp)
        imp = pd.Series(np.abs(sv).mean(axis=0), index=feats).sort_values(ascending=False)
        imp.head(20)[::-1].plot.barh(figsize=(8, 6), color="#7a4fa3",
                                     title=f"SHAP mean(|value|) top-20 - {best_name}")
        plt.tight_layout()
        plt.savefig(PLOTS_DIR / "shap_summary.png", dpi=150)
        plt.close()
        imp.rename("mean_abs_shap").to_csv("reports/shap_importance.csv",
                                           index_label="feature")
        log("saved reports/plots/shap_summary.png + reports/shap_importance.csv")
    except Exception as e:  # noqa: BLE001
        log(f"SHAP skipped ({type(e).__name__}: {e})")
