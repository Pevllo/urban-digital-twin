"""
Unit tests for trip_generation.py (Stage 1: Trip Generation & OD Demand).
"""
import sys
from pathlib import Path

import pytest

# Add src to path so imports work cleanly regardless of execution directory
TEST_DIR = Path(__file__).resolve().parent
MODEL_DIR = TEST_DIR.parent
SRC_DIR = MODEL_DIR / "src"
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

from trip_generation import (
    DevelopmentInput,
    calculate_development_od,
    distribute_trips_gravity,
    generate_development_trips,
    load_zone_mapping,
)


def test_1_residential_compound():
    """Test 1 — Residential compound (8,000 residents)."""
    inp = DevelopmentInput(
        development_type="residential_compound",
        zone_id="Z0001",
        properties={"num_residents": 8000},
    )
    result = generate_development_trips(inp)

    # 8,000 residents * 0.8 trips/resident/day = 6,400 daily trips
    assert result.daily_trips == pytest.approx(6400.0)
    assert result.zone_id == "Z0001"
    assert result.development_type == "residential_compound"

    # Verify hourly trips sum approximately to daily trips
    hourly_sum = sum(result.hourly_trips.values())
    assert hourly_sum == pytest.approx(6400.0, rel=1e-3)

    # Verify positive hourly trips
    assert all(val > 0 for val in result.hourly_trips.values())

    # Distribute via Gravity Model
    od_res = distribute_trips_gravity(result, hour=8)
    assert od_res.origin_zone == "Z0001"
    assert od_res.total_trips > 0
    assert len(od_res.od_matrix) > 0
    assert all(rec.trips > 0 for rec in od_res.od_matrix)


def test_2_hospital():
    """Test 2 — Hospital (300 beds, 450 staff)."""
    inp = DevelopmentInput(
        development_type="hospital",
        zone_id="Z0001",
        properties={"num_beds": 300, "staff_count": 450},
    )
    result = generate_development_trips(inp)

    # 300 beds * 2.5 + 450 staff * 1.5 = 750 + 675 = 1425 daily trips
    assert result.daily_trips == pytest.approx(1425.0)
    assert result.daily_trips > 0
    assert sum(result.hourly_trips.values()) == pytest.approx(1425.0, rel=1e-3)

    od_res = distribute_trips_gravity(result, hour=9)
    assert od_res.total_trips > 0
    assert len(od_res.od_matrix) > 0


def test_3_mall():
    """Test 3 — Mall (50,000 m² GLA)."""
    inp = DevelopmentInput(
        development_type="mall",
        zone_id="Z0001",
        properties={"gross_leasable_area_sqm": 50000},
    )
    result = generate_development_trips(inp)

    # (50,000 / 100) * 40 = 20,000 daily trips
    assert result.daily_trips == pytest.approx(20000.0)
    assert result.daily_trips > 0
    assert sum(result.hourly_trips.values()) == pytest.approx(20000.0, rel=1e-3)

    od_res = distribute_trips_gravity(result, hour=18)
    assert od_res.total_trips > 0
    assert len(od_res.od_matrix) > 0


def test_4_school():
    """Test 4 — School (2,000 students)."""
    inp = DevelopmentInput(
        development_type="school",
        zone_id="Z0001",
        properties={"num_students": 2000},
    )
    result = generate_development_trips(inp)

    # 2,000 students * 1.2 = 2,400 daily trips
    assert result.daily_trips == pytest.approx(2400.0)
    assert result.daily_trips > 0
    assert sum(result.hourly_trips.values()) == pytest.approx(2400.0, rel=1e-3)

    od_res = distribute_trips_gravity(result, hour=8)
    assert od_res.total_trips > 0
    assert len(od_res.od_matrix) > 0


def test_5_office():
    """Test 5 — Office (5,000 employees)."""
    inp = DevelopmentInput(
        development_type="office",
        zone_id="Z0001",
        properties={"num_employees": 5000},
    )
    result = generate_development_trips(inp)

    # 5,000 employees * 2.0 = 10,000 daily trips
    assert result.daily_trips == pytest.approx(10000.0)
    assert result.daily_trips > 0
    assert sum(result.hourly_trips.values()) == pytest.approx(10000.0, rel=1e-3)

    od_res = distribute_trips_gravity(result, hour=8)
    assert od_res.total_trips > 0
    assert len(od_res.od_matrix) > 0


def test_6_scaling():
    """Test 6 — Scaling (4,000 -> 8,000 residents doubles demand)."""
    inp_4k = DevelopmentInput(
        development_type="residential_compound",
        zone_id="Z0001",
        properties={"num_residents": 4000},
    )
    res_4k = generate_development_trips(inp_4k)

    inp_8k = DevelopmentInput(
        development_type="residential_compound",
        zone_id="Z0001",
        properties={"num_residents": 8000},
    )
    res_8k = generate_development_trips(inp_8k)

    assert res_8k.daily_trips == pytest.approx(2.0 * res_4k.daily_trips)
    for h in range(24):
        assert res_8k.hourly_trips[h] == pytest.approx(2.0 * res_4k.hourly_trips[h])


def test_7_od_conservation():
    """Test 7 — OD conservation (sum(OD_matrix trips) ≈ produced trips)."""
    inp = DevelopmentInput(
        development_type="office",
        zone_id="Z0002",
        properties={"num_employees": 3000},
    )
    trip_res = generate_development_trips(inp)

    for h in range(24):
        od_matrix = distribute_trips_gravity(trip_res, hour=h)
        total_od_trips = sum(rec.trips for rec in od_matrix.od_matrix)
        expected_produced = trip_res.productions[h]
        assert total_od_trips == pytest.approx(expected_produced, rel=1e-3)


def test_8_invalid_inputs():
    """Test 8 — Invalid input validation."""
    # Negative residents
    with pytest.raises(ValueError, match="non-negative"):
        generate_development_trips(
            DevelopmentInput("residential_compound", "Z0001", {"num_residents": -500})
        )

    # Negative beds
    with pytest.raises(ValueError, match="non-negative"):
        generate_development_trips(
            DevelopmentInput("hospital", "Z0001", {"num_beds": -10})
        )

    # Negative GLA
    with pytest.raises(ValueError, match="non-negative"):
        generate_development_trips(
            DevelopmentInput("mall", "Z0001", {"gross_leasable_area_sqm": -100})
        )

    # Invalid development type
    with pytest.raises(ValueError, match="Unsupported development type"):
        generate_development_trips(
            DevelopmentInput("casino", "Z0001", {"num_tables": 50})
        )

    # Invalid zone ID
    with pytest.raises(ValueError, match="not found in zone dataset"):
        generate_development_trips(
            DevelopmentInput("residential_compound", "Z9999_NONEXISTENT", {"num_residents": 1000})
        )

    # Missing positive metric
    with pytest.raises(ValueError, match="requires at least one positive metric"):
        generate_development_trips(
            DevelopmentInput("school", "Z0001", {"num_students": 0})
        )
