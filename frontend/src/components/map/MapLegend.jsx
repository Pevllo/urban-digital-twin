import { useApp } from "../../store/AppContext.jsx";

export function MapLegend() {
  const { state, dispatch } = useApp();
  const layerVisibility = state.map.layerVisibility;
  const isScenarioActive = Boolean(state.simulation?.result?.stage4_impact_assessment);

  const layers = [
    { key: "roads", label: "Roads (Traffic Network)" },
    { key: "buildings", label: "Buildings" },
    { key: "projectBoundary", label: "Project Boundary" },
    { key: "osmBoundaries", label: "OSM Boundaries" },
    { key: "developments", label: "Developments" },
  ];

  const siteElements = [
    { key: "dev-buildings", label: "Development Buildings", swatch: "swatch-dev-buildings" },
    { key: "dev-landscaping", label: "Landscaping", swatch: "swatch-dev-landscaping" },
    { key: "dev-roads", label: "Internal Roads", swatch: "swatch-dev-roads" },
    { key: "dev-plazas", label: "Pedestrian Areas", swatch: "swatch-dev-plazas" },
    { key: "dev-parking", label: "Parking", swatch: "swatch-dev-parking" },
    { key: "dev-water", label: "Water Features", swatch: "swatch-dev-water" },
  ];

  const scenarioTrafficLevels = [
    { label: "Unaffected / Healthy", swatch: "swatch-traffic-healthy" },
    { label: "Moderate Impact (Δ V/C ≥ 0.02)", swatch: "swatch-traffic-moderate" },
    { label: "Worsened (LOS Drop / Δ V/C ≥ 0.05)", swatch: "swatch-traffic-worsened" },
    { label: "Critical Impact (V/C ≥ 1.0 / LOS F)", swatch: "swatch-traffic-critical" },
  ];

  const baselineTrafficLevels = [
    { label: "Free Flow (V/C < 0.60)", swatch: "swatch-traffic-healthy" },
    { label: "Moderate Flow (V/C 0.60–0.80)", swatch: "swatch-traffic-moderate" },
    { label: "Stressed (V/C 0.80–1.00)", swatch: "swatch-traffic-worsened" },
    { label: "Congested (V/C ≥ 1.00)", swatch: "swatch-traffic-critical" },
  ];

  function toggle(key) {
    dispatch({ type: "TOGGLE_LAYER", layer: key });
  }

  return (
    <div className="layer-legend">
      <div className="legend-section">
        <div className="legend-title">Data Layers</div>
        {layers.map((layer) => (
          <label key={layer.key} className="legend-row">
            <input
              type="checkbox"
              checked={!!layerVisibility[layer.key]}
              onChange={() => toggle(layer.key)}
            />
            <span className={`legend-swatch swatch-${layer.key}`} aria-hidden="true" />
            <span className="legend-label">{layer.label}</span>
          </label>
        ))}
      </div>

      <div className="legend-divider" />

      <div className="legend-section">
        <div className="legend-title">
          {isScenarioActive ? "Scenario Traffic Impact" : "Network Traffic Condition"}
        </div>
        <div className="legend-grid">
          {(isScenarioActive ? scenarioTrafficLevels : baselineTrafficLevels).map((level) => (
            <div key={level.label} className="legend-item-static">
              <span className={`legend-swatch ${level.swatch}`} aria-hidden="true" />
              <span className="legend-label">{level.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="legend-divider" />

      <div className="legend-section">
        <div className="legend-title">Development Elements</div>
        <div className="legend-grid">
          {siteElements.map((el) => (
            <div key={el.key} className="legend-item-static">
              <span className={`legend-swatch ${el.swatch}`} aria-hidden="true" />
              <span className="legend-label">{el.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
