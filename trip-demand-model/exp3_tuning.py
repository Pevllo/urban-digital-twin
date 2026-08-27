import json, time, numpy as np, pandas as pd, xgboost as xgb
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from pathlib import Path

PROJ = Path('.')
DATA_PATH = PROJ / 'data/processed/traffic_ml_clean.parquet'
META_PATH = PROJ / 'models/preprocessing_metadata.json'

df = pd.read_parquet(DATA_PATH)
m = json.load(open(META_PATH))
feats = m["features"]
target = "traffic_volume"
y = df[target].to_numpy()

splits = m["split_dates"]
train_mask = (df["date"] >= splits["train"][0]) & (df["date"] <= splits["train"][1])
val_mask = (df["date"] >= splits["validation"][0]) & (df["date"] <= splits["validation"][1])
test_mask = (df["date"] >= splits["test"][0]) & (df["date"] <= splits["test"][1])

# Reduced search space - 15 configs, use subsample of train for speed
# We'll train on full data but with fewer boosting rounds for search

param_grid = {
    "max_depth": [6, 8, 10, 12],
    "min_child_weight": [1, 3, 5],
    "learning_rate": [0.02, 0.05, 0.08],
    "subsample": [0.8, 1.0],
    "colsample_bytree": [0.8, 1.0],
    "gamma": [0, 0.1],
    "reg_alpha": [0, 1],
    "reg_lambda": [1, 5],
}

np.random.seed(42)
n_configs = 15

best_rmse = float('inf')
best_params = None
results = []

n_estimators = 1500

for i in range(n_configs):
    params = {
        "max_depth": np.random.choice(param_grid["max_depth"]),
        "min_child_weight": np.random.choice(param_grid["min_child_weight"]),
        "learning_rate": np.random.choice(param_grid["learning_rate"]),
        "subsample": np.random.choice(param_grid["subsample"]),
        "colsample_bytree": np.random.choice(param_grid["colsample_bytree"]),
        "gamma": np.random.choice(param_grid["gamma"]),
        "reg_alpha": np.random.choice(param_grid["reg_alpha"]),
        "reg_lambda": np.random.choice(param_grid["reg_lambda"]),
    }
    
    xgb_ms = dict(
        n_estimators=n_estimators,
        learning_rate=params["learning_rate"],
        max_depth=params["max_depth"],
        min_child_weight=params["min_child_weight"],
        subsample=params["subsample"],
        colsample_bytree=params["colsample_bytree"],
        gamma=params["gamma"],
        reg_alpha=params["reg_alpha"],
        reg_lambda=params["reg_lambda"],
        tree_method="hist", enable_categorical=True, random_state=42,
        n_jobs=-1, objective="reg:squarederror",
        early_stopping_rounds=60, eval_metric="rmse",
    )
    
    xgb_ms_model = xgb.XGBRegressor(**xgb_ms)
    xgb_ms_model.fit(
        df[feats][train_mask], y[train_mask],
        eval_set=[(df[feats][val_mask], y[val_mask])],
        verbose=False
    )
    
    y_val_pred = xgb_ms_model.predict(df[feats][val_mask])
    val_rmse = float(np.sqrt(mean_squared_error(y[val_mask], y_val_pred)))
    val_mae = float(mean_absolute_error(y[val_mask], y_val_pred))
    val_r2 = float(r2_score(y[val_mask], y_val_pred))
    
    y_test_pred = xgb_ms_model.predict(df[feats][test_mask])
    test_mae = float(mean_absolute_error(y[test_mask], y_test_pred))
    test_rmse = float(np.sqrt(mean_squared_error(y[test_mask], y_test_pred)))
    test_r2 = float(r2_score(y[test_mask], y_test_pred))
    
    results.append({
        "params": params,
        "val_rmse": val_rmse, "val_mae": val_mae, "val_r2": val_r2,
        "test_mae": test_mae, "test_rmse": test_rmse, "test_r2": test_r2,
    })
    
    if val_rmse < best_rmse:
        best_rmse = val_rmse
        best_params = params
    
    if (i + 1) % 5 == 0:
        print(f"  Config {i+1}/{n_configs} done. Best val RMSE: {best_rmse:.2f}")

results.sort(key=lambda x: x["val_rmse"])

print(f"\nBest val RMSE: {best_rmse:.2f} with params: {best_params}")
print(f"\nTop configs by val RMSE:")
for r in results[:5]:
    print(f"  val_rmse={r['val_rmse']:.2f} test_mae={r['test_mae']:.2f} test_rmse={r['test_rmse']:.2f} test_r2={r['test_r2']:.4f} params={r['params']}")

# Final evaluation with best params
print(f"\n=== Final evaluation with best params: {best_params} ===")
xgb_best = xgb.XGBRegressor(
    n_estimators=n_estimators,
    learning_rate=best_params["learning_rate"],
    max_depth=best_params["max_depth"],
    min_child_weight=best_params["min_child_weight"],
    subsample=best_params["subsample"],
    colsample_bytree=best_params["colsample_bytree"],
    gamma=best_params["gamma"],
    reg_alpha=best_params["reg_alpha"],
    reg_lambda=best_params["reg_lambda"],
    tree_method="hist", enable_categorical=True, random_state=42,
    n_jobs=-1, objective="reg:squarederror",
    early_stopping_rounds=60, eval_metric="rmse",
)
xgb_best.fit(df[feats][train_mask], y[train_mask],
            eval_set=[(df[feats][val_mask], y[val_mask])],
            verbose=False)

y_test_pred = xgb_best.predict(df[feats][test_mask])
y_test_true = y[test_mask]
test_mae = float(mean_absolute_error(y_test_true, y_test_pred))
test_rmse = float(np.sqrt(mean_squared_error(y_test_true, y_test_pred)))
test_r2 = float(r2_score(y_test_true, y_test_pred))

print(f"Test MAE: {test_mae:.2f}")
print(f"Test RMSE: {test_rmse:.2f}")
print(f"Test R2: {test_r2:.4f}")
print(f"Baseline V1 Test: MAE=488.01 RMSE=1060.66 R2=0.879")

# Save results
import pandas as pd
results_df = pd.DataFrame(results)
results_df.to_csv("reports/hparam_tuning_results.csv", index=False)
print(f"\nSaved hparam results to reports/hparam_tuning_results.csv")