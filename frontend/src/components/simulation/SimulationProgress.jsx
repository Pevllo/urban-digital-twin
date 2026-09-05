import { SIMULATION_PIPELINE } from "../../utils/simulation.js";

export function SimulationProgress() {
  return (
    <div className="sim-progress">
      <div className="sim-progress-label">RUNNING WHAT-IF SIMULATION</div>
      <div className="sim-progress-sub">● Running urban impact simulation…</div>
      <div className="sim-pipeline">
        {SIMULATION_PIPELINE.map((stage) => (
          <div key={stage.key} className="sim-stage pending">
            <span className="sim-stage-dot" aria-hidden="true" />
            <span>{stage.label}</span>
          </div>
        ))}
      </div>
      <div className="sim-banner">
        <span className="sim-banner-dot" aria-hidden="true" />
        Running urban impact simulation...
      </div>
    </div>
  );
}
