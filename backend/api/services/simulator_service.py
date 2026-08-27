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

def run_simulation(dev_type: str, zone_id: str, properties: dict, name: str = "", hour: int = 8) -> dict:
    dev_input = DevelopmentInput(
        development_type=dev_type,
        zone_id=zone_id,
        properties=properties,
        name=name or dev_type,
    )
    result = simulate_what_if_scenario(dev_input, hour=hour)
    return result.to_dict()
