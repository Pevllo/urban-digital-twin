from fastapi import APIRouter

router = APIRouter(prefix="/city", tags=["City"])

@router.get("/info")
def get_city_info():
    return {
        "city_id": "NAC_R3",
        "name": "New Administrative Capital - District R3",
        "crs": "EPSG:4326",
        "bounds": {"min_lat": 29.98, "max_lat": 30.09, "min_lon": 31.67, "max_lon": 31.85}
    }
