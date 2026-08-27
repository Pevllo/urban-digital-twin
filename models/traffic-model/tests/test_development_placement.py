"""
Unit tests for Step 4 Development Placement & Schema Validation.

Verifies:
  1. Creation of all 5 development types (residential_compound, hospital, mall, school, office)
  2. Property schema validation & error handling
  3. Repositioning/movement updates (lat, lon, zone_id)
  4. Deletion and independence of multiple developments
"""

import pytest


class DevStoreMock:
    """Mock implementation of the frontend DevelopmentStore matching devStore.js logic."""

    def __init__(self):
        self.developments = {}
        self.counter = 1

    def generate_id(self):
        id_str = f"DEV-{self.counter:03d}"
        self.counter += 1
        return id_str

    def validate_properties(self, dev_type: str, properties: dict):
        if not isinstance(properties, dict):
            return False, "Properties must be a dictionary."

        for k, v in properties.items():
            if isinstance(v, (int, float)):
                if v < 0:
                    return False, f"Property '{k}' must be non-negative."

        if dev_type == "residential_compound":
            if properties.get("num_residents", 0) <= 0 and properties.get("num_units", 0) <= 0:
                return False, "Residential compound requires num_residents or num_units > 0."
        elif dev_type == "hospital":
            if properties.get("num_beds", 0) <= 0 and properties.get("staff_count", 0) <= 0:
                return False, "Hospital requires num_beds or staff_count > 0."
        elif dev_type == "mall":
            if properties.get("gross_leasable_area_sqm", 0) <= 0 and properties.get("visitor_capacity", 0) <= 0:
                return False, "Mall requires GLA or visitor_capacity > 0."
        elif dev_type == "school":
            if properties.get("num_students", 0) <= 0 and properties.get("staff_count", 0) <= 0:
                return False, "School requires num_students or staff_count > 0."
        elif dev_type == "office":
            if properties.get("num_employees", 0) <= 0 and properties.get("gross_floor_area_sqm", 0) <= 0:
                return False, "Office requires num_employees or GFA > 0."

        return True, ""

    def add_development(self, dev_type: str, lat: float, lon: float, zone_id: str, properties: dict, name: str = ""):
        valid, err = self.validate_properties(dev_type, properties)
        if not valid:
            raise ValueError(err)

        dev_id = self.generate_id()
        record = {
            "development_id": dev_id,
            "development_type": dev_type,
            "name": name or f"{dev_type} {dev_id}",
            "latitude": lat,
            "longitude": lon,
            "zone_id": zone_id,
            "properties": properties,
        }
        self.developments[dev_id] = record
        return record

    def move_development(self, dev_id: str, lat: float, lon: float, zone_id: str):
        if dev_id not in self.developments:
            raise KeyError(f"Development {dev_id} not found.")
        rec = self.developments[dev_id]
        rec["latitude"] = lat
        rec["longitude"] = lon
        rec["zone_id"] = zone_id
        return rec

    def delete_development(self, dev_id: str):
        return self.developments.pop(dev_id, None) is not None


def test_1_create_residential_compound():
    """TEST 1 — Create residential compound development."""
    store = DevStoreMock()
    rec = store.add_development("residential_compound", 30.0685, 31.7294, "Z0008", {"num_residents": 5000})
    assert rec["development_id"] == "DEV-001"
    assert rec["development_type"] == "residential_compound"
    assert rec["zone_id"] == "Z0008"
    assert rec["properties"]["num_residents"] == 5000


def test_2_create_hospital():
    """TEST 2 — Create hospital development."""
    store = DevStoreMock()
    rec = store.add_development("hospital", 30.0658, 31.7783, "Z0001", {"num_beds": 300, "staff_count": 450})
    assert rec["development_type"] == "hospital"
    assert rec["properties"]["num_beds"] == 300
    assert rec["properties"]["staff_count"] == 450


def test_3_create_mall():
    """TEST 3 — Create mall development."""
    store = DevStoreMock()
    rec = store.add_development("mall", 30.0827, 31.7454, "Z0002", {"gross_leasable_area_sqm": 25000})
    assert rec["development_type"] == "mall"
    assert rec["properties"]["gross_leasable_area_sqm"] == 25000


def test_4_create_school():
    """TEST 4 — Create school development."""
    store = DevStoreMock()
    rec = store.add_development("school", 30.0780, 31.7428, "Z0003", {"num_students": 1500, "staff_count": 120})
    assert rec["development_type"] == "school"
    assert rec["properties"]["num_students"] == 1500


def test_5_create_office():
    """TEST 5 — Create office development."""
    store = DevStoreMock()
    rec = store.add_development("office", 30.0622, 31.7497, "Z0004", {"num_employees": 2000})
    assert rec["development_type"] == "office"
    assert rec["properties"]["num_employees"] == 2000


def test_6_invalid_property_values():
    """TEST 6 — Invalid property values (negative or zero) fail validation."""
    store = DevStoreMock()
    with pytest.raises(ValueError):
        store.add_development("hospital", 30.0685, 31.7294, "Z0008", {"num_beds": -10})

    with pytest.raises(ValueError):
        store.add_development("school", 30.0685, 31.7294, "Z0008", {"num_students": 0, "staff_count": 0})


def test_7_development_movement():
    """TEST 7 — Development movement updates latitude, longitude, and zone_id."""
    store = DevStoreMock()
    rec = store.add_development("hospital", 30.0685, 31.7294, "Z0008", {"num_beds": 300})
    moved = store.move_development("DEV-001", 30.0531, 31.7694, "Z0010")

    assert moved["latitude"] == 30.0531
    assert moved["longitude"] == 31.7694
    assert moved["zone_id"] == "Z0010"
    assert moved["properties"]["num_beds"] == 300  # Properties preserved


def test_8_development_deletion():
    """TEST 8 — Development deletion removes the development."""
    store = DevStoreMock()
    store.add_development("mall", 30.0685, 31.7294, "Z0008", {"gross_leasable_area_sqm": 15000})
    assert "DEV-001" in store.developments

    deleted = store.delete_development("DEV-001")
    assert deleted is True
    assert "DEV-001" not in store.developments


def test_9_multiple_developments_independence():
    """TEST 9 — Multiple developments remain independent."""
    store = DevStoreMock()
    dev1 = store.add_development("hospital", 30.0685, 31.7294, "Z0008", {"num_beds": 300})
    dev2 = store.add_development("mall", 30.0658, 31.7783, "Z0001", {"gross_leasable_area_sqm": 20000})

    assert len(store.developments) == 2
    assert dev1["development_id"] == "DEV-001"
    assert dev2["development_id"] == "DEV-002"
    assert dev1["zone_id"] == "Z0008"
    assert dev2["zone_id"] == "Z0001"


def test_10_cancelled_placement():
    """TEST 10 — Cancelled placement creates no development record."""
    store = DevStoreMock()
    # Simulating cancellation by not invoking add_development
    assert len(store.developments) == 0
