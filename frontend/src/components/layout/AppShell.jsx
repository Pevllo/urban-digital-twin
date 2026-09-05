import { TopBar } from "./TopBar.jsx";
import { WorkflowPanel } from "./WorkflowPanel.jsx";
import { MapToolbar } from "./MapToolbar.jsx";
import { CesiumMap } from "../map/CesiumMap.jsx";
import { LocationInfoCard } from "../map/LocationInfoCard.jsx";
import { MapLegend } from "../map/MapLegend.jsx";
import { DevelopmentPanel } from "../development/DevelopmentPanel.jsx";
import { SimulationPanel } from "../simulation/SimulationPanel.jsx";
import { DigitalTwinOverviewPage } from "../pages/DigitalTwinOverviewPage.jsx";
import { InfrastructurePage } from "../pages/InfrastructurePage.jsx";
import { DataLayersPage } from "../pages/DataLayersPage.jsx";
import { FullReportView } from "../pages/FullReportView.jsx";
import { useApp } from "../../store/AppContext.jsx";
import { computeActiveStep } from "../../utils/workflowState.js";

export function AppShell() {
  const { state } = useApp();
  const activeStep = computeActiveStep(state);
  const activeTab = state.ui?.activeTab || "scenarios";
  const showFullReport = Boolean(
    state.ui?.fullReportOpen &&
      (state.ui?.selectedReport?.result || state.simulation?.result)
  );

  return (
    <div className="app-shell">
      <TopBar />

      <div className="map-area">
        <CesiumMap />

        {/* Full Report View */}
        {showFullReport && <FullReportView />}

        {/* Page 1: Digital Twin Command Center */}
        {!showFullReport && activeTab === "digital-twin" && <DigitalTwinOverviewPage />}

        {/* Page 2: Physical Infrastructure Audit */}
        {!showFullReport && activeTab === "infrastructure" && <InfrastructurePage />}

        {/* Page 3: Spatial Data Layers Management */}
        {!showFullReport && activeTab === "data-layers" && <DataLayersPage />}

        {/* Page 4 / Default: Scenarios & What-If Simulation Floating Workflow */}
        {!showFullReport && activeTab === "scenarios" && (
          <>
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
          </>
        )}
      </div>
    </div>
  );
}