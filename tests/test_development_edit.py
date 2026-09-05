"""
Regression and Integration Test Suite for Editing Developments.

Tests:
1. Direct storage update_development with re-entrant locking.
2. Full FastAPI PUT /api/v1/developments/{id} route execution.
3. Validation and 404/422 error handling.
4. Exact reproduction of the "british compound" edit payload.
5. Persistence across multiple consecutive reads, updates, and deletes.
"""

import pytest
from fastapi.testclient import TestClient
from backend.main import app
from backend.storage.development_store import (
    init_db,
    create_development,
    get_development,
    update_development,
    delete_development,
)

client = TestClient(app)


def test_storage_direct_update():
    """Verify that update_development does not deadlock and accurately persists."""
    init_db()
    dev_id = "test-store-direct-001"
    
    # Clean up previous if any
    delete_development(dev_id)

    # 1. Create
    created = create_development({
        "development_id": dev_id,
        "development_type": "residential_compound",
        "name": "British Compound Initial",
        "latitude": 30.01836,
        "longitude": 31.75767,
        "floors": 5,
        "properties": {"num_residents": 10000, "num_units": 2500},
    })
    assert created is not None
    assert created["development_id"] == dev_id
    assert created["floors"] == 5

    # 2. Update (This previously deadlocked on threading.Lock!)
    updated = update_development(dev_id, {
        "development_type": "residential_compound",
        "name": "british compound",
        "latitude": 30.01836,
        "longitude": 31.75767,
        "floors": 9,
        "status": "proposed",
        "properties": {
            "num_residents": 20000,
            "num_units": 5000,
            "gross_floor_area_sqm": 9000,
        },
    })
    assert updated is not None
    assert updated["development_id"] == dev_id
    assert updated["name"] == "british compound"
    assert updated["floors"] == 9
    assert updated["properties"]["num_residents"] == 20000
    assert updated["properties"]["num_units"] == 5000
    assert updated["properties"]["gross_floor_area_sqm"] == 9000

    # 3. Read back
    fetched = get_development(dev_id)
    assert fetched["name"] == "british compound"
    assert fetched["floors"] == 9

    # Cleanup
    assert delete_development(dev_id) is True


def test_api_endpoint_edit_development_success():
    """Test full FastAPI endpoint lifecycle for PUT /api/v1/developments/{id}."""
    dev_id = "test-api-british-compound-002"
    delete_development(dev_id)

    # 1. POST create
    create_resp = client.post("/api/v1/developments", json={
        "development_id": dev_id,
        "development_type": "residential",
        "name": "british compound (draft)",
        "latitude": 30.01836,
        "longitude": 31.75767,
        "floors": 4,
        "properties": {"num_residents": 5000},
    })
    assert create_resp.status_code == 201

    # 2. PUT edit with exact user scenario fields
    edit_resp = client.put(f"/api/v1/developments/{dev_id}", json={
        "development_id": dev_id,
        "development_type": "residential",
        "name": "british compound",
        "latitude": 30.01836,
        "longitude": 31.75767,
        "floors": 9,
        "status": "proposed",
        "properties": {
            "num_residents": 20000,
            "num_units": 5000,
            "gross_floor_area_sqm": 9000,
        },
    })
    assert edit_resp.status_code == 200
    data = edit_resp.json()
    assert data["development_id"] == dev_id
    assert data["name"] == "british compound"
    assert data["floors"] == 9
    assert data["properties"]["num_residents"] == 20000
    assert data["properties"]["num_units"] == 5000
    assert data["properties"]["gross_floor_area_sqm"] == 9000

    # 3. GET verify
    get_resp = client.get(f"/api/v1/developments/{dev_id}")
    assert get_resp.status_code == 200
    assert get_resp.json()["name"] == "british compound"
    assert get_resp.json()["floors"] == 9

    # Cleanup
    del_resp = client.delete(f"/api/v1/developments/{dev_id}")
    assert del_resp.status_code == 200


def test_api_endpoint_edit_not_found():
    """PUT to a non-existent development returns 404."""
    resp = client.put("/api/v1/developments/non-existent-id-404", json={
        "development_type": "residential",
        "name": "Ghost Development",
        "latitude": 30.0,
        "longitude": 31.0,
        "floors": 2,
    })
    assert resp.status_code == 404
    assert "not found" in resp.json()["detail"].lower()


def test_api_endpoint_edit_validation_error():
    """PUT with invalid development_type returns 422 Unprocessable Entity."""
    resp = client.put("/api/v1/developments/any-id", json={
        "development_type": "invalid_development_type_12345",
        "latitude": 30.0,
        "longitude": 31.0,
        "floors": 2,
    })
    assert resp.status_code == 422


if __name__ == "__main__":
    test_storage_direct_update()
    test_api_endpoint_edit_development_success()
    test_api_endpoint_edit_not_found()
    test_api_endpoint_edit_validation_error()
    print("ALL DEVELOPMENT EDIT REGRESSION TESTS PASSED!")
