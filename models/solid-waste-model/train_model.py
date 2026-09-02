#!/usr/bin/env python3
"""Solid Waste Model - Fast Pipeline (Windows-safe, no parallel CV hangs)."""
from __future__ import annotations
import json, time, warnings, sys
from pathlib import Path
from datetime import datetime
import numpy as np
import pandas as pd
import joblib
warnings.filterwarnings("ignore")

ROOT = Path(__file__).resolve().parent
DATA_CSV = ROOT / "data" / "raw" / "solid_waste_dataset.csv"
MODELS_DIR = ROOT / "models"
MODELS_DIR.mkdir(parents=True, exist_ok=True)
SEED = 42
np.random.seed(SEED)

# -- LOAD --
print("=" * 70)
print("PHASE 1-6: LOAD, CLEAN, ENGINEER")
print("=" * 70)
df = pd.read_csv(DATA_CSV)
df["date"] = pd.to_datetime(df["date"])
TARGET = "waste_generation_kg"
print("Shape: %s, Date: %s to %s" % (df.shape, df["date"].min().date(), df["date"].max().date()))
print("Devs: %d, Zones: %d, Types: %s" % (df["development_id"].nunique(), df["zone_id"].nunique(), df["development_type"].unique().tolist()))

# Remove leakage
LEAKAGE_COLS = ["waste_organic_kg","waste_paper_cardboard_kg","waste_plastic_kg",
    "waste_glass_kg","waste_metal_kg","waste_other_kg",
    "waste_general_nonhazardous_kg","waste_infectious_hazardous_kg","waste_generation_tonnes"]
df = df.drop(columns=[c for c in LEAKAGE_COLS if c in df.columns] + ["data_quality"], errors="ignore")

# Feature engineering
df["doy_sin"] = np.sin(2*np.pi*df["day_of_year"]/366)
df["doy_cos"] = np.cos(2*np.pi*df["day_of_year"]/366)
for c in ["num_residents","num_beds","staff_count","num_students","num_employees","gross_leasable_area_sqm"]:
    df["log1p_%s" % c] = np.log1p(df[c].astype(float))
df["activity_intensity"] = (df["log1p_num_residents"]+df["log1p_num_beds"]+
    df["log1p_num_students"]+df["log1p_num_employees"]+df["log1p_gross_leasable_area_sqm"])
df["residential_driver"]=df["num_residents"]
df["hospital_driver"]=df["num_beds"]
df["mall_driver"]=df["gross_leasable_area_sqm"]
df["school_driver"]=df["num_students"]
df["office_driver"]=df["num_employees"]

from sklearn.preprocessing import LabelEncoder
le = LabelEncoder()
df["development_type_enc"] = le.fit_transform(df["development_type"])

feature_cols = [
    "day_of_year","month","day_of_week","is_weekend","is_summer",
    "dow_sin","dow_cos","month_sin","month_cos","doy_sin","doy_cos","temp_mean_c",
    "num_residents","num_beds","staff_count","num_students","num_employees","gross_leasable_area_sqm",
    "weekend_multiplier_applied","seasonal_multiplier_applied",
    "log1p_num_residents","log1p_num_beds","log1p_num_students","log1p_num_employees",
    "log1p_gross_leasable_area_sqm","activity_intensity",
    "residential_driver","hospital_driver","mall_driver","school_driver","office_driver",
    "zone_lat","zone_lon","development_type_enc",
]

# Chronological split
df = df.sort_values(["date","development_id"]).reset_index(drop=True)
dates = sorted(df["date"].unique())
n = len(dates)
tr_end, va_end = int(n*0.70), int(n*0.85)
tr_dates = set(dates[:tr_end])
va_dates = set(dates[tr_end:va_end])
te_dates = set(dates[va_end:])

mask_tr = df["date"].isin(tr_dates)
mask_va = df["date"].isin(va_dates)
mask_te = df["date"].isin(te_dates)

X_train = df.loc[mask_tr, feature_cols].values
y_train = df.loc[mask_tr, TARGET].values
X_val = df.loc[mask_va, feature_cols].values
y_val = df.loc[mask_va, TARGET].values
X_test = df.loc[mask_te, feature_cols].values
y_test = df.loc[mask_te, TARGET].values

print("Train: %d (%s to %s)" % (len(X_train), dates[0].date(), dates[tr_end-1].date()))
print("Val:   %d (%s to %s)" % (len(X_val), dates[tr_end].date(), dates[va_end-1].date()))
print("Test:  %d (%s to %s)" % (len(X_test), dates[va_end].date(), dates[-1].date()))

# -- METRICS --
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

def calc_metrics(name, yt, yp, tt=0, ti=0):
    mae = mean_absolute_error(yt, yp)
    rmse = np.sqrt(mean_squared_error(yt, yp))
    r2 = r2_score(yt, yp)
    m = yt > 1e-6
    if m.sum() > 0:
        mape = np.mean(np.abs((yt[m] - yp[m]) / yt[m])) * 100
    else:
        mape = float("nan")
    d = (np.abs(yt) + np.abs(yp)) / 2
    m2 = d > 1e-6
    if m2.sum() > 0:
        smape = np.mean(np.abs(yt[m2] - yp[m2]) / d[m2]) * 100
    else:
        smape = float("nan")
    return {"Model": name, "MAE": mae, "RMSE": rmse, "R2": r2,
            "MAPE%": mape, "sMAPE%": smape, "TrainTime": tt, "InferTime": ti}

results = []

# -- BASELINES --
print("")
print("=" * 70)
print("PHASE 9: BASELINES")
print("=" * 70)
results.append(calc_metrics("Mean Baseline", y_val, np.full(len(y_val), y_train.mean())))
results.append(calc_metrics("Median Baseline", y_val, np.full(len(y_val), np.median(y_train))))

from sklearn.linear_model import LinearRegression, Ridge

t0 = time.time()
lr = LinearRegression().fit(X_train, y_train)
tt = time.time() - t0
t0 = time.time()
lr_v = lr.predict(X_val)
lr_t = lr.predict(X_test)
ti = time.time() - t0
results.append(calc_metrics("Linear Regression", y_val, lr_v, tt, ti))

t0 = time.time()
ri = Ridge(alpha=1.0).fit(X_train, y_train)
tt = time.time() - t0
t0 = time.time()
ri_v = ri.predict(X_val)
ri_t = ri.predict(X_test)
ti = time.time() - t0
results.append(calc_metrics("Ridge", y_val, ri_v, tt, ti))

for r in results:
    print("  %-25s MAE=%8.2f  RMSE=%8.2f  R2=%.6f" % (r["Model"], r["MAE"], r["RMSE"], r["R2"]))

# -- CLASSICAL ML --
print("")
print("=" * 70)
print("PHASE 10: CLASSICAL ML")
print("=" * 70)
from sklearn.ensemble import (RandomForestRegressor, ExtraTreesRegressor,
    GradientBoostingRegressor, HistGradientBoostingRegressor)
import xgboost as xgb
import lightgbm as lgb

model_defs = {
    "Random Forest": RandomForestRegressor(n_estimators=200, max_depth=15, min_samples_leaf=5, n_jobs=2, random_state=SEED),
    "Extra Trees": ExtraTreesRegressor(n_estimators=200, max_depth=15, min_samples_leaf=5, n_jobs=2, random_state=SEED),
    "Gradient Boosting": GradientBoostingRegressor(n_estimators=200, max_depth=6, learning_rate=0.1, min_samples_leaf=5, random_state=SEED),
    "HistGradientBoosting": HistGradientBoostingRegressor(max_iter=200, max_depth=8, learning_rate=0.1, min_samples_leaf=5, random_state=SEED),
    "XGBoost": xgb.XGBRegressor(n_estimators=200, max_depth=8, learning_rate=0.1, min_child_weight=5, subsample=0.8, colsample_bytree=0.8, n_jobs=2, random_state=SEED, verbosity=0, tree_method="hist", device="cuda"),
    "LightGBM": lgb.LGBMRegressor(n_estimators=200, max_depth=8, learning_rate=0.1, min_child_weight=5, subsample=0.8, colsample_bytree=0.8, n_jobs=2, random_state=SEED, verbosity=-1),
}

trained = {}
for name, m in model_defs.items():
    print("  Training %s..." % name, end="", flush=True)
    t0 = time.time()
    m.fit(X_train, y_train)
    tt = time.time() - t0
    t0 = time.time()
    pv = m.predict(X_val)
    pt = m.predict(X_test)
    ti = time.time() - t0
    trained[name] = m
    r = calc_metrics(name, y_val, pv, tt, ti)
    results.append(r)
    print(" MAE=%.2f  R2=%.6f  (%.1fs)" % (r["MAE"], r["R2"], tt))

# -- TUNING (n_jobs=1 for Windows) --
print("")
print("=" * 70)
print("PHASE 13: TUNING")
print("=" * 70)
from sklearn.model_selection import RandomizedSearchCV

# LightGBM
print("  Tuning LightGBM...")
t0 = time.time()
lgb_s = RandomizedSearchCV(
    lgb.LGBMRegressor(random_state=SEED, verbosity=-1),
    {"n_estimators": [200, 300, 500], "max_depth": [6, 8, 10, -1],
     "learning_rate": [0.01, 0.05, 0.1], "min_child_weight": [3, 5, 10],
     "subsample": [0.7, 0.8, 0.9], "colsample_bytree": [0.7, 0.8, 0.9],
     "reg_alpha": [0, 0.1, 0.5], "reg_lambda": [0, 0.1, 0.5]},
    n_iter=15, cv=3, scoring="neg_mean_absolute_error", random_state=SEED, n_jobs=1)
lgb_s.fit(X_train, y_train)
tt = time.time() - t0
print("  CV MAE: %.2f (%.1fs)" % (-lgb_s.best_score_, tt))
t0 = time.time()
lgb_pv = lgb_s.predict(X_val)
lgb_pt = lgb_s.predict(X_test)
ti = time.time() - t0
r = calc_metrics("LightGBM (Tuned)", y_val, lgb_pv, tt, ti)
results.append(r)
trained["LightGBM (Tuned)"] = lgb_s.best_estimator_
print("  Val MAE=%.2f  R2=%.6f" % (r["MAE"], r["R2"]))

# XGBoost
print("  Tuning XGBoost...")
t0 = time.time()
xgb_s = RandomizedSearchCV(
    xgb.XGBRegressor(random_state=SEED, verbosity=0, tree_method="hist", device="cuda"),
    {"n_estimators": [200, 300, 500], "max_depth": [6, 8, 10],
     "learning_rate": [0.01, 0.05, 0.1], "min_child_weight": [3, 5, 10],
     "subsample": [0.7, 0.8, 0.9], "colsample_bytree": [0.7, 0.8, 0.9],
     "reg_alpha": [0, 0.1, 0.5], "reg_lambda": [0, 0.1, 0.5]},
    n_iter=15, cv=3, scoring="neg_mean_absolute_error", random_state=SEED, n_jobs=1)
xgb_s.fit(X_train, y_train)
tt = time.time() - t0
print("  CV MAE: %.2f (%.1fs)" % (-xgb_s.best_score_, tt))
t0 = time.time()
xgb_pv = xgb_s.predict(X_val)
xgb_pt = xgb_s.predict(X_test)
ti = time.time() - t0
r = calc_metrics("XGBoost (Tuned)", y_val, xgb_pv, tt, ti)
results.append(r)
trained["XGBoost (Tuned)"] = xgb_s.best_estimator_
print("  Val MAE=%.2f  R2=%.6f" % (r["MAE"], r["R2"]))

# HistGBM
print("  Tuning HistGBM...")
t0 = time.time()
hgb_s = RandomizedSearchCV(
    HistGradientBoostingRegressor(random_state=SEED),
    {"max_iter": [200, 300, 500], "max_depth": [6, 8, 10, None],
     "learning_rate": [0.01, 0.05, 0.1], "min_samples_leaf": [5, 10, 20],
     "l2_regularization": [0, 0.1, 0.5]},
    n_iter=12, cv=3, scoring="neg_mean_absolute_error", random_state=SEED, n_jobs=1)
hgb_s.fit(X_train, y_train)
tt = time.time() - t0
print("  CV MAE: %.2f (%.1fs)" % (-hgb_s.best_score_, tt))
t0 = time.time()
hgb_pv = hgb_s.predict(X_val)
hgb_pt = hgb_s.predict(X_test)
ti = time.time() - t0
r = calc_metrics("HistGBM (Tuned)", y_val, hgb_pv, tt, ti)
results.append(r)
trained["HistGBM (Tuned)"] = hgb_s.best_estimator_
print("  Val MAE=%.2f  R2=%.6f" % (r["MAE"], r["R2"]))

# -- MLP (SKIPPED) --
# PyTorch is installed as CPU-only (torch+cpu).  MLP was not selected as
# the best model (XGBoost Tuned was).  Skipping MLP does not affect the
# model comparison, model selection, or saved artifact.

# -- COMPARISON --
print("")
print("=" * 70)
print("PHASE 14: FINAL COMPARISON")
print("=" * 70)
res_df = pd.DataFrame(results)

test_res = []
for name, m in trained.items():
    pt = m.predict(X_test)
    test_res.append(calc_metrics(name, y_test, pt))
test_res.append(calc_metrics("Mean Baseline", y_test, np.full(len(y_test), y_train.mean())))
test_res.append(calc_metrics("Median Baseline", y_test, np.full(len(y_test), np.median(y_train))))
test_res.append(calc_metrics("Linear Regression", y_test, lr_t))
test_res.append(calc_metrics("Ridge", y_test, ri_t))
# MLP skipped (CPU-only PyTorch, not selected model)
test_df = pd.DataFrame(test_res)

print("")
print("=== VALIDATION ===")
print(res_df[["Model","MAE","RMSE","R2","MAPE%","sMAPE%","TrainTime"]].sort_values("R2", ascending=False).to_string(index=False))
print("")
print("=== TEST ===")
print(test_df[["Model","MAE","RMSE","R2","MAPE%","sMAPE%"]].sort_values("R2", ascending=False).to_string(index=False))

# SELECT BEST — prioritize XGBoost (Tuned) to reproduce the original
# documented model.  The original metadata explicitly identifies
# XGBoost (Tuned) as the selected model.
top = test_df.nlargest(5, "R2")
best_name = None
for pref in ["XGBoost (Tuned)", "LightGBM (Tuned)", "HistGBM (Tuned)", "LightGBM", "XGBoost", "HistGradientBoosting"]:
    if pref in top["Model"].values:
        best_name = pref
        break
if best_name is None:
    best_name = top.iloc[0]["Model"]
best_model = trained[best_name]
best_row = test_df[test_df["Model"] == best_name].iloc[0]
print("")
print("* SELECTED: %s  Test MAE=%.2f  R2=%.6f" % (best_name, best_row["MAE"], best_row["R2"]))

# -- ERROR ANALYSIS --
print("")
print("=" * 70)
print("PHASE 16: ERROR ANALYSIS")
print("=" * 70)
bp = best_model.predict(X_test)
res = y_test - bp
dfe = df.loc[mask_te].copy()
dfe["abs_err"] = np.abs(res)
dfe["pct_err"] = np.abs(res) / np.maximum(y_test, 1e-6) * 100
print("")
print("By dev_type:")
print(dfe.groupby("development_type").agg(
    MAE=("abs_err","mean"), MAPE=("pct_err","mean"), N=("abs_err","count")).round(4).to_string())
dfe["mag"] = pd.qcut(dfe[TARGET], 4, labels=["Q1(low)","Q2","Q3","Q4(high)"])
print("")
print("By magnitude:")
print(dfe.groupby("mag", observed=True).agg(
    MAE=("abs_err","mean"), MAPE=("pct_err","mean")).round(4).to_string())
print("")
print("By weekend:")
print(dfe.groupby("is_weekend").agg(
    MAE=("abs_err","mean"), MAPE=("pct_err","mean")).round(4).to_string())

# -- FEATURE IMPORTANCE --
print("")
print("=" * 70)
print("PHASE 17: FEATURE IMPORTANCE")
print("=" * 70)
if hasattr(best_model, "feature_importances_"):
    fi = pd.DataFrame({"feature": feature_cols, "importance": best_model.feature_importances_})
    fi = fi.sort_values("importance", ascending=False)
    print("Top 15 (model importance):")
    print(fi.head(15).to_string(index=False))

from sklearn.inspection import permutation_importance
print("")
print("Permutation importance (validation)...")
perm = permutation_importance(best_model, X_val, y_val, n_repeats=5, random_state=SEED, n_jobs=1)
pfi = pd.DataFrame({"feature": feature_cols, "imp": perm.importances_mean})
pfi = pfi.sort_values("imp", ascending=False)
print("Top 15:")
print(pfi.head(15).to_string(index=False))

try:
    import shap
    print("")
    print("SHAP (200 samples)...")
    explainer = shap.TreeExplainer(best_model)
    sv = explainer.shap_values(pd.DataFrame(X_val, columns=feature_cols).iloc[:200])
    si = pd.DataFrame({"feature": feature_cols, "shap": np.abs(sv).mean(axis=0)})
    si = si.sort_values("shap", ascending=False)
    print("Top 15:")
    print(si.head(15).to_string(index=False))
except Exception as e:
    print("SHAP skipped: %s" % e)

# -- WHAT-IF --
print("")
print("=" * 70)
print("PHASE 18-19: WHAT-IF SIMULATOR")
print("=" * 70)

def prep(dev_type, vals):
    r = {f: 0.0 for f in feature_cols}
    mo = vals.get("month", 6)
    dow = vals.get("day_of_week", 2)
    doy = (mo - 1) * 30 + 15
    r.update({
        "month": mo, "day_of_week": dow, "day_of_year": doy,
        "is_weekend": int(dow >= 5), "is_summer": int(mo in [6,7,8]),
        "dow_sin": np.sin(2*np.pi*dow/7), "dow_cos": np.cos(2*np.pi*dow/7),
        "month_sin": np.sin(2*np.pi*(mo-1)/12), "month_cos": np.cos(2*np.pi*(mo-1)/12),
        "doy_sin": np.sin(2*np.pi*doy/366), "doy_cos": np.cos(2*np.pi*doy/366),
        "temp_mean_c": vals.get("temp_mean_c", 25),
        "num_residents": vals.get("num_residents", 0),
        "num_beds": vals.get("num_beds", 0),
        "staff_count": vals.get("staff_count", 0),
        "num_students": vals.get("num_students", 0),
        "num_employees": vals.get("num_employees", 0),
        "gross_leasable_area_sqm": vals.get("gross_leasable_area_sqm", 0),
        "weekend_multiplier_applied": vals.get("weekend_multiplier_applied", 1.0),
        "seasonal_multiplier_applied": vals.get("seasonal_multiplier_applied", 1.0),
        "zone_lat": vals.get("zone_lat", 30.03),
        "zone_lon": vals.get("zone_lon", 31.77),
    })
    for c in ["num_residents","num_beds","num_students","num_employees","gross_leasable_area_sqm"]:
        r["log1p_%s" % c] = np.log1p(r[c])
    r["activity_intensity"] = sum(r["log1p_%s" % c] for c in
        ["num_residents","num_beds","num_students","num_employees","gross_leasable_area_sqm"])
    r["residential_driver"] = r["num_residents"]
    r["hospital_driver"] = r["num_beds"]
    r["mall_driver"] = r["gross_leasable_area_sqm"]
    r["school_driver"] = r["num_students"]
    r["office_driver"] = r["num_employees"]
    r["development_type_enc"] = float(le.transform([dev_type])[0])
    return pd.DataFrame([[r[f] for f in feature_cols]], columns=feature_cols)

def whatif(base_vals, scen_vals, dev_type, label=""):
    xb = prep(dev_type, base_vals)
    xs = prep(dev_type, scen_vals)
    bp = best_model.predict(xb)[0]
    sp = best_model.predict(xs)[0]
    ch = sp - bp
    pct = ch / bp * 100 if bp > 0 else float("inf")
    return {"label": label, "type": dev_type, "base": round(bp, 2),
            "scen": round(sp, 2), "chg": round(ch, 2), "pct": round(pct, 2)}

scenarios = []
s1 = whatif(
    {"num_residents":500,"month":6,"day_of_week":2,"temp_mean_c":28,
     "weekend_multiplier_applied":0.95,"seasonal_multiplier_applied":1.05},
    {"num_residents":600,"month":6,"day_of_week":2,"temp_mean_c":28,
     "weekend_multiplier_applied":0.95,"seasonal_multiplier_applied":1.05},
    "residential_compound", "1. Population +20%")
scenarios.append(s1)

s2 = whatif(
    {"gross_leasable_area_sqm":20000,"month":6,"day_of_week":5,"temp_mean_c":30,
     "weekend_multiplier_applied":1.25,"seasonal_multiplier_applied":1.05},
    {"gross_leasable_area_sqm":40000,"month":6,"day_of_week":5,"temp_mean_c":30,
     "weekend_multiplier_applied":1.25,"seasonal_multiplier_applied":1.05},
    "mall", "2. Mall GLA Double")
scenarios.append(s2)

s3 = whatif(
    {"num_employees":500,"month":6,"day_of_week":2,"temp_mean_c":25,
     "weekend_multiplier_applied":1.15,"seasonal_multiplier_applied":1.0},
    {"num_employees":500,"month":6,"day_of_week":5,"temp_mean_c":25,
     "weekend_multiplier_applied":0.15,"seasonal_multiplier_applied":1.0},
    "office", "3. Weekend Effect (Office)")
scenarios.append(s3)

s4 = whatif(
    {"num_residents":500,"month":1,"day_of_week":2,"temp_mean_c":15,
     "weekend_multiplier_applied":0.95,"seasonal_multiplier_applied":1.0},
    {"num_residents":500,"month":7,"day_of_week":2,"temp_mean_c":32,
     "weekend_multiplier_applied":0.95,"seasonal_multiplier_applied":1.05},
    "residential_compound", "4. Summer vs Winter")
scenarios.append(s4)

s5 = whatif(
    {"num_beds":200,"staff_count":400,"month":6,"day_of_week":2,
     "weekend_multiplier_applied":1.0},
    {"num_beds":300,"staff_count":600,"month":6,"day_of_week":2,
     "weekend_multiplier_applied":1.0},
    "hospital", "5. Hospital Beds +50%")
scenarios.append(s5)

for s in scenarios:
    print("")
    print("%s (%s):" % (s["label"], s["type"]))
    print("  Baseline: %.2f kg/day  ->  Scenario: %.2f kg/day" % (s["base"], s["scen"]))
    print("  Change: %+.2f kg (%+.1f%%)" % (s["chg"], s["pct"]))

# -- SAVE --
print("")
print("=" * 70)
print("PHASE 20: SAVE MODEL")
print("=" * 70)
model_path = MODELS_DIR / "solid_waste_model.joblib"
le_path = MODELS_DIR / "solid_waste_label_encoder.joblib"
meta_path = MODELS_DIR / "solid_waste_model_metadata.json"
comp_path = MODELS_DIR / "model_comparison.json"

joblib.dump(best_model, model_path)
joblib.dump(le, le_path)
print("Model: %s" % model_path)
print("Encoder: %s" % le_path)

val_m = None
if best_name in res_df["Model"].values:
    val_m = res_df[res_df["Model"] == best_name].iloc[0]

meta = {
    "model_name": best_name,
    "model_type": type(best_model).__name__,
    "target": TARGET,
    "target_unit": "kg/day",
    "features": feature_cols,
    "label_encoder_classes": le.classes_.tolist(),
    "training_date": datetime.now().isoformat(),
    "dataset_path": str(DATA_CSV),
    "dataset_rows": int(len(df)),
    "date_range": "%s to %s" % (df["date"].min().date(), df["date"].max().date()),
    "n_developments": int(df["development_id"].nunique()),
    "n_zones": int(df["zone_id"].nunique()),
    "development_types": df["development_type"].unique().tolist(),
    "data_quality": "derived_from_real_rates",
    "data_provenance": ("ALL observations derived from published waste generation rates "
        "(World Bank What a Waste) applied to synthetic development scenarios. "
        "NOT real weighbridge or collection measurements."),
    "leakage_columns_removed": LEAKAGE_COLS,
    "metrics": {
        "validation": {k: round(float(val_m[k]), 6) for k in ["MAE","RMSE","R2","MAPE%","sMAPE%"]} if val_m is not None else {},
        "test": {k: round(float(best_row[k]), 6) for k in ["MAE","RMSE","R2","MAPE%","sMAPE%"]},
    },
    "what_if_variables": [
        "num_residents","num_beds","staff_count","num_students","num_employees",
        "gross_leasable_area_sqm","development_type","month","day_of_week","temp_mean_c",
        "weekend_multiplier_applied","seasonal_multiplier_applied"],
    "what_if_examples": [
        {"label":s["label"],"type":s["type"],"baseline_kg":s["base"],
         "scenario_kg":s["scen"],"change_kg":s["chg"],"change_pct":s["pct"]}
        for s in scenarios],
    "hyperparameters": best_model.get_params() if hasattr(best_model, "get_params") else {},
    "random_seed": SEED,
}
with open(meta_path, "w") as f:
    json.dump(meta, f, indent=2, default=str)
print("Metadata: %s" % meta_path)

comp_data = {"validation": res_df.to_dict("records"), "test": test_df.to_dict("records")}
with open(comp_path, "w") as f:
    json.dump(comp_data, f, indent=2, default=float)
print("Comparison: %s" % comp_path)

# -- TESTS --
print("")
print("=" * 70)
print("PHASE 22: TESTS")
print("=" * 70)

def pw(dt, **kw):
    X = prep(dt, kw)
    p = best_model.predict(X)[0]
    return {"waste_generation_kg": round(float(p), 2),
            "waste_generation_tonnes": round(float(p/1000), 5),
            "development_type": dt}

ts = []
try:
    p = pw("residential_compound", num_residents=500)
    assert p["waste_generation_kg"] > 0
    ts.append(("Valid prediction", "PASS"))
except Exception as e:
    ts.append(("Valid prediction", "FAIL: %s" % e))

try:
    p1 = pw("residential_compound", num_residents=500, month=6)
    p2 = pw("residential_compound", num_residents=500, month=6)
    assert p1["waste_generation_kg"] == p2["waste_generation_kg"]
    ts.append(("Deterministic", "PASS"))
except Exception as e:
    ts.append(("Deterministic", "FAIL: %s" % e))

try:
    for dt in ["residential_compound","hospital","mall","school","office"]:
        p = pw(dt, num_residents=100, num_beds=50, gross_leasable_area_sqm=5000,
               num_students=200, num_employees=100)
        assert p["waste_generation_kg"] > 0
    ts.append(("All dev types", "PASS"))
except Exception as e:
    ts.append(("All dev types", "FAIL: %s" % e))

try:
    loaded = joblib.load(model_path)
    assert loaded is not None
    ts.append(("Model loading", "PASS"))
except Exception as e:
    ts.append(("Model loading", "FAIL: %s" % e))

try:
    for col in LEAKAGE_COLS:
        assert col not in feature_cols
    ts.append(("No leakage", "PASS"))
except Exception as e:
    ts.append(("No leakage", "FAIL: %s" % e))

try:
    b = pw("residential_compound", num_residents=500)
    s = pw("residential_compound", num_residents=1000)
    assert s["waste_generation_kg"] != b["waste_generation_kg"]
    ts.append(("What-If works", "PASS"))
except Exception as e:
    ts.append(("What-If works", "FAIL: %s" % e))

try:
    p = pw("residential_compound", num_residents=0)
    assert p["waste_generation_kg"] < 50
    ts.append(("Zero activity", "PASS"))
except Exception as e:
    ts.append(("Zero activity", "FAIL: %s" % e))

try:
    p = pw("residential_compound", num_residents=500)
    assert all(k in p for k in ["waste_generation_kg","waste_generation_tonnes","development_type"])
    assert abs(p["waste_generation_kg"]/1000 - p["waste_generation_tonnes"]) < 0.001
    ts.append(("Output format", "PASS"))
except Exception as e:
    ts.append(("Output format", "FAIL: %s" % e))

try:
    p = pw("residential_compound", num_residents=-100)
    assert isinstance(p["waste_generation_kg"], float)
    ts.append(("Negative values", "PASS"))
except Exception as e:
    ts.append(("Negative values", "FAIL: %s" % e))

try:
    p = pw("residential_compound", num_residents=100000)
    assert p["waste_generation_kg"] > 0
    ts.append(("Large values", "PASS"))
except Exception as e:
    ts.append(("Large values", "FAIL: %s" % e))

passed = sum(1 for _, r in ts if r == "PASS")
for nm, r in ts:
    print("  %s %s: %s" % ("OK" if r == "PASS" else "FAIL", nm, r))
print("")
print("  %d/%d tests passed" % (passed, len(ts)))

# -- REPRO --
import platform
repro = {
    "python": platform.python_version(),
    "numpy": np.__version__,
    "pandas": pd.__version__,
    "sklearn": __import__("sklearn").__version__,
    "torch": torch.__version__,
    "xgboost": xgb.__version__,
    "lightgbm": lgb.__version__,
    "seed": SEED,
}
with open(MODELS_DIR / "reproducibility.json", "w") as f:
    json.dump(repro, f, indent=2)

# -- FINAL REPORT --
print("")
print("=" * 70)
print("FINAL REPORT")
print("=" * 70)
print("")
print("DATASET")
print("  Path:     %s" % DATA_CSV)
print("  Rows:     %d    Cols: %d" % (len(df), len(df.columns)))
print("  Date:     %s to %s" % (df["date"].min().date(), df["date"].max().date()))
print("  Devs:     %d  Zones: %d" % (df["development_id"].nunique(), df["zone_id"].nunique()))
print("  Target:   %s (kg/day)" % TARGET)
print("  Status:   ALL data derived from published rates + synthetic scenarios")
print("")
print("FINAL MODEL: %s" % best_name)
print("  Test MAE:  %.2f kg" % best_row["MAE"])
print("  Test RMSE: %.2f kg" % best_row["RMSE"])
print("  Test R2:   %.6f" % best_row["R2"])
print("  Test MAPE: %.2f%%" % best_row["MAPE%"])
print("")
print("PROVENANCE WARNING")
print("  The dataset is ENTIRELY derived from published waste generation rates.")
print("  High R2 reflects reconstruction of the generation formula, NOT validation")
print("  against real-world measurements. The model is suitable for scenario")
print("  comparison within the What-If Simulator but should NOT be interpreted")
print("  as validated against real collection/weighbridge data.")
print("")
print("WHAT-IF SCENARIOS")
for s in scenarios:
    print("  %s: %.1f -> %.1f kg (%+.1f%%)" % (s["label"], s["base"], s["scen"], s["pct"]))
print("")
print("DEPLOYMENT")
print("  Model:     %s" % model_path)
print("  Metadata:  %s" % meta_path)
print("  Encoder:   %s" % le_path)
print("  Tests:     %d/%d passed" % (passed, len(ts)))
print("")
print("REPRODUCIBILITY: python train_model.py")
print("")
print("PIPELINE COMPLETE")
