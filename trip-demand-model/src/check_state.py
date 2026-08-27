import json
r = json.load(open('data/experiments/results.json'))
for k in r:
    if k.startswith('_'):
        continue
    v = r[k]['val']
    t = r[k]['test']
    print(f"{k:20s} val RMSE={v['RMSE']:8.1f} MAE={v['MAE']:8.1f} | test RMSE={t['RMSE']:8.1f} MAE={t['MAE']:8.1f} R2={t['R2']:.4f}")
