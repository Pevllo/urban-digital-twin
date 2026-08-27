from fastapi import APIRouter

router = APIRouter(prefix="/traffic", tags=["Traffic"])

@router.get("/baseline")
def get_baseline_traffic():
    return {"status": "ok", "message": "Baseline traffic query endpoint"}
