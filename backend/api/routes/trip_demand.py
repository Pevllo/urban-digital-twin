from fastapi import APIRouter

router = APIRouter(prefix="/trip-demand", tags=["Trip Demand"])

@router.get("/rates")
def get_trip_generation_rates():
    return {
        "residential_compound": {"rate": 0.8, "unit": "trips/resident/day"},
        "hospital": {"rate": 2.5, "unit": "trips/bed/day"},
        "mall": {"rate": 40.0, "unit": "trips/100m2 GLA/day"},
        "school": {"rate": 1.2, "unit": "trips/student/day"},
        "office": {"rate": 2.0, "unit": "trips/employee/day"}
    }
