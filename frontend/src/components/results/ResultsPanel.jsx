import { Activity, RefreshCw, Building2 } from "lucide-react";
import { useApp } from "../../store/AppContext.jsx";
import { ImpactOverview } from "./ImpactOverview.jsx";
import { TrafficDetail } from "./TrafficImpactCard.jsx";

export function ResultsPanel() {
  const { state, dispatch } = useApp();
  const sim = state.simulation;
  const data = sim.result;
  const dev = state.development;

  if (!data) return null;

  function handleNewScenario() {
    dispatch({ type: "SET_NEW_SCENARIO" });
  }

  const devInput = data.development_input || {};

  return (
    <div className="results-panel">
      <div className="results-header">
        <div className="results-title-row">
          <Activity size={16} />
          <div>
            <h2 className="results-title">WHAT-IF SIMULATION</h2>
            <div className="results-subtitle">Urban Impact Overview</div>
          </div>
        </div>
        <button className="btn secondary small" onClick={handleNewScenario} type="button">
          <RefreshCw size={13} />
          New Scenario
        </button>
      </div>

      <div className="results-summary">
        <div className="summary-chip">
          <Building2 size={13} />
          <span>{devInput.development_type || dev.type}</span>
        </div>
        {devInput.zone_id && (
          <div className="summary-chip">
            <span>Zone {devInput.zone_id}</span>
          </div>
        )}
        <div className="summary-chip">
          <span>Hour {data.hour ?? 8}</span>
        </div>
      </div>

      <ImpactOverview data={data} />

      <TrafficDetail stage={data.stage4_impact_assessment} />

      <div className="results-footer">
        <button className="btn secondary full" onClick={handleNewScenario} type="button">
          <RefreshCw size={14} />
          Start Another Scenario
        </button>
      </div>
    </div>
  );
}
