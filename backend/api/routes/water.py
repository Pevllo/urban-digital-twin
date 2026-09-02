import logging

from fastapi import APIRouter, HTTPException, status

from backend.api.schemas.water_schema import WaterPredictRequest, WaterPredictResponse
from backend.api.services import water_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/water", tags=["Water"])


@router.post("/predict", response_model=WaterPredictResponse)
def predict_water(payload: WaterPredictRequest):
    try:
        result = water_service.run_water_prediction(
            dev_type=payload.development_type,
            zone_id=payload.zone_id,
            properties=payload.properties,
            simulation_hour=payload.hour,
            temperature_c=payload.temperature_c,
            month=payload.month,
            day_of_week=payload.day_of_week,
            is_weekend=payload.is_weekend,
        )
        return result
    except ValueError as ve:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(ve)
        )
    except water_service.ModelUnavailableError as mue:
        logger.error("Water model unavailable: %s", mue)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(mue),
        )
    except Exception:
        logger.exception("Water prediction failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Water prediction failed unexpectedly.",
        )
