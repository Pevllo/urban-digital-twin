from fastapi import APIRouter

router = APIRouter(prefix="/map", tags=["Map"])

@router.get("/config")
def get_map_config():
    return {
        "center": {"latitude": 30.0154, "longitude": 31.7366, "height": 1300},
        "default_pitch": -38.0,
        "default_heading": 12.0
    }
