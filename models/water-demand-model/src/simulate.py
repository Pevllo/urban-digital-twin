"""
What-If Simulation for Water Demand.

Compare baseline vs modified scenario to quantify impact.
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))

from predict import predict, validate_input


def simulate(baseline: dict, scenario: dict) -> dict:
    """
    Run What-If simulation comparing baseline to modified scenario.

    Parameters
    ----------
    baseline : dict
        Baseline development properties and conditions.
    scenario : dict
        Modified scenario (only changed variables need to be specified).

    Returns
    -------
    dict with baseline prediction, scenario prediction, and delta.
    """
    baseline_validated = validate_input(baseline)
    merged = {**baseline_validated, **scenario}
    merged_validated = validate_input(merged)

    baseline_result = predict(baseline_validated)
    scenario_result = predict(merged_validated)

    baseline_pred = baseline_result["prediction"]
    scenario_pred = scenario_result["prediction"]
    delta = scenario_pred - baseline_pred
    pct_change = (delta / baseline_pred * 100) if baseline_pred > 0 else 0.0

    changed_vars = {}
    for key in scenario:
        if key in baseline and baseline[key] != scenario[key]:
            changed_vars[key] = {"from": baseline[key], "to": scenario[key]}

    return {
        "baseline_prediction": baseline_result["prediction"],
        "scenario_prediction": scenario_result["prediction"],
        "delta_m3": round(delta, 4),
        "delta_liters": round(delta * 1000, 2),
        "pct_change": round(pct_change, 2),
        "unit": "m3",
        "changed_variables": changed_vars,
        "baseline_scenario": baseline_validated,
        "modified_scenario": merged_validated,
        "model": baseline_result["model"],
    }


def simulate_sensitivity(
    base_scenario: dict,
    variable: str,
    values: list,
) -> dict:
    """
    Run sensitivity analysis on a single variable.

    Parameters
    ----------
    base_scenario : dict
        Base scenario (all variables fixed except the tested one).
    variable : str
        Variable to sweep.
    values : list
        Values to test.

    Returns
    -------
    dict with variable, values, predictions, and deltas.
    """
    base_result = predict(base_scenario)
    base_pred = base_result["prediction"]

    predictions = []
    for val in values:
        mod = {**base_scenario, variable: val}
        result = predict(mod)
        predictions.append(result["prediction"])

    return {
        "variable": variable,
        "base_value": base_scenario.get(variable),
        "base_prediction": base_pred,
        "tested_values": values,
        "predictions": predictions,
        "deltas": [round(p - base_pred, 4) for p in predictions],
        "unit": "m3",
    }
