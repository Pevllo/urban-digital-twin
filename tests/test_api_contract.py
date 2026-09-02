"""
API Contract Integration Tests.

Tests the frozen API contract for the Urban Digital Twin backend.
Run with: python -m pytest tests/test_api_contract.py -v

Requires the server to be running on http://127.0.0.1:8000
Start with: python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
"""

import time
import pytest
import requests

BASE = "http://127.0.0.1:8000"
TIMEOUT = 30


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def api(method, path, json=None, timeout=TIMEOUT):
    """Make an API request and return (status, json_body)."""
    url = f"{BASE}{path}"
    r = requests.request(method, url, json=json, timeout=timeout)
    try:
        body = r.json()
    except Exception:
        body = r.text
    return r.status_code, body


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------

class TestHealth:
    def test_health_returns_200(self):
        status, body = api("GET", "/health")
        assert status == 200
        assert body["status"] == "healthy"
        assert "developments_persisted" in body


# ---------------------------------------------------------------------------
# Development CRUD
# ---------------------------------------------------------------------------

class TestDevelopmentCRUD:
    TEST_ID = "test-api-contract-001"

    def test_create_development(self):
        status, body = api("POST", "/api/v1/developments", json={
            "development_id": self.TEST_ID,
            "development_type": "residential_compound",
            "name": "Contract Test",
            "latitude": 30.05,
            "longitude": 31.75,
            "area": 5000,
            "floors": 10,
            "properties": {"num_residents": 500, "num_units": 100},
        })
        assert status == 201
        assert body["development_id"] == self.TEST_ID
        assert body["development_type"] == "residential_compound"
        assert body["latitude"] == 30.05

    def test_list_developments(self):
        status, body = api("GET", "/api/v1/developments")
        assert status == 200
        assert isinstance(body, list)
        ids = [d["development_id"] for d in body]
        assert self.TEST_ID in ids

    def test_get_development_by_id(self):
        status, body = api("GET", f"/api/v1/developments/{self.TEST_ID}")
        assert status == 200
        assert body["development_id"] == self.TEST_ID

    def test_delete_development(self):
        status, body = api("DELETE", f"/api/v1/developments/{self.TEST_ID}")
        assert status == 200
        assert body["status"] == "deleted"

    def test_get_deleted_returns_404(self):
        status, body = api("GET", f"/api/v1/developments/{self.TEST_ID}")
        assert status == 404

    def test_create_missing_id_returns_400(self):
        status, body = api("POST", "/api/v1/developments", json={
            "development_type": "residential_compound",
            "latitude": 30.0,
            "longitude": 31.0,
        })
        assert status == 400

    def test_create_invalid_type_returns_422(self):
        status, body = api("POST", "/api/v1/developments", json={
            "development_id": "bad-type",
            "development_type": "bogus",
            "latitude": 30.0,
            "longitude": 31.0,
        })
        assert status == 422


# ---------------------------------------------------------------------------
# Water API
# ---------------------------------------------------------------------------

class TestWaterAPI:
    def test_valid_request(self):
        t0 = time.time()
        status, body = api("POST", "/api/v1/water/predict", json={
            "development_type": "residential_compound",
            "zone_id": "Z001",
            "temperature_c": 25,
            "hour": 8,
            "month": 7,
            "day_of_week": 3,
            "properties": {"num_residents": 500},
        })
        elapsed = time.time() - t0
        assert status == 200
        assert body["unit"] == "m3"
        assert body["prediction"] > 0
        assert body["prediction_liters"] > 0
        assert body["model"] == "extra_trees"
        assert elapsed < 10  # should be fast

    def test_invalid_type_returns_422(self):
        status, body = api("POST", "/api/v1/water/predict", json={
            "development_type": "bogus",
        })
        assert status == 422

    def test_missing_type_returns_422(self):
        status, body = api("POST", "/api/v1/water/predict", json={
            "month": 6,
        })
        assert status == 422

    def test_all_canonical_types(self):
        for dt in ["residential_compound", "hospital", "mall", "school", "office"]:
            status, body = api("POST", "/api/v1/water/predict", json={
                "development_type": dt,
                "properties": {"num_residents": 100, "num_beds": 50,
                               "gross_leasable_area_sqm": 5000,
                               "num_students": 200, "num_employees": 100},
            })
            assert status == 200, f"Failed for {dt}: {body}"
            assert body["prediction"] >= 0


# ---------------------------------------------------------------------------
# Waste API
# ---------------------------------------------------------------------------

class TestWasteAPI:
    def test_valid_request(self):
        t0 = time.time()
        status, body = api("POST", "/api/v1/waste/predict", json={
            "development_type": "residential_compound",
            "month": 6,
            "day_of_week": 2,
            "temperature_c": 28,
            "properties": {"num_residents": 500},
        })
        elapsed = time.time() - t0
        assert status == 200
        assert body["waste_generation_kg"] > 0
        assert body["waste_generation_tonnes"] > 0
        assert body["model"] == "XGBRegressor"
        assert elapsed < 10

    def test_invalid_type_returns_422(self):
        status, body = api("POST", "/api/v1/waste/predict", json={
            "development_type": "bogus",
        })
        assert status == 422

    def test_missing_type_returns_422(self):
        status, body = api("POST", "/api/v1/waste/predict", json={
            "month": 6,
        })
        assert status == 422

    def test_all_canonical_types(self):
        for dt in ["residential_compound", "hospital", "mall", "school", "office"]:
            status, body = api("POST", "/api/v1/waste/predict", json={
                "development_type": dt,
                "properties": {"num_residents": 100, "num_beds": 50,
                               "gross_leasable_area_sqm": 5000,
                               "num_students": 200, "num_employees": 100},
            })
            assert status == 200, f"Failed for {dt}: {body}"
            assert body["waste_generation_kg"] >= 0


# ---------------------------------------------------------------------------
# Unified What-If Simulation
# ---------------------------------------------------------------------------

class TestUnifiedSimulation:
    def test_full_simulation_returns_all_stages(self):
        t0 = time.time()
        status, body = api("POST", "/api/v1/scenarios/simulate", json={
            "development_id": "contract-sim-001",
            "development_type": "residential_compound",
            "zone_id": "",
            "name": "Contract Test Sim",
            "properties": {"num_residents": 500, "num_units": 100},
            "simulation_hour": 8,
            "latitude": 30.05,
            "longitude": 31.75,
        }, timeout=60)
        elapsed = time.time() - t0

        assert status == 200
        assert elapsed < 30  # should complete within 30s

        # All 8 stages present
        assert "stage1_od_demand" in body
        assert "stage2_assignment" in body
        assert "stage3_scenario_traffic" in body
        assert "stage4_impact_assessment" in body
        assert "stage5_electricity" in body
        assert "stage6_water" in body
        assert "stage7_waste" in body
        assert "stage8_environment" in body

        # Water stage
        w = body["stage6_water"]
        assert w["water_available"] is True
        assert w["water_demand_m3_hour"] > 0
        assert w["unit"] == "m3"
        assert w["model"] == "extra_trees"

        # Waste stage
        wa = body["stage7_waste"]
        assert wa["waste_available"] is True
        assert wa["waste_generation_kg_day"] > 0
        assert wa["model"] == "XGBRegressor"

        # CO2 stage
        co2 = body["stage8_environment"]
        assert co2["co2_available"] is True
        assert "total_co2_kg" in co2
        assert "factors" in co2

        # Development input echoed
        assert body["development_input"]["development_type"] == "residential_compound"

    def test_invalid_type_returns_400(self):
        status, body = api("POST", "/api/v1/scenarios/simulate", json={
            "development_id": "bad",
            "development_type": "hotel",
            "zone_id": "Z001",
            "properties": {},
        })
        assert status == 400

    def test_mall_simulation(self):
        status, body = api("POST", "/api/v1/scenarios/simulate", json={
            "development_id": "contract-mall-001",
            "development_type": "mall",
            "properties": {"gross_leasable_area_sqm": 20000, "num_employees": 200},
            "simulation_hour": 14,
            "latitude": 30.02,
            "longitude": 31.78,
        }, timeout=60)
        assert status == 200
        assert body["stage6_water"]["water_available"] is True
        assert body["stage7_waste"]["waste_available"] is True


# ---------------------------------------------------------------------------
# Persistence
# ---------------------------------------------------------------------------

class TestPersistence:
    """Test that developments persist in SQLite."""

    def test_persistence_across_requests(self):
        dev_id = "persist-test-001"
        # Create
        status, _ = api("POST", "/api/v1/developments", json={
            "development_id": dev_id,
            "development_type": "school",
            "latitude": 30.01,
            "longitude": 31.79,
            "properties": {"num_students": 300},
        })
        assert status == 201

        # Retrieve in a separate request
        status, body = api("GET", f"/api/v1/developments/{dev_id}")
        assert status == 200
        assert body["development_id"] == dev_id
        assert body["development_type"] == "school"

        # Cleanup
        api("DELETE", f"/api/v1/developments/{dev_id}")
