"""
Road-feature extraction from the loaded OSM road layer.

Everything here adapts to what ACTUALLY exists in the data:
- maxspeed is ABSENT in this dataset -> speed_limit_kmh is imputed from
  highway class and flagged via speed_source = 'imputed'.
- lanes is 99%+ missing -> class-default lane counts, flagged via
  lanes_source.
No attribute is ever invented or silently presented as measured.
"""

import numpy as np
import pandas as pd

import config

# Classes that do not carry motor traffic -> excluded from traffic modelling.
NON_DRIVABLE_HIGHWAY = {
    "footway", "steps", "pedestrian", "path", "cycleway",
    "track", "construction", "proposed", "raceway", "bridleway",
}

HIERARCHY_MAP = {
    "motorway": "HIGH", "motorway_link": "HIGH",
    "trunk": "HIGH", "trunk_link": "HIGH",
    "primary": "MEDIUM", "primary_link": "MEDIUM",
    "secondary": "MEDIUM", "secondary_link": "MEDIUM",
    "tertiary": "LOW", "tertiary_link": "LOW",
    "unclassified": "LOW", "residential": "LOW",
    "living_street": "LOW", "service": "LOW",
}

# Default TOTAL (both directions) lane counts when 'lanes' tag is missing.
DEFAULT_LANES_BY_CLASS = {
    "motorway": 6, "trunk": 6, "primary": 4, "secondary": 4,
    "tertiary": 2, "unclassified": 2, "residential": 2,
    "living_street": 2, "service": 1,
}
DEFAULT_LANES_LINK = 2          # slip/link roads
DEFAULT_LANES_FALLBACK = 2

# Default speed limits (km/h) used ONLY because maxspeed is absent.
DEFAULT_SPEED_BY_CLASS = {
    "motorway": 100, "trunk": 100, "primary": 80, "secondary": 60,
    "tertiary": 60, "unclassified": 50, "residential": 40,
    "living_street": 20, "service": 20,
}

TRUE_VALUES = {"yes", "true", "1", "-1"}
LANE_CAP = config.MAX_LANES_PLAUSIBLE


def _parse_lanes(val):
    try:
        n = int(str(val).split(";")[0])
        return n if 1 <= n <= LANE_CAP else np.nan
    except (TypeError, ValueError):
        return np.nan


def _parse_speed_kmh(val):
    """Parse maxspeed values like '50', '50 knots' -> kmh float, else NaN."""
    if val is None:
        return np.nan
    s = str(val).strip().lower()
    token = s.split()[0]
    try:
        v = float(token)
    except ValueError:
        return np.nan
    if "knots" in s:
        v *= 1.852
    elif "mph" in s:
        v *= 1.609344
    return v if 5 <= v <= 160 else np.nan


def compute_base_features(roads: pd.DataFrame) -> pd.DataFrame:
    """
    Add per-segment physical attributes to the roads GeoDataFrame.

    New columns:
      road_length_m     true geometric length (metric CRS)
      is_drivable       False for footways/steps/construction/etc.
      lane_count        total lanes (tagged if valid, else class default)
      lanes_source      'osm' or 'imputed'
      speed_limit_kmh   tagged if valid, else class default
      speed_source      'osm' or 'imputed'
      is_oneway         parsed oneway tag (missing -> False)
      is_bridge/is_tunnel
      road_hierarchy    HIGH / MEDIUM / LOW
      road_class_factor demand multiplier from config
    """
    g = roads.copy()

    lengths_m = g.to_crs(config.CRS_METRIC).length
    g["road_length_m"] = lengths_m.round(1).values

    hw = g["highway"].fillna("unknown")
    g["is_drivable"] = ~hw.isin(NON_DRIVABLE_HIGHWAY)

    g["lane_count"] = g.get("lanes").map(_parse_lanes) if "lanes" in g else np.nan
    g["lanes_source"] = np.where(g["lane_count"].notna(), "osm", "imputed")
    defaults_l = hw.map(lambda h: DEFAULT_LANES_BY_CLASS.get(
        h, DEFAULT_LANES_LINK if str(h).endswith("_link") else DEFAULT_LANES_FALLBACK))
    g["lane_count"] = g["lane_count"].fillna(defaults_l).astype(int)

    g["speed_limit_kmh"] = (_parse_speed_kmh(g["maxspeed"])
                            if "maxspeed" in g else np.nan)
    g["speed_source"] = np.where(g["speed_limit_kmh"].notna(), "osm", "imputed")
    defaults_v = hw.map(lambda h: DEFAULT_SPEED_BY_CLASS.get(h, config.DEFAULT_SPEED_LIMIT))
    g["speed_limit_kmh"] = g["speed_limit_kmh"].fillna(defaults_v).round(0)

    ow = g.get("oneway") if "oneway" in g else pd.Series(np.nan, index=g.index)
    g["is_oneway"] = ow.fillna("").astype(str).str.lower().isin(TRUE_VALUES)

    def _flag(col):
        if col not in g:
            return pd.Series(False, index=g.index)
        return g[col].notna() & ~g[col].astype(str).str.lower().isin({"no", "false", "0"})
    g["is_bridge"] = _flag("bridge")
    g["is_tunnel"] = _flag("tunnel")

    g["road_hierarchy"] = hw.map(HIERARCHY_MAP).fillna("LOW")

    g["road_name"] = g.get("name") if "name" in g else None
    g["road_class_factor"] = hw.map(config.ROAD_CLASS_FACTORS).fillna(config.UNKNOWN_CLASS_FACTOR)

    return g


def directional_lane_count(row) -> float:
    """Lanes available in ONE direction (capacity works per direction)."""
    if row["is_oneway"]:
        return max(1.0, row["lane_count"])
    return max(1.0, row["lane_count"] / 2.0)


def base_capacity_proxy(row) -> float:
    """
    Capacity PROXY step 1 (topology penalty applied later in road_network):

        capacity_proxy ~= directional_lanes
                          x BASE_CAPACITY_PER_LANE[highway]
                          x oneway_bonus(1.15)
                          x bridge/tunnel_penalty(0.95)

    THIS IS A PLANNING-STYLE PROXY DERIVED FROM OSM TAGS -
    IT IS NOT MEASURED TRAFFIC CAPACITY.
    """
    d_lanes = directional_lane_count(row)
    hw = row["highway"]
    rate = config.BASE_CAPACITY_PER_LANE.get(hw, config.DEFAULT_CAPACITY_PER_LANE)
    cap = d_lanes * rate
    if row["is_oneway"]:
        cap *= config.ONEWAY_CAPACITY_BONUS
    if row["is_bridge"] or row["is_tunnel"]:
        cap *= config.BRIDGE_TUNNEL_CAPACITY_PENALTY
    return float(cap)
