import { TopBar } from "./TopBar.jsx";
import { WorkflowPanel } from "./WorkflowPanel.jsx";
import { MapToolbar } from "./MapToolbar.jsx";
import { CesiumMap } from "../map/CesiumMap.jsx";
import { LocationInfoCard } from "../map/LocationInfoCard.jsx";
import { MapLegend } from "../map/MapLegend.jsx";
import { DevelopmentPanel } from "../development/DevelopmentPanel.jsx";
import { SimulationPanel } from "../simulation/SimulationPanel.jsx";
import { useApp } from "../../store/AppContext.jsx";
import { computeActiveStep } from "../../utils/workflowState.js";

export function AppShell() {
  const { state } = useApp();
  const activeStep = computeActiveStep(state);

  return (
    <div className="app-shell">
      <TopBar />

      <div className="map-area">
        <CesiumMap />

        {/* Left floating column: workflow + map tools */}
        <div className="left-float">
          <WorkflowPanel activeStep={activeStep} />
          <div className="map-tools-block">
            <MapToolbar />
          </div>
          {state.ui.panelOpen.layers && (
            <div className="layers-panel">
              <MapLegend />
            </div>
          )}
        </div>

        {/* Right floating column: new development */}
        <div className="right-float">
          <LocationInfoCard />
          <DevelopmentPanel />
        </div>

        {/* Bottom floating panel: what-if engine / results */}
        <div className="bottom-float">
          <SimulationPanel />
        </div>
      </div>
    </div>
  );
}