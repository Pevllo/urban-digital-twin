"""Step 1: Data quality inspection of traffic_ml_dataset.csv.gz (read-only)."""
import gzip
import json

import numpy as np
import pandas as pd

pd.set_option("display.width", 200)

RAW = "data/raw/traffic_ml_dataset.csv.gz"
OUT = "reports/data_inspection.txt"

# Read once, memory-efficient dtypes
usecols = None
dtypes_hint = {
    "hour": "int8", "highway_code": "int16", "is_oneway": "int8",
    "is_bridge": "int8", "is_tunnel": "int8", "day_of_week": "int8",
    "month": "int8", "is_weekend": "int8", "is_peak_hour": "int8",
    "morning_peak": "int8", "evening_peak": "int8",
}
df = pd.read_csv(RAW, dtype=dtypes_hint, parse_dates=["date"])
buf = []


def log(*args):
    s = " ".join(str(a) for a in args)
    buf.append(s)
    print(s)


log("=" * 70)
log("DATA INSPECTION: traffic_ml_dataset.csv.gz")
log("=" * 70)
log(f"rows={len(df):,}  cols={df.shape[1]}  mem={df.memory_usage(deep=True).sum()/1e6:.1f} MB")
log("\n--- dtypes ---")
log(df.dtypes.to_string())
log("\n--- columns ---")
log(list(df.columns))

log("\n--- missing values ---")
mv = df.isna().sum()
log(mv[mv > 0].to_string() if mv.any() else "none")

log("\n--- duplicated rows ---")
log(f"full-row duplicates: {df.duplicated().sum():,}")
log(f"duplicate (road_id,date,hour) keys: {df.duplicated(subset=['road_id','date','hour']).sum():,}")

log("\n--- cardinality ---")
for c in df.columns:
    if df[c].nunique() <= 50:
        log(f"{c}: nunique={df[c].nunique()}")

log(f"\nunique roads: {df['road_id'].nunique():,}")
log(f"date range: {df['date'].min()} .. {df['date'].max()}  ({df['date'].nunique()} unique dates)")
log(f"hour range: {df['hour'].min()} .. {df['hour'].max()}")

# rows per road consistency
per_road = df.groupby("road_id").size()
log(f"rows per road: min={per_road.min()}, max={per_road.max()}, "
    f"roads with != {len(df)//df['road_id'].nunique()} rows: {(per_road != len(df)//df['road_id'].nunique()).sum()}")

log("\n--- target: traffic_volume ---")
t = df["traffic_volume"]
qs = t.quantile([0.01, 0.05, 0.25, 0.5, 0.75, 0.95, 0.99])
log(f"min={t.min()}  max={t.max()}  mean={t.mean():.3f}  median={t.median():.1f}  std={t.std():.3f}")
log(f"skewness={t.skew():.4f}  kurtosis={t.kurtosis():.4f}")
log(qs.to_string())
log(f"zeros: {(t==0).sum():,} ({(t==0).mean()*100:.2f}%)   negatives: {(t<0).sum():,}")
log(f"is numeric: {pd.api.types.is_numeric_dtype(t)}")

log("\n--- categorical columns ---")
cat_cols = [c for c in df.columns if df[c].dtype == object or df[c].nunique() <= 30]
for c in cat_cols:
    vc = df[c].value_counts(dropna=False)
    log(f"{c}: {df[c].nunique()} unique -> {dict(vc.head(15))}")

num_cols = [c for c in df.columns if pd.api.types.is_numeric_dtype(df[c])]
log(f"\nnumerical columns ({len(num_cols)}): {num_cols}")

id_cols = ["road_id"]
log(f"identifier columns: {id_cols}")

log("\n--- numerical summary ---")
log(df[num_cols].describe().T.to_string())

# suspicious/impossible values
log("\n--- suspicious / impossible value checks ---")
log(f"lane_count values: {sorted(df['lane_count'].dropna().unique())}")
log(f"speed_limit_kmh unique: {sorted(df['speed_limit_kmh'].dropna().unique())}")
log(f"road_length_m: min={df['road_length_m'].min():.2f}, max={df['road_length_m'].max():.2f}, zeros={(df['road_length_m']==0).sum()}")
log(f"node_degree: min={df['node_degree'].min()}, max={df['node_degree'].max()}")
log(f"connected_road_count: min={df['connected_road_count'].min()}, max={df['connected_road_count'].max()}")
log(f"intersection_density: min={df['intersection_density'].min():.4f}, max={df['intersection_density'].max():.4f}")
for b in ["is_oneway", "is_bridge", "is_tunnel"]:
    log(f"{b} values: {sorted(df[b].dropna().unique())}")

# Step 4: temporal consistency checks
log("\n--- temporal consistency ---")
d = df[["date", "hour", "day_of_week", "month", "is_weekend",
        "is_peak_hour", "morning_peak", "evening_peak"]].copy()
d["dow_calc"] = d["date"].dt.dayofweek          # Mon=0..Sun=6
d["month_calc"] = d["date"].dt.month
d["wknd_calc"] = (d["dow_calc"] >= 5).astype(int)
chk_dow = (d["day_of_week"] != d["dow_calc"])
chk_month = (d["month"] != d["month_calc"])
chk_wknd = (d["is_weekend"] != d["wknd_calc"])
mp_calc = d["hour"].isin([7, 8, 9]).astype(int)
ep_calc = d["hour"].isin([17, 18, 19]).astype(int)
pk_calc = ((mp_calc + ep_calc) > 0).astype(int)
chk_mp = (d["morning_peak"] != mp_calc)
chk_ep = (d["evening_peak"] != ep_calc)
chk_pk = (d["is_peak_hour"] != pk_calc)
for name, bad in [("day_of_week", chk_dow), ("month", chk_month), ("is_weekend", chk_wknd),
                  ("is_peak_hour", chk_pk), ("morning_peak", chk_mp), ("evening_peak", chk_ep)]:
    log(f"{name}: mismatches vs computed = {bad.sum():,}")
if chk_dow.sum():
    samp = d.loc[chk_dow, ["date", "day_of_week", "dow_calc"]].drop_duplicates().head(10)
    log("sample dow mismatch:\n" + samp.to_string())

log("\nhour distribution:\n" + d["hour"].value_counts().sort_index().to_string())
log("\nis_weekend x day_of_week crosstab:\n" +
    str(pd.crosstab(d["dow_calc"], d["is_weekend"])))
log("\npeak flags by hour:\n" + str(pd.crosstab(d["hour"], [d["morning_peak"], d["evening_peak"]])))

# traffic by hour sanity
log("\nmean traffic_volume by hour:")
log(t.groupby(d["hour"]).mean().round(1).to_string())
log("\nmean traffic_volume by dow (0=Mon):")
log(t.groupby(d["dow_calc"]).mean().round(1).to_string())

with open(OUT, "w", encoding="utf-8") as f:
    f.write("\n".join(buf))
print("\nsaved ->", OUT)
