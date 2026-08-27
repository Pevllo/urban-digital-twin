"""Builder: creates + executes the two project notebooks."""
import json
import sys
from pathlib import Path

import nbformat as nbf

ROOT = Path(__file__).resolve().parents[1]
NB_DIR = ROOT / "notebooks"


def code(src: str) -> dict:
    return {"cell_type": "code", "metadata": {}, "execution_count": None,
            "outputs": [], "source": src}


def md(src: str) -> dict:
    return {"cell_type": "markdown", "metadata": {}, "source": src}


def build(name: str, cells: list[dict]) -> None:
    nb = {"cells": cells,
          "metadata": {"kernelspec": {"display_name": "Python 3", "language": "python",
                                      "name": "python3"},
                       "language_info": {"name": "python", "version": "3.13"}},
          "nbformat": 4, "nbformat_minor": 5}
    NB_DIR.mkdir(exist_ok=True)
    path = NB_DIR / name
    path.write_text(json.dumps(nb, indent=1), encoding="utf-8")
    print("built", path)


# ----------------------------------------------------------------- notebook 01
build("01_feature_engineering.ipynb", [
    md("# 01 — Feature Engineering\n"
       "Road-level traffic volume prediction.\n\n"
       "Reproduces `src/feature_engineering.py`: inspection → cleaning → features.\n"
       "Source data is **never modified**; outputs go to `data/processed/`."),
    code(
        "import os, sys\n"
        "PROJ = os.getcwd()\n"
        "while not os.path.exists(os.path.join(PROJ, 'src', 'feature_engineering.py')):\n"
        "    PROJ = os.path.dirname(PROJ)\n"
        "os.chdir(PROJ)\n"
        "sys.path.insert(0, os.path.join(PROJ, 'src'))\n"
        "import pandas as pd\n"
        "pd.set_option('display.width', 160)\n"
        "from feature_engineering import load_raw, clean, add_features, chronological_split_dates, FEATURES"),
    md("## 1. Load raw ML dataset (read-only)"),
    code("df = load_raw()\nprint(f'{len(df):,} rows x {df.shape[1]} cols')\ndf.head()"),
    md("## 2. Data-quality checks"),
    code(
        "mv = df.isna().sum()\n"
        "print('missing values per column:\\n', mv[mv > 0] if mv.any() else 'none')\n"
        "print('duplicate keys:', df.duplicated(['road_id','date','hour']).sum())\n"
        "t = df['traffic_volume']\n"
        "print('\\ntarget stats: min=%d max=%d mean=%.1f median=%.1f std=%.1f skew=%.2f zeros=%.1f%%'\n"
        "      % (t.min(), t.max(), t.mean(), t.median(), t.std(), t.skew(), (t==0).mean()*100))"),
    md("## 3. Cleaning decisions (see reports/leakage_audit.md)\n"
       "- drop `intersection_density` — constant everywhere\n"
       "- drop `highway_code` — arbitrary ordinal duplicate of `highway`\n"
       "- `road_id` kept as identifier, excluded from model features\n"
       "- `is_weekend` uses Fri/Sat convention (matches demand dip) — kept as-is"),
    code("dfc = clean(df)\nprint('after clean:', dfc.shape)"),
    md("## 4. Engineered features"),
    code(
        "dfe = add_features(dfc.head(100_000).copy())\n"
        "dfe[[c for c in FEATURES if c.startswith(('hour_','dow_','road_length_log','lane_speed'))]].head()"),
    md("## 5. Chronological splits (determined from actual date range)"),
    code(
        "for k, (a, b) in chronological_split_dates().items():\n"
        "    m = (df['date'] >= a) & (df['date'] <= b)\n"
        f"    print(f'{{k:11s}} {{a}} .. {{b}}: {{m.sum():,}} rows')"),
    md("## Regenerate full cleaned dataset\n"
       "`python src/feature_engineering.py` writes "
       "`data/processed/traffic_ml_clean.csv` (+ `.parquet` cache + `feature_metadata.json`)."),
])

# ----------------------------------------------------------------- notebook 02
build("02_model_training.ipynb", [
    md("# 02 — Model Training & Evaluation\n"
       "Chronological train/val/test split · baselines · LinearRegression · "
       "RandomForest · XGBoost.\n\n"
       "Full training lives in `src/train_models.py` (~15 min). This notebook "
       "reproduces results from saved artifacts; set `RETRAIN = True` to re-run.\n\n"
       "Section 6 reproduces the full **MODEL IMPROVEMENT EXPERIMENT** "
       "(feature engineering · log-target · tuning · two-stage · ensemble · ablation · "
       "error analysis · spatial holdout) from saved artifacts."),
    code(
        "import os, sys, json\n"
        "PROJ = os.getcwd()\n"
        "while not os.path.exists(os.path.join(PROJ, 'src', 'feature_engineering.py')):\n"
        "    PROJ = os.path.dirname(PROJ)\n"
        "os.chdir(PROJ)\n"
        "sys.path.insert(0, os.path.join(PROJ, 'src'))\n"
        "RETRAIN = False"),
    md("## 1. Setup & split definition"),
    code(
        "import json, pandas as pd\n"
        "meta = json.load(open('data/processed/feature_metadata.json'))\n"
        "print('features:', len(meta['features']))\n"
        "print(meta['features'])\n"
        "print('split dates:', meta['split_dates'])"),
    md("## 2. Results (reports/model_results.csv)"),
    code(
        "res = pd.read_csv('reports/model_results.csv')\n"
        "piv = res.pivot(index='model', columns='split', values=['MAE','RMSE','R2']).round(3)\n"
        "piv[['RMSE']].sort_values(('RMSE','validation'))"),
    code("piv"),
    md("**Reading:** LinearRegression ≈ mean baseline → signal is entirely non-linear/"
       "interaction-based. XGBoost wins validation RMSE (1014.6) → saved as best model."),
    md("## 3. Optional full retraining"),
    code(
        "if RETRAIN:\n"
        "    import subprocess\n"
        "    subprocess.run([sys.executable, 'src/train_models.py'], check=True)\n"
        "else:\n"
        "    print('RETRAIN=False - using saved artifacts')"),
    md("## 4. Feature importance"),
    code(
        "fi = pd.read_csv('reports/feature_importance.csv')\n"
        "fi.head(10)"),
    code(
        "from IPython.display import Image, display\n"
        "for p in ['feature_importance', 'shap_summary', 'actual_vs_predicted',\n"
        "          'traffic_by_hour', 'performance_over_time', 'residual_distribution',\n"
        "          'residual_vs_predicted']:\n"
        "    display(Image(filename=f'reports/plots/{p}.png', width=640))"),
    md("## 5. Reload saved model (What-If simulation entry point)"),
    code(
        "import xgboost as xgb\n"
        "booster = xgb.Booster()\n"
        "booster.load_model('models/traffic_xgboost_model.json')\n"
        "print('model loaded | features:', booster.num_features())\n"
        "\n"
        "sample = pd.read_parquet('data/processed/traffic_ml_clean.parquet').tail(5)\n"
        "feats = meta['features']\n"
        "X = sample[feats].copy()\n"
        "X['highway'] = X['highway'].astype('category')\n"
        "pred = booster.inplace_predict(X)\n"
        "out = sample[['road_id','date','hour']].assign(predicted_volume=pred.round(1),\n"
        "                                               actual=sample['traffic_volume'])\n"
        "out"),
    md("**Model artifact:** `models/traffic_xgboost_model.json` + "
       "`models/preprocessing_metadata.json` (feature list, category order, split dates, params)."),
    md("---\n"
       "# 6. MODEL IMPROVEMENT EXPERIMENT\n"
       "Controlled experiments on top of preserved **BASELINE_V1** "
       "(`models/traffic_xgboost_model_baseline_v1.json`, Test R² = 0.879 / MAE = 488).\n\n"
       "Protocol:\n"
       "- chronological split untouched; **validation set drives every decision** "
       "(feature groups, tuning ranking, two-stage combination strategy, ensemble weights);\n"
       "- chronological test set evaluated once per finished candidate;\n"
       "- spatial holdout runs once at the end as a robustness check only;\n"
       "- only prediction-time-available features used (no target-derived leakage);\n"
       "- BASELINE_V1 is never modified or replaced."),
    md("## 6.0 Experiment runner\n"
       "Stages live in `src/run_experiments.py`: "
       "`exp1` (feature groups + log-target) · `tune` (randomized search) · "
       "`twostage` · `ensemble` · `report` (ablation CSV + error analysis + spatial holdout). "
       "All are long-running; artifacts already exist and are loaded below."),
    code(
        "RERUN = False\n"
        "if RERUN:\n"
        "    import subprocess\n"
        "    for stage in ['exp1', 'tune', 'twostage', 'ensemble', 'report']:\n"
        "        subprocess.run([sys.executable, 'src/run_experiments.py', stage], check=True)\n"
        "else:\n"
        "    print('RERUN=False - loading saved experiment artifacts')"),
    md("## 6.1 Candidate overview (validation-ranked)"),
    code(
        "res = json.load(open('data/experiments/results.json'))\n"
        "rows = []\n"
        "for k in ['xgb_roadextra','xgb_temporalint','xgb_network','xgb_allfeats',\n"
        "          'xgb_logtarget','xgb_tuned','twostage','ensemble']:\n"
        "    if k in res:\n"
        "        rows.append({'candidate': k,\n"
        "                     'val_RMSE': round(res[k]['val']['RMSE'],1),\n"
        "                     'val_MAE': round(res[k]['val']['MAE'],1),\n"
        "                     'test_RMSE': round(res[k]['test']['RMSE'],1),\n"
        "                     'test_MAE': round(res[k]['test']['MAE'],1),\n"
        "                     'test_R2': round(res[k]['test']['R2'],4)})\n"
        "pd.DataFrame(rows).sort_values('val_RMSE')"),
    md("## 6.2 EXP1 — feature-group ablation\n"
       "Single-group additions to the 22 base features (all computable at prediction time): "
       "**road extras** (`lane_count×road_length`, `speed_limit×road_length`), "
       "**network** (from/to node degree, connectivity min/max, hierarchy level), "
       "**temporal interactions** (highway×hour/peak/weekend, lanes×peak, speed×peak, "
       "length×hour, dow×hour)."),
    code(
        "base_test = pd.read_csv('reports/model_results.csv')\n"
        "base_test = base_test[(base_test.model=='XGBoost') & (base_test.split=='test')].iloc[0]\n"
        "grp = {'A_base22 (BASELINE_V1)': None, 'B_+road_extra':'xgb_roadextra',\n"
        "       'C_+temporal_int':'xgb_temporalint', 'D_+network':'xgb_network',\n"
        "       'D2_all_groups':'xgb_allfeats'}\n"
        "rows=[]\n"
        "for label,k in grp.items():\n"
        "    r = res[k] if k else {'test':{'MAE':base_test.MAE,'RMSE':base_test.RMSE,'R2':base_test.R2}}\n"
        "    rows.append({'variant':label,'MAE':round(r['test']['MAE'],1),\n"
        "                 'RMSE':round(r['test']['RMSE'],1),'R2':round(r['test']['R2'],4)})\n"
        "pd.DataFrame(rows)"),
    code(
        "display(Image(filename='reports/plots/model_comparison.png', width=760))"),
    md("**Reading:** road-extras and network features each cut test RMSE by ~10%; temporal "
       "interactions alone are weak/noisy, but combined (**all groups**) they deliver the "
       "largest gain: MAE 488→343, R² 0.879→0.933."),
    md("## 6.3 EXP2 — log-target model\n"
       "`log1p(traffic_volume)` training + `expm1()` inverse, evaluated on the raw scale."),
    code(
        "lt, af = res['xgb_logtarget'], res['xgb_allfeats']\n"
        "print(f\"log-target : test MAE={lt['test']['MAE']:.1f} RMSE={lt['test']['RMSE']:.1f} R2={lt['test']['R2']:.4f}\")\n"
        "print(f\"raw-target : test MAE={af['test']['MAE']:.1f} RMSE={af['test']['RMSE']:.1f} R2={af['test']['R2']:.4f}\")\n"
        "print('\\n=> rejected: on a zero-inflated, heavy-tailed target the log transform '\n"
        "      'optimizes relative error and worsens absolute-scale fit.')"),
    md("## 6.4 EXP3 — controlled randomized XGBoost tuning\n"
       "24-config randomized search over depth/mcw/lr/subsample/colsample/gamma/"
       "reg_alpha/reg_lambda on a 2.5M-row train subsample, ranked on full validation; "
       "winner refitted on full train. Test set untouched during search."),
    code(
        "trials = json.load(open('data/experiments/tune_trials.json'))\n"
        "t = pd.DataFrame([{'val_RMSE': round(x['val_RMSE'],1), **x['cfg']} for x in trials])\n"
        "t.sort_values('val_RMSE').head(5)"),
    code(
        "tn = res.get('xgb_tuned')\n"
        "if tn:\n"
        "    print('best config:', tn['params'])\n"
        "    print(f\"full-train refit: val RMSE={tn['val']['RMSE']:.1f} | \"\n"
        "          f\"test MAE={tn['test']['MAE']:.1f} RMSE={tn['test']['RMSE']:.1f} \"\n"
        "          f\"R2={tn['test']['R2']:.4f}\")") ,
    md("## 6.5 EXP4 — two-stage zero-inflated model\n"
       "Stage 1: XGBoost classifier for `volume > 0` (36.8% zeros). Stage 2: regressor on "
       "positive rows only. Combination strategy selected on validation."),
    code(
        "ts = res.get('twostage')\n"
        "if ts:\n"
        "    print('combination:', json.loads(ts['params'])['combination'])\n"
        "    print(f\"combined: test MAE={ts['test']['MAE']:.1f} RMSE={ts['test']['RMSE']:.1f} \"\n"
        "          f\"R2={ts['test']['R2']:.4f}\")\n"
        "    display(pd.DataFrame(ts['band_metrics_test']).T.round(1))"),
    md("**Reading:** the classifier cannot reliably separate true zeros from near-zero "
       "demand (zeros stem from demand randomness, not observable attributes), so gating "
       "adds error instead of removing it."),
    md("## 6.6 EXP5 — validation-weighted ensemble\n"
       "Non-negative weights optimized on validation MSE only (SLSQP); single test evaluation."),
    code(
        "en = res.get('ensemble')\n"
        "if en:\n"
        "    w = pd.Series(en['weights']).sort_values(ascending=False)\n"
        "    display(w.to_frame('weight'))\n"
        "    print(f\"ensemble: test MAE={en['test']['MAE']:.1f} RMSE={en['test']['RMSE']:.1f} \"\n"
        "          f\"R2={en['test']['R2']:.4f}\")"),
    md("## 6.7 EXP6 — ablation summary (`reports/model_improvement_results.csv`)"),
    code("pd.read_csv('reports/model_improvement_results.csv')"),
    md("## 6.8 EXP7 — error analysis of the selected model"),
    code(
        "for name in ['error_by_hour', 'error_by_highway', 'error_by_volume_band']:\n"
        "    print(name)\n"
        "    display(Image(filename=f'reports/plots/{name}.png', width=700))"),
    code(
        "eh = pd.read_csv('reports/error_analysis_by_highway.csv')\n"
        "eb = pd.read_csv('reports/error_analysis_by_band.csv')\n"
        "ep = pd.read_csv('reports/error_analysis_by_peak.csv')\n"
        "display(eh.round(1)); display(eb.round(1)); display(ep.round(1))\n"
        "\n"
        "dom = res.get('_selection', {}).get('arterial_dominance', {})\n"
        "if dom:\n"
        "    print(f\"top-decile roads: {dom['top_decile_roads_share_of_rows']*100:.1f}% of rows, \"\n"
        "          f\"{dom['top_decile_share_of_squared_error']*100:.1f}% of squared error -> \"\n"
        "          \"RMSE is dominated by high-volume arterials\")"),
    md("## 6.9 EXP8 — spatial generalization (one-shot)\n"
       "~20% of roads held out entirely from training; evaluated on their future period. "
       "Run once after final selection; never used for tuning."),
    code(
        "sp = res.get('_spatial_holdout', {})\n"
        "if sp:\n"
        "    display(pd.DataFrame({k: v for k, v in sp.items()\n"
        "                          if isinstance(v, dict)}).T.round(3))"),
    md("### Final selection & comparison\n"
       "Selection rule: **validation first**, then untouched chronological test, then one-shot "
       "spatial check — never highest R² alone."),
    code(
        "meta_best = json.load(open('models/best_model_metadata.json'))\n"
        "print('winner:', meta_best['winner'])\n"
        "print('validation ranking:')\n"
        "for i, r in enumerate(meta_best['validation_ranking'], 1):\n"
        "    print(f\"  {i}. {r['model']:15s} {r['val_RMSE']:.1f}\")\n"
        "\n"
        "abl = pd.read_csv('reports/model_improvement_results.csv')\n"
        "label_map = [('G_tuned_xgboost','xgb_tuned'),('H_ensemble','ensemble'),\n"
        "             ('F_two_stage','twostage'),('D2_combined_features','xgb_allfeats'),\n"
        "             ('D_network_features','xgb_network'),('B_road_features','xgb_roadextra'),\n"
        "             ('C_temporal_interactions','xgb_temporalint'),\n"
        "             ('E_log_target','xgb_logtarget')]\n"
        "wlab = next(lab for lab, k in label_map if k == meta_best['winner'])\n"
        "b = abl[abl.experiment=='A_BASELINE_V1'].iloc[0]\n"
        "w = abl[abl.experiment==wlab].iloc[0]\n"
        "print(f\"\\nBASELINE_V1              : MAE={b.MAE:7.1f}  RMSE={b.RMSE:8.1f}  R2={b.R2:.4f}\")\n"
        "print(f\"BEST ({wlab:22s}): MAE={w.MAE:7.1f}  RMSE={w.RMSE:8.1f}  R2={w.R2:.4f}\")\n"
        "print(f\"delta                    : MAE {w.MAE-b.MAE:+7.1f} ({(w.MAE/b.MAE-1)*100:+.1f}%)   \"\n"
        "      f\"RMSE {w.RMSE-b.RMSE:+8.1f} ({(w.RMSE/b.RMSE-1)*100:+.1f}%)\")\n"
        "print('\\nNOTE: labels are synthetic - results demonstrate methodology, '\n"
        "      'NOT real-world accuracy.')"),
])

# ------------------------------------------------------------------- execute
if __name__ == "__main__":
    from nbclient import NotebookClient

    targets = sys.argv[1:] or ["01_feature_engineering.ipynb", "02_model_training.ipynb"]
    for name in targets:
        nb = nbf.read(NB_DIR / name, as_version=4)
        NotebookClient(nb, timeout=1200, kernel_name="python3").execute()
        nbf.write(nb, NB_DIR / name)
        print("executed", name)
