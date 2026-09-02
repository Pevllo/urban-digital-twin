import logging

from fastapi import APIRouter, HTTPException, status

from backend.api.schemas.waste_schema import WastePredictRequest, WastePredictResponse
from backend.api.services import waste_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/waste", tags=["Waste"])


@router.post("/predict", response_model=WastePredictResponse)
def predict_waste(payload: WastePredictRequest):
    try:
        result = waste_service.run_waste_prediction(
            dev_type=payload.development_type,
            properties=payload.properties,
            zone_lat=payload.zone_lat,
            zone_lon=payload.zone_lon,
            month=payload.month,
            day_of_week=payload.day_of_week,
            temperature_c=payload.temperature_c,
        )
        return result
    except ValueError as ve:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(ve)
        )
    except waste_service.ModelUnavailableError as mue:
        logger.error("Waste model unavailable: %s", mue)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(mue),
        )
    except Exception:
        logger.exception("Waste prediction failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Waste prediction failed unexpectedly.",
        )
