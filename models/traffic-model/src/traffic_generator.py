"""
SYNTHETIC traffic generation conditioned on REAL OSM road attributes.

DISCLAIMER
----------
Every observation produced here is SYNTHETIC. It is generated from real
OSM road-network characteristics using transparent, configurable
assumptions. It is NOT measured, sensed, or official traffic data.

Generation model (documented, not hidden):

  static_level_i   = BASE_DEMAND
                     x ROAD_CLASS_FACTOR(highway_i)
                     x LANE_FACTOR(lane_count_i)
                     x CONNECTIVITY_FACTOR(connectivity_i)
                     x SPEED_FACTOR(speed_limit_i)
                     x lognormal road heterogeneity

  Spatial correlation: static levels are then smoothed across the real
  OSM adjacency graph so that neighbouring segments share demand:

      level_i <- w * mean(neighbours) + (1 - w) * level_i   (w=0.35)

  volume(i,t) = static_level_i
                x DAILY_VARIATION(day)            whole-city drift
                x SPECIAL_EVENT(day)              rare surge/drop
                x HOURLY_PROFILE[hour][weekday?]  commute pattern
                x HIERARCHY_PEAK_BOOST            sharper peaks on majors
                x lognormal noise                 bounded

  clip(volume, 0, min(MAX_TRAFFIC_PER_ROAD, capacity_proxy x 1.15))
"""

import numpy as np
import pandas as pd
import geopandas as gpd

import config
import osm_features
import osm_loader
import road_network


def _lane_factor(n_lanes: int) -> float:
    return config.LANE_FACTORS.get(int(n_lanes), config.DEFAULT_LANE_FACTOR)


def _speed_factor(speed_kmh: float) -> float:
    lo, hi = config.SPEED_FACTOR_MIN, config.SPEED_FACTOR_MAX
    s = np.clip((speed_kmh - 20.0) / (100.0 - 20.0), 0.0, 1.0)
    return lo + (hi - lo) * s


def _hierarchy_peak_boost(hierarchy: str, hour: int) -> float:
    """Major roads show sharper commuter peaks; local roads flatter."""
    if config.MORNING_PEAK_HOURS[0] <= hour < config.MORNING_PEAK_HOURS[1]:
        return {"HIGH": 1.12, "MEDIUM": 1.06, "LOW": 0.97}[hierarchy]
    if config.EVENING_PEAK_HOURS[0] <= hour < config.EVENING_PEAK_HOURS[1]:
        return {"HIGH": 1.10, "MEDIUM": 1.05, "LOW": 0.96}[hierarchy]
    return 1.0


def generate_static_levels(drivable: pd.DataFrame, rng):
    """Per-segment baseline demand level (before time effects)."""
    conn_factor = road_network.connectivity_factor(drivable)
    lane_f = drivable["lane_count"].map(_lane_factor)
    speed_f = drivable["speed_limit_kmh"].map(_speed_factor)

    heterogeneity = rng.lognormal(mean=0.0, sigma=0.15, size=len(drivable))

    levels = (config.BASE_DEMAND
              * drivable["road_class_factor"].values
              * lane_f.values
              * conn_factor.values
              * speed_f.values
              * heterogeneity)
    return pd.Series(levels, index=drivable.index)


def apply_spatial_correlation(levels: pd.Series, adjacency: dict):
    """
    Smooth demand levels across the real road graph so neighbouring
    segments are correlated. Returns (new_levels, influence_ratio).
    influence_ratio documents how much each segment's level moved.
    """
    lvl = levels.copy().astype(float).values
    idx_positions = {idx: pos for pos, idx in enumerate(levels.index)}
    w = config.SPATIAL_INFLUENCE_STRENGTH
    for _ in range(config.SPATIAL_INFLUENCE_ITERATIONS):
        new = lvl.copy()
        for pos in range(len(lvl)):
            nb = adjacency.get(pos)
            if nb:
                nb_mean = np.mean([lvl[n] for n in nb])
                new[pos] = w * nb_mean + (1 - w) * lvl[pos]
        lvl = new
    influence = lvl / np.maximum(levels.values.astype(float), 1e-9)
    out = pd.Series(lvl, index=levels.index)
    infl = pd.Series(influence, index=levels.index)
    return out, infl


def build_daily_factors(dates, rng):
    """
    One factor per calendar day shared city-wide, plus rare special-event
    days. Returns DataFrame indexed by date.
    """
    rows = []
    for d in dates:
        daily = float(rng.normal(1.0, config.DAILY_VARIATION_SCALE))
        event = 1.0
        if rng.random() < config.SPECIAL_EVENT_DAY_PROBABILITY:
            lo, hi = config.SPECIAL_EVENT_FACTOR_RANGE
            event = float(rng.uniform(lo, hi))
        rows.append({"date": d, "daily_factor": daily, "event_factor": event})
    return pd.DataFrame(rows).set_index("date")


def generate(roads_gdf=None, verbose: bool = True) -> pd.DataFrame:
    """
    Generate the full synthetic traffic dataset for all drivable OSM
    segments x NUM_DAYS x 24 hourly observations.

    Returns a tidy DataFrame with one row per (road_id, timestamp).
    """
    if roads_gdf is None:
        roads_gdf, _, _ = osm_loader.load_osm()
        roads_gdf = osm_features.compute_base_features(roads_gdf)
        roads_gdf = road_network.add_topology_features(roads_gdf)

    rng = np.random.default_rng(config.RANDOM_SEED)
    drivable = roads_gdf[roads_gdf["is_drivable"]].copy()

    adjacency = road_network.build_road_adjacency(drivable)
    levels = generate_static_levels(drivable, rng)
    levels, influence = apply_spatial_correlation(levels, adjacency)

    dates = pd.date_range(config.START_DATE, periods=config.NUM_DAYS, freq="D")
    daily = build_daily_factors(dates, rng)

    hierarchies = drivable["road_hierarchy"].values
    capacities = drivable["road_capacity_proxy"].values
    road_ids = drivable["road_id"].values

    records = []
    for day_i, date in enumerate(dates):
        d_factor = daily.at[date, "daily_factor"]
        e_factor = daily.at[date, "event_factor"]
        is_weekend = date.weekday() in config.WEEKEND_DAYS
        weekend_mult = config.WEEKEND_DEMAND_FACTOR if is_weekend else 1.0
        profile = (config.HOURLY_PROFILE_WEEKEND if is_weekend
                   else config.HOURLY_PROFILE_WEEKDAY)

        noise = rng.lognormal(mean=0.0, sigma=config.NOISE_SIGMA,
                              size=(len(drivable), 24))

        for hour in range(24):
            h_factor = profile[hour] * weekend_mult
            boost = np.array([_hierarchy_peak_boost(h, hour)
                              for h in hierarchies])
            volumes = (levels.values * d_factor * e_factor
                       * h_factor * boost * noise[:, hour])
            cap_ceiling = np.minimum(config.MAX_TRAFFIC_PER_ROAD,
                                     capacities * 1.15)
            volumes = np.clip(volumes, config.MIN_TRAFFIC_FLOOR, cap_ceiling)

            ts = date + pd.Timedelta(hours=hour)
            morning = (config.MORNING_PEAK_HOURS[0] <= hour
                       < config.MORNING_PEAK_HOURS[1])
            evening = (config.EVENING_PEAK_HOURS[0] <= hour
                       < config.EVENING_PEAK_HOURS[1])
            records.append(pd.DataFrame({
                "road_id": road_ids,
                "timestamp": ts,
                "traffic_volume": np.round(volumes).astype(int),
                "synthetic_demand_factor": levels.round(1).values,
                "daily_variation_factor": round(d_factor * e_factor, 4),
                "spatial_influence_factor": influence.round(4).values,
                "hour": hour,
                "day_of_week": date.weekday(),
                "month": date.month,
                "is_weekend": is_weekend,
                "is_peak_hour": morning or evening,
                "morning_peak": morning,
                "evening_peak": evening,
            }))

    traffic = pd.concat(records, ignore_index=True)
    traffic["date"] = traffic["timestamp"].dt.normalize()
    traffic = traffic.merge(
        daily.reset_index().rename(columns={"date": "date"}),
        on="date", how="left").drop(columns="date")

    static_cols = {
        "road_type": "highway",
        "road_name": "road_name",
        "road_length_m": "road_length_m",
        "lane_count": "lane_count",
        "speed_limit_kmh": "speed_limit_kmh",
        "is_oneway": "is_oneway",
        "is_bridge": "is_bridge",
        "is_tunnel": "is_tunnel",
        "road_capacity_proxy": "road_capacity_proxy",
        "intersection_density": "intersection_density",
        "node_degree": "node_degree",
        "connected_road_count": "connected_road_count",
        "road_hierarchy": "road_hierarchy",
    }
    meta = drivable[list(static_cols.values())].copy()
    meta.insert(0, "road_id", drivable["road_id"].values)
    meta.columns = ["road_id"] + list(static_cols.keys())
    traffic = traffic.merge(meta, on="road_id", how="left")

    geom = drivable[["road_id", "geometry"]]
    traffic = traffic.merge(geom, on="road_id", how="left")
    traffic = gpd.GeoDataFrame(traffic, geometry="geometry", crs=roads_gdf.crs)

    if verbose:
        print(f"Generated {len(traffic):,} synthetic observations "
              f"for {drivable['road_id'].nunique()} real OSM road segments "
              f"over {config.NUM_DAYS} days.")
    return traffic
