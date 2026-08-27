"""
Unit tests for Step 3 Geographic Zone Resolution.
Verifies that geographic (latitude, longitude) picking resolves correctly
to the existing zone dataset (zone_osm_mapping_v2.csv).
"""

import math
from pathlib import Path
import pandas as pd
import pytest

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
ZONE_CSV_PATH = PROJECT_ROOT / "trip-demand-model" / "data" / "raw" / "zone_osm_mapping_v2.csv"

EARTH_RADIUS_KM = 6371.0


def haversine_distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculates Haversine distance in km between two lat/lon points."""
    d_lat = math.radians(lat2 - lat1)
    d_lon = math.radians(lon2 - lon1)
    r_lat1 = math.radians(lat1)
    r_lat2 = math.radians(lat2)

    a = (
        math.sin(d_lat / 2.0) ** 2
        + math.cos(r_lat1) * math.cos(r_lat2) * math.sin(d_lon / 2.0) ** 2
    )
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return EARTH_RADIUS_KM * c


def resolve_nearest_zone(latitude: float, longitude: float, zone_df: pd.DataFrame):
    """Resolves latitude and longitude to nearest zone in zone_df."""
    if not isinstance(latitude, (int, float)) or not isinstance(longitude, (int, float)):
        raise TypeError("Invalid geographic coordinates: latitude and longitude must be numbers.")
    if math.isnan(latitude) or math.isnan(longitude):
        raise TypeError("Invalid geographic coordinates: NaN value received.")
    if latitude < -90.0 or latitude > 90.0 or longitude < -180.0 or longitude > 180.0:
        raise ValueError(f"Geographic coordinates out of bounds: lat={latitude}, lon={longitude}.")

    min_dist = float("inf")
    nearest_zone = None

    for _, row in zone_df.iterrows():
        dist = haversine_distance_km(latitude, longitude, float(row["centroid_lat"]), float(row["centroid_lon"]))
        if dist < min_dist:
            min_dist = dist
            nearest_zone = row["zone_id"]

    return {
        "zone_id": nearest_zone,
        "distance_km": round(min_dist, 3)
    }


@pytest.fixture
def zone_df():
    assert ZONE_CSV_PATH.exists(), f"Zone CSV file missing at {ZONE_CSV_PATH}"
    return pd.read_csv(ZONE_CSV_PATH)


def test_1_exact_centroid_Z0008(zone_df):
    """TEST 1 — Exact centroid of Z0008 resolves to Z0008 with 0.00 km distance."""
    z8_row = zone_df[zone_df["zone_id"] == "Z0008"].iloc[0]
    lat, lon = float(z8_row["centroid_lat"]), float(z8_row["centroid_lon"])

    res = resolve_nearest_zone(lat, lon, zone_df)
    assert res["zone_id"] == "Z0008"
    assert res["distance_km"] == pytest.approx(0.0, abs=1e-3)


def test_2_exact_centroid_Z0001(zone_df):
    """TEST 2 — Exact centroid of Z0001 resolves to Z0001 with 0.00 km distance."""
    z1_row = zone_df[zone_df["zone_id"] == "Z0001"].iloc[0]
    lat, lon = float(z1_row["centroid_lat"]), float(z1_row["centroid_lon"])

    res = resolve_nearest_zone(lat, lon, zone_df)
    assert res["zone_id"] == "Z0001"
    assert res["distance_km"] == pytest.approx(0.0, abs=1e-3)


def test_3_arbitrary_location_near_Z0008(zone_df):
    """TEST 3 — Arbitrary location near Z0008 resolves to Z0008."""
    # Offset by ~50 meters from Z0008 centroid
    z8_row = zone_df[zone_df["zone_id"] == "Z0008"].iloc[0]
    lat = float(z8_row["centroid_lat"]) + 0.0003
    lon = float(z8_row["centroid_lon"]) + 0.0003

    res = resolve_nearest_zone(lat, lon, zone_df)
    assert res["zone_id"] == "Z0008"
    assert res["distance_km"] < 0.1  # less than 100 meters


def test_4_invalid_coordinates(zone_df):
    """TEST 4 — Invalid coordinates raise clear validation errors."""
    with pytest.raises(TypeError):
        resolve_nearest_zone("invalid", 31.7294, zone_df)

    with pytest.raises(TypeError):
        resolve_nearest_zone(math.nan, 31.7294, zone_df)

    with pytest.raises(ValueError):
        resolve_nearest_zone(120.0, 31.7294, zone_df)


def test_5_multiple_zone_centroids_verification(zone_df):
    """TEST 5 — Multiple zone centroids all self-resolve correctly across dataset."""
    for zone_id in ["Z0000", "Z0005", "Z0010", "Z0050", "Z0100", "Z0149"]:
        row = zone_df[zone_df["zone_id"] == zone_id].iloc[0]
        res = resolve_nearest_zone(float(row["centroid_lat"]), float(row["centroid_lon"]), zone_df)
        assert res["zone_id"] == zone_id
        assert res["distance_km"] == pytest.approx(0.0, abs=1e-3)
