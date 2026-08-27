"""
Validation of the SYNTHETIC traffic dataset + all figures + reports.

Produces:
  reports/synthetic_data_validation.csv   quantitative check table
  reports/synthetic_data_report.md        methodology + disclaimer report
  reports/figures/*.png                   maps and diagnostic plots
"""

import numpy as np
import pandas as pd
import geopandas as gpd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

import config


def _fig_path(name):
    return config.FIGURES_DIR / name


# ---------------------------------------------------------------------------
# Figure A - OSM road network map by highway class
# ---------------------------------------------------------------------------
def fig_network_map(roads: gpd.GeoDataFrame):
    drivable = roads[roads["is_drivable"]]
    non_driv = roads[~roads["is_drivable"]]
    fig, ax = plt.subplots(figsize=(12, 12))
    if len(non_driv):
        non_driv.plot(ax=ax, color="#cccccc", linewidth=0.4, label="non-drivable")
    for hw, color in [("motorway", "#d7191c"), ("trunk", "#e67100"),
                      ("primary", "#f29400"), ("secondary", "#eac100"),
                      ("tertiary", "#c8c800"), ("residential", "#55aaff"),
                      ("unclassified", "#8fd18f"), ("service", "#bbbbff")]:
        sub = drivable[drivable["highway"] == hw]
        if len(sub):
            sub.plot(ax=ax, color=color, linewidth=0.8, label=hw)
    links = drivable[drivable["highway"].str.endswith("_link")]
    if len(links):
        links.plot(ax=ax, color="#ff9ad5", linewidth=0.6, label="*_link")
    ax.set_title("REAL OSM road network - NAC study area\n(drivable classes coloured)")
    ax.legend(loc="upper right", fontsize=8, ncol=2)
    ax.set_axis_off()
    fig.savefig(_fig_path("A_osm_road_network_map.png"), dpi=150,
                bbox_inches="tight")
    plt.close(fig)


# ---------------------------------------------------------------------------
# Figure B - mean synthetic traffic volume per segment
# ---------------------------------------------------------------------------
def fig_traffic_map(traffic_mean: gpd.GeoDataFrame):
    fig, ax = plt.subplots(figsize=(12, 12))
    traffic_mean.plot(ax=ax, column="mean_volume", cmap="viridis",
                      linewidth=1.0, legend=True,
                      legend_kwds={"label": "synthetic traffic volume (veh/h, 30-day mean)",
                                   "shrink": 0.7})
    ax.set_title("SYNTHETIC traffic volume on REAL OSM segments\n"
                 "(not measured data)")
    ax.set_axis_off()
    fig.savefig(_fig_path("B_synthetic_traffic_map.png"), dpi=150,
                bbox_inches="tight")
    plt.close(fig)


# ---------------------------------------------------------------------------
# Figure C - hourly profile weekday vs weekend
# ---------------------------------------------------------------------------
def fig_hourly_profile(traffic: pd.DataFrame):
    prof = (traffic.groupby(["is_weekend", "hour"])["traffic_volume"].mean()
            .unstack(0))
    fig, ax = plt.subplots(figsize=(10, 5))
    ax.plot(prof.index, prof[False], marker="o", label="Weekday (Sun-Thu)")
    ax.plot(prof.index, prof[True], marker="s", label="Weekend (Fri-Sat)")
    mp0, mp1 = config.MORNING_PEAK_HOURS
    ep0, ep1 = config.EVENING_PEAK_HOURS
    ax.axvspan(mp0, mp1 - 1, alpha=0.15, color="orange", label="morning peak cfg")
    ax.axvspan(ep0, ep1 - 1, alpha=0.15, color="red", label="evening peak cfg")
    ax.set_xlabel("hour of day"); ax.set_ylabel("mean synthetic veh/h")
    ax.set_title("Hourly traffic profile (synthetic)"); ax.legend(fontsize=8)
    fig.savefig(_fig_path("C_hourly_profile.png"), dpi=150, bbox_inches="tight")
    plt.close(fig)


# ---------------------------------------------------------------------------
# Figure D - distribution, E - by road type, F - capacity relation
# ---------------------------------------------------------------------------
def fig_distribution(traffic: pd.DataFrame):
    fig, axes = plt.subplots(1, 2, figsize=(13, 4.5))
    v = traffic["traffic_volume"]
    axes[0].hist(v, bins=80, color="steelblue")
    axes[0].set_title(f"Traffic volume distribution (n={len(v):,})")
    axes[0].set_xlabel("veh/h")
    axes[1].hist(np.log1p(v), bins=80, color="seagreen")
    axes[1].set_title("log(1+volume) view")
    fig.savefig(_fig_path("D_traffic_distribution.png"), dpi=150,
                bbox_inches="tight")
    plt.close(fig)


def fig_by_road_type(traffic: pd.DataFrame):
    order = (traffic.groupby("road_type")["traffic_volume"].mean()
             .sort_values(ascending=False))
    fig, ax = plt.subplots(figsize=(11, 5))
    ax.bar(order.index.astype(str), order.values, color="slateblue")
    ax.set_ylabel("mean synthetic veh/h")
    ax.set_title("Mean traffic by OSM road class")
    ax.tick_params(axis="x", rotation=60)
    fig.savefig(_fig_path("E_traffic_by_road_type.png"), dpi=150,
                bbox_inches="tight")
    plt.close(fig)


def fig_capacity_relation(traffic: pd.DataFrame):
    sample = traffic.sample(n=min(200000, len(traffic)),
                            random_state=config.RANDOM_SEED)
    cap = sample["road_capacity_proxy"].clip(upper=25000)
    vol = sample["traffic_volume"]
    fig, ax = plt.subplots(figsize=(7, 6))
    hb = ax.hexbin(cap, vol, gridsize=45, cmap="magma", mincnt=1,
                   extent=[0, cap.max(), 0, np.percentile(vol, 99.5)])
    r = np.corrcoef(sample["road_capacity_proxy"], vol)[0, 1]
    ax.set_xlabel("road_capacity_proxy (veh/h)"); ax.set_ylabel("traffic_volume")
    ax.set_title(f"Traffic vs capacity proxy (Pearson r={r:.2f}, sampled)")
    fig.colorbar(hb, label="count")
    fig.savefig(_fig_path("F_traffic_vs_capacity.png"), dpi=150,
                bbox_inches="tight")
    plt.close(fig)


# ---------------------------------------------------------------------------
# Figure G - spatial correlation: neighbours vs random pairs
# ---------------------------------------------------------------------------
def fig_spatial_correlation(traffic: pd.DataFrame, adjacency: dict,
                            pos_map: dict):
    t = traffic.copy()
    t["pos"] = t["road_id"].map(pos_map)
    pivot = t.dropna(subset=["pos"]).pivot_table(
        index="pos", columns="timestamp", values="traffic_volume")
    arr = pivot.values
    arr = arr - np.nanmean(arr, axis=1, keepdims=True)
    arr = arr - np.nanmean(arr, axis=0, keepdims=True)
    std = np.nanstd(arr, axis=1, keepdims=True); std[std == 0] = 1
    normed = arr / std
    rng = np.random.default_rng(config.RANDOM_SEED)

    def corr_between(pairs):
        cs = []
        for a, b in pairs:
            va, vb = normed[a], normed[b]
            mask = ~(np.isnan(va) | np.isnan(vb))
            if mask.sum() > 10:
                cs.append(np.corrcoef(va[mask], vb[mask])[0, 1])
        return np.array(cs)

    nb_pairs = [(i, j) for i, nbs in adjacency.items() for j in list(nbs)[:3] if j > i]
    rnd = rng.integers(0, len(pivot), size=(min(4000, len(nb_pairs)), 2))
    rnd_pairs = [tuple(p) for p in rnd if p[0] != p[1]]

    c_nb = corr_between(nb_pairs)
    c_rd = corr_between(rnd_pairs[:len(nb_pairs)])
    fig, ax = plt.subplots(figsize=(8, 5))
    ax.hist(c_nb, bins=50, alpha=0.65, density=True,
            label=f"graph neighbours (median r={np.median(c_nb):.2f})")
    ax.hist(c_rd, bins=50, alpha=0.65, density=True,
            label=f"random pairs (median r={np.median(c_rd):.2f})")
    ax.set_xlabel("residual-series Pearson correlation")
    ax.set_title("Spatial correlation check (after removing global temporal rhythm)")
    ax.legend()
    fig.savefig(_fig_path("G_spatial_correlation.png"), dpi=150,
                bbox_inches="tight")
    plt.close(fig)
    return float(np.median(c_nb)), float(np.median(c_rd))


# ---------------------------------------------------------------------------
# Validation table
# ---------------------------------------------------------------------------
def build_validation_table(roads, traffic, medians_corr) -> pd.DataFrame:
    rows = []
    add = lambda k, v, ok=None: rows.append(
        {"check": k, "value": v, "verdict": ok if ok is not None else ""})

    v = traffic["traffic_volume"]
    add("n_road_segments_real_OSM", int(roads["is_drivable"].sum()))
    add("n_observations_synthetic", f"{len(traffic):,}")
    add("date_range", f"{traffic['timestamp'].min()} .. {traffic['timestamp'].max()}")
    add("volume_min", int(v.min()), "PASS" if v.min() >= 0 else "FAIL")
    add("volume_max", int(v.max()),
        "PASS" if v.max() <= config.MAX_TRAFFIC_PER_ROAD else "FAIL")
    add("volume_mean_median_std",
        f"{v.mean():.0f} / {v.median():.0f} / {v.std():.0f}")

    major = traffic[traffic["road_hierarchy"] == "HIGH"]["traffic_volume"].mean()
    low = traffic[traffic["road_hierarchy"] == "LOW"]["traffic_volume"].mean()
    add("mean_HIGH_hierarchy", round(major),
        "PASS" if major > low else "FAIL")
    add("mean_LOW_hierarchy", round(low))

    night = traffic[traffic["hour"].isin([2, 3, 4])]["traffic_volume"].mean()
    day = traffic[traffic["hour"].isin([10, 11, 14])]["traffic_volume"].mean()
    add("mean_night(02-04)", round(night), "PASS" if night < day else "FAIL")
    add("mean_midday(10,11,14)", round(day))

    peak = traffic[traffic["is_peak_hour"]]["traffic_volume"].mean()
    off = traffic[~traffic["is_peak_hour"]]["traffic_volume"].mean()
    add("peak_hours_mean", round(peak), "PASS" if peak > off else "FAIL")
    add("offpeak_mean", round(off))

    r_cap = np.corrcoef(traffic["road_capacity_proxy"],
                        traffic["traffic_volume"])[0, 1]
    add("corr(volume,capacity_proxy)", round(r_cap, 3),
        "PASS" if r_cap > 0.3 else "WEAK")

    add("neighbour_residual_median_r", round(medians_corr[0], 3),
        "PASS" if medians_corr[0] > medians_corr[1] else "FAIL")
    add("random_pair_residual_median_r", round(medians_corr[1], 3))

    wk = traffic[traffic["is_weekend"]]["traffic_volume"].mean()
    wd = traffic[~traffic["is_weekend"]]["traffic_volume"].mean()
    add("weekend_vs_weekday_mean", f"{wk:.0f} vs {wd:.0f}",
        "PASS" if wd > wk else "CHECK")

    return pd.DataFrame(rows)


# ---------------------------------------------------------------------------
# Markdown report
# ---------------------------------------------------------------------------
DISCLAIMER = (
    "**SYNTHETIC TRAFFIC DATA GENERATED USING REAL OSM ROAD NETWORK DATA.**\n\n"
    "- OSM provides the real road geometry, network topology and attributes.\n"
    "- Traffic volumes are SYNTHETIC, generated from transparent documented assumptions.\n"
    "- These are NOT real measurements, sensor data or official statistics.\n"
    "- Intended use: ML pipeline development, prototyping, digital-twin demonstration,\n"
    "  What-If simulation development.\n"
    "- NOT a replacement for real traffic measurements."
)


def write_report(validation: pd.DataFrame, params: dict):
    md = ["# Synthetic Traffic Data Report",
          "",
          DISCLAIMER, "",
          "## Methodology",
          "",
          "```text", params["formula"], "```", "",
          "## Configuration used",
          ""]
    for k, val in params["config"].items():
        md.append(f"- **{k}**: `{val}`")
    md += ["", "## Data-quality notes",
           "",
           "- `maxspeed` is ABSENT from the source OSM export; "
           "`speed_limit_kmh` values are class-based IMPUTATIONS "
           "(`speed_source='imputed'`), not measured limits.",
           "- `lanes` exists but is >99% missing; lane counts are class-default "
           "imputations flagged via `lanes_source='imputed'`.",
           "- Non-drivable classes (footway/steps/pedestrian/construction) are "
           "excluded from traffic generation (`is_drivable=False`).",
           "", "## Validation results", "",
           validation.to_markdown(index=False)]
    config.SYNTH_REPORT_MD.write_text("\n".join(md), encoding="utf-8")


def validate_and_report(roads: gpd.GeoDataFrame, traffic_gdf: gpd.GeoDataFrame,
                        adjacency: dict, params: dict):
    """Run every figure/table/report output."""
    traffic = pd.DataFrame(traffic_gdf.drop(columns="geometry"))

    fig_network_map(roads)
    seg_mean = (traffic_gdf[["road_id", "geometry"]]
                .merge(traffic.groupby("road_id")["traffic_volume"].mean()
                       .rename("mean_volume"), on="road_id"))
    fig_traffic_map(seg_mean)
    fig_hourly_profile(traffic)
    fig_distribution(traffic)
    fig_by_road_type(traffic)
    fig_capacity_relation(traffic)
    medians = fig_spatial_correlation(traffic, adjacency,
                                      pos_map={rid: i for i, rid in
                                               enumerate(roads.loc[
                                                   roads["is_drivable"],
                                                   "road_id"])})

    validation = build_validation_table(roads, traffic, medians)
    validation.to_csv(config.VALIDATION_CSV, index=False)
    write_report(validation, params)
    print(f"Saved validation table -> {config.VALIDATION_CSV}")
    print(f"Saved report           -> {config.SYNTH_REPORT_MD}")
    print(f"Saved figures          -> {config.FIGURES_DIR}")
    return validation
