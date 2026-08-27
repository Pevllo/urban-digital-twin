from fastapi import APIRouter, HTTPException, status
from backend.api.schemas.development_schema import SimulationRequestSchema
from backend.api.services.simulator_service import run_simulation

router = APIRouter(prefix="/scenarios", tags=["Scenarios"])

@router.post("/simulate")
def simulate_scenario(payload: SimulationRequestSchema):
    try:
        result = run_simulation(
            dev_type=payload.development_type,
            zone_id=payload.zone_id,
            properties=payload.properties,
            name=payload.name,
            hour=payload.simulation_hour or 8
        )
        return result
    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))
