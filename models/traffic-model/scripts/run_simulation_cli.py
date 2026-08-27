"""
CLI Integration Bridge for Step 5 What-If Simulation Runner.

Reads JSON scenario payload from stdin or argument, constructs Stage 1 DevelopmentInput,
executes the unified mobility simulator (simulate_what_if_scenario), and outputs
the complete JSON simulation result.
"""

import json
from pathlib import Path
import sys

# Path setup
SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent.parent

for d in [PROJECT_ROOT / "traffic-model" / "src", PROJECT_ROOT / "trip-demand-model" / "src"]:
    if str(d) not in sys.path:
        sys.path.insert(0, str(d))

from trip_generation import DevelopmentInput
from simulator import simulate_what_if_scenario


def run_cli_simulation(payload_dict: dict) -> dict:
    """Validates payload, constructs DevelopmentInput, and runs simulate_what_if_scenario."""
    dev_type = payload_dict.get("development_type")
    zone_id = payload_dict.get("zone_id")
    properties = payload_dict.get("properties", {})
    name = payload_dict.get("name", "")
    hour = int(payload_dict.get("simulation_hour", payload_dict.get("hour", 8)))

    if not dev_type or not zone_id:
        raise ValueError("Missing required fields: development_type and zone_id are required.")

    dev_input = DevelopmentInput(
        development_type=dev_type,
        zone_id=zone_id,
        properties=properties,
        name=name,
    )

    # Execute backend 4-stage pipeline
    result = simulate_what_if_scenario(dev_input, hour=hour)
    return result.to_dict()


def main():
    if len(sys.argv) > 1:
        raw_input = sys.argv[1]
    else:
        raw_input = sys.stdin.read()

    if not raw_input or not raw_input.strip():
        print(json.dumps({"error": "Empty input payload provided."}))
        sys.exit(1)

    try:
        payload = json.loads(raw_input)
        res_dict = run_cli_simulation(payload)
        print(json.dumps(res_dict, indent=2))
    except Exception as err:
        error_res = {
            "error": str(err),
            "type": err.__class__.__name__,
        }
        print(json.dumps(error_res))
        sys.exit(1)


if __name__ == "__main__":
    main()
