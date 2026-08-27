import json, numpy as np, pandas as pd, xgboost as xgb
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from pathlib import Path

PROJ = Path('.')
DATA_PATH = PROJ / 'data/processed/traffic_ml_clean.parquet'
META_PATH = PROJ / 'models/preprocessing_metadata.json'

df = pd.read_parquet(DATA_PATH)
m = json.load(open(META_PATH))
feats = m['features']
target = 'traffic_volume'
y = df[target].to_numpy()

splits = m['split_dates']
masks = {n: (df['date'] >= a) & (df['date'] <= b) for n, (a, b) in splits.items()}
train_mask = masks['train']
val_mask = masks['validation']
test_mask = masks['test']

xgb_params = dict(
    n_estimators=1500, learning_rate=0.05, max_depth=9, min_child_weight=5,
    subsample=0.8, colsample_bytree=0.8, reg_lambda=1.0,
    tree_method='hist', enable_categorical=True, random_state=42,
    n_jobs=-1, objective='reg:squarederror', eval_metric='rmse',
)

xgb_base = xgb.XGBRegressor(**xgb_params)
xgb_base.fit(df[feats][train_mask], y[train_mask],
             eval_set=[(df[feats][val_mask], y[val_mask])],
             verbose=False)

for tag, mask in [('train', train_mask), ('validation', val_mask), ('test', test_mask)]:
    y_pred = xgb_base.predict(df[feats][mask])
    y_true = y[mask]
    mae = float(mean_absolute_error(y_true, y_pred))
    rmse = float(np.sqrt(mean_squared_error(y_true, y_pred)))
    r2 = float(r2_score(y_true, y_pred))
    nonzero_mask = y_true != 0
    mape = float(np.mean(np.abs((y_true[nonzero_mask] - y_pred[nonzero_mask]) / y_true[nonzero_mask])) * 100) if nonzero_mask.sum() > 0 else float('nan')
    median_ae = float(np.median(np.abs(y_true - y_pred)))
    ev = float(1 - np.var(y_true - y_pred) / np.var(y_true - np.mean(y_true)))
    print(f'{tag:7s} MAE={mae:8.2f} RMSE={rmse:9.2f} R2={r2:.4f} MAPE={mape:.1f} MedianAE={median_ae:.2f} ExplVar={ev:.4f}')

print()
print('=== Actual vs Predicted Stats (Test) ===')
y_pred = xgb_base.predict(df[feats][test_mask])
y_true = y[test_mask]
print(f'Mean actual:      {y_true.mean():.2f}')
print(f'Mean predicted:   {y_pred.mean():.2f}')
print(f'Std actual:       {y_true.std():.2f}')
print(f'Std predicted:    {y_pred.std():.2f}')
print(f'Max error:        {(y_true - y_pred).abs().max():.2f}')
print(f'Min error:        {(y_true - y_pred).abs().min():.2f}')
print(f'Mean absolute error: {mae:.2f}')
print(f'Mean error (pred - actual): {(y_pred - y_true).mean():.2f}')

# Per-zone-type analysis if highway column exists
print()
print('=== Performance by Highway Category (Test) ===')
hw_map = {0: 'motorway', 1: 'trunk', 2: 'primary', 3: 'secondary', 4: 'tertiary', 
          5: 'unclassified', 6: 'residential', 7: 'living_street', 8: 'pedestrian',
          9: 'path', 10: 'cycleway', 11: 'service', 12: 'unknown'}
df['highway_name'] = df['highway'].map(hw_map)
for hw, label in hw_map.items():
    mask = df['highway'] == hw
    if mask.sum() > 0 and test_mask[mask].sum() > 0:
        yt = y[test_mask & mask]
        yp = xgb_base.predict(df[feats][test_mask & mask])
        mae = float(mean_absolute_error(yt, yp))
        rmse = float(np.sqrt(mean_squared_error(yt, yp)))
        r2 = float(r2_score(yt, yp))
        print(f'{label:15s} n={mask.sum():5d} Test MAE={mae:8.2f} RMSE={rmse:9.2f} R2={r2:.4f}')

# Per-hour analysis
print()
print('=== Performance by Hour (Test) ===')
for h in range(24):
    mask = (df['hour'] == h) & test_mask
    if mask.sum() > 0:
        yt = y[mask]
        yp = xgb_base.predict(df[feats][mask])
        mae = float(mean_absolute_error(yt, yp))
        rmse = float(np.sqrt(mean_squared_error(yt, yp)))
        r2 = float(r2_score(yt, yp))
        print(f'Hour {h:2d} ({h}:00) n={mask.sum():3d} MAE={mae:8.2f} RMSE={rmse:9.2f} R2={r2:.4f}')

# Weekend vs weekday
print()
print('=== Weekend vs Weekday (Test) ===')
mask_weekend = (df['is_weekend'] == 1) & test_mask
mask_weekday = (df['is_weekend'] == 0) & test_mask
yt_weekend = y[mask_weekend]
yp_weekend = xgb_base.predict(df[feats][mask_weekend])
yt_weekday = y[mask_weekday]
yp_weekday = xgb_base.predict(df[feats][mask_weekday])
mae_w = float(mean_absolute_error(yt_weekend, yp_weekend))
rmse_w = float(np.sqrt(mean_squared_error(yt_weekend, yp_weekend)))
r2_w = float(r2_score(yt_weekend, yp_weekend))
mae_d = float(mean_absolute_error(yt_weekday, yp_weekday))
rmse_d = float(np.sqrt(mean_squared_error(yt_weekday, yp_weekday)))
r2_d = float(r2_score(yt_weekday, yp_weekday))
print(f'Weekend   n={mask_weekend.sum():5d} MAE={mae_w:8.2f} RMSE={rmse_w:9.2f} R2={r2_w:.4f}')
print(f'Weekday   n={mask_weekday.sum():5d} MAE={mae_d:8.2f} RMSE={rmse_d:9.2f} R2={r2_d:.4f}')