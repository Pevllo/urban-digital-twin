from fastapi import APIRouter, HTTPException, status
from backend.api.schemas.development_schema import SimulationRequestSchema
from backend.api.services.simulator_service import run_simulation

router = APIRouter(prefix="/scenarios", tags=["Scenarios"])

@router.post("/simulate")
def simulate_scenario(payload: SimulationRequestSchema):
    try:
        # Derive footprint area from properties if available
        footprint_area = 0.0
        floors = 1
        props = payload.properties or {}

        # Try to get footprint from properties (width * length)
        width = props.get("width")
        length = props.get("length")
        if width and length:
            footprint_area = float(width) * float(length)

        # Get floors from properties or default
        floors = int(props.get("floors", 1))

        result = run_simulation(
            dev_type=payload.development_type,
            zone_id=payload.zone_id,
            properties=payload.properties,
            name=payload.name,
            hour=payload.simulation_hour or 8,
            dev_id=payload.development_id,
            latitude=payload.latitude,
            longitude=payload.longitude,
            footprint_area=footprint_area,
            floors=floors,
        )
        return result
    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))
