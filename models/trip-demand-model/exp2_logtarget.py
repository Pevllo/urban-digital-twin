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
y_log = np.log1p(y)

splits = m["split_dates"]
masks = {n: (df["date"] >= a) & (df["date"] <= b) for n, (a, b) in splits.items()}

# Already sorted from feature engineering
train_mask = masks["train"]
val_mask = masks["validation"]
test_mask = masks["test"]

xgb_params = dict(
    n_estimators=1500, learning_rate=0.05, max_depth=9, min_child_weight=5,
    subsample=0.8, colsample_bytree=0.8, reg_lambda=1.0,
    tree_method="hist", enable_categorical=True, random_state=42,
    n_jobs=-1, objective="reg:squarederror",
    early_stopping_rounds=60, eval_metric="rmse",
)

t0 = time.time()
xgb_log = xgb.XGBRegressor(**xgb_params)
xgb_log.fit(df[feats][train_mask], y_log[train_mask],
            eval_set=[(df[feats][val_mask], y_log[val_mask])],
            verbose=False)
log_time = time.time() - t0

for tag, mask in [("train", train_mask), ("validation", val_mask), ("test", test_mask)]:
    y_log_pred = xgb_log.predict(df[feats][mask])
    y_pred = np.expm1(y_log_pred)
    y_true = y[mask]
    mae = float(mean_absolute_error(y_true, y_pred))
    rmse = float(np.sqrt(mean_squared_error(y_true, y_pred)))
    r2 = float(r2_score(y_true, y_pred))
    print(f"xgb_log {tag:7s} MAE={mae:8.2f} RMSE={rmse:9.2f} R2={r2:.4f} (time={log_time:.0f}s)")

print("\nBaseline V1 test comparison:")
y_test_pred = np.expm1(xgb_log.predict(df[feats][test_mask]))
y_test_true = y[test_mask]
mae_b = float(mean_absolute_error(y_test_true, y_test_pred))
rmse_b = float(np.sqrt(mean_squared_error(y_test_true, y_test_pred)))
r2_b = float(r2_score(y_test_true, y_test_pred))
print(f"  xgb_log test: MAE={mae_b:8.2f} RMSE={rmse_b:9.2f} R2={r2_b:.4f}")
print(f"  Baseline V1:   MAE=488.01 RMSE=1060.66 R2=0.879")