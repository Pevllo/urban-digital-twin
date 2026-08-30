import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[2]
PROJECT_ROOT = BACKEND_DIR.parent
MODELS_DIR = PROJECT_ROOT / "models"

for d in [MODELS_DIR / "traffic-model" / "src", MODELS_DIR / "trip-demand-model" / "src"]:
    if str(d) not in sys.path:
        sys.path.insert(0, str(d))

from trip_generation import DevelopmentInput
from simulator import simulate_what_if_scenario
from backend.api.services.electricity_service import run_electricity_prediction


def run_simulation(
    dev_type: str,
    zone_id: str,
    properties: dict,
    name: str = "",
    hour: int = 8,
    dev_id: str = "",
    latitude: float | None = None,
    longitude: float | None = None,
    footprint_area: float = 0.0,
    floors: int = 1,
) -> dict:
    # Traffic simulation (4-stage pipeline)
    dev_input = DevelopmentInput(
        development_type=dev_type,
        zone_id=zone_id,
        properties=properties,
        name=name or dev_type,
        development_id=dev_id,
    )
    result = simulate_what_if_scenario(dev_input, hour=hour)
    traffic_result = result.to_dict()

    # Electricity prediction
    electricity_result = run_electricity_prediction(
        dev_type=dev_type,
        latitude=latitude,
        longitude=longitude,
        properties=properties,
        simulation_hour=hour,
        footprint_area=footprint_area,
        floors=floors,
    )

    # Merge electricity into traffic result
    traffic_result["stage5_electricity"] = electricity_result

    return traffic_result
