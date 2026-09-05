import { Play, Loader2, Zap } from "lucide-react";
import { useApp } from "../../store/AppContext.jsx";
import { Panel } from "../common/Panel.jsx";
import { ErrorMessage } from "../common/ErrorMessage.jsx";
import { SimulationProgress } from "./SimulationProgress.jsx";
import { runSimulation } from "../../api/scenarios.js";
import { buildSimulationPayload } from "../../services/simulationService.js";
import { ApiError } from "../../api/client.js";
import { ResultsPanel } from "../results/ResultsPanel.jsx";

export function SimulationPanel() {
  const { state, dispatch } = useApp();
  const sim = state.simulation;
  const development = state.development;
  const location = state.map.selectedLocation;

  // The What-If simulation is only valid once a development has actually been
  // persisted by the backend, so we gate on the real development_id from the
  // create response (state.development.placed), not merely on a non-null
  // "placed" placeholder.
  const placedDevId = development.placed?.development_id || development.placed?.id || null;
  const devPlaced = Boolean(placedDevId);

  async function handleRun() {
    if (!placedDevId) {
      dispatch({
        type: "SIMULATION_ERROR",
        error: "Place a development before running the What-If simulation.",
      });
      return;
    }
    dispatch({ type: "SIMULATION_RUNNING" });
    const payload = buildSimulationPayload(development, location);
    if (!payload.development_id) {
      dispatch({
        type: "SIMULATION_ERROR",
        error: "Place a development before running the What-If simulation.",
      });
      return;
    }
    try {
      const result = await runSimulation(payload);
      dispatch({ type: "SIMULATION_DONE", result });
    } catch (err) {
      dispatch({
        type: "SIMULATION_ERROR",
        error: err instanceof ApiError ? err.message : "Simulation failed.",
      });
    }
  }

  if (sim.result) {
    return <ResultsPanel />;
  }

  return (
    <Panel
      title="What-If Engine"
      icon={<Zap size={14} />}
      className="simulation-panel"
    >
      {sim.running ? (
        <SimulationProgress />
      ) : (
        <>
          <div className="sim-intro">
            <div className="sim-intro-title">Unified What-If Simulation</div>
            <div className="sim-intro-text">
              Run a single simulation to assess the impact of the proposed
              development on traffic, electricity, water, and solid waste.
            </div>
            <div className="sim-domains">
              <span>Traffic</span>
              <span>Electricity</span>
              <span>Water</span>
              <span>Solid Waste</span>
            </div>
          </div>
          <ErrorMessage message={sim.error} compact />
          <button
            className="btn primary full cta"
            onClick={handleRun}
            disabled={!devPlaced || sim.running}
            type="button"
          >
            {sim.running ? (
              <Loader2 size={15} className="spin" />
            ) : (
              <Play size={15} />
            )}
            {devPlaced ? "RUN WHAT-IF SIMULATION" : "PLACE DEVELOPMENT FIRST"}
          </button>
        </>
      )}
    </Panel>
  );
}
