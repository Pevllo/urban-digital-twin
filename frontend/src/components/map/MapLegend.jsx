import { useApp } from "../../store/AppContext.jsx";

export function MapLegend() {
  const { state, dispatch } = useApp();
  const layerVisibility = state.map.layerVisibility;

  const layers = [
    { key: "roads", label: "Roads" },
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
    { key: "dev-boundary", label: "Development Boundary", swatch: "swatch-dev-boundary" },
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

