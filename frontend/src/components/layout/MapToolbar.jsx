import { MousePointerClick, Map as MapIcon, Layers } from "lucide-react";
import { useApp } from "../../store/AppContext.jsx";
import { CesiumMapApi } from "../map/CesiumMapApi.js";

import { BASEMAPS } from "../../config/mapConfig.js";

export function MapToolbar() {
  const { state, dispatch } = useApp();

  const selectActive = !!state.map.selectedLocation;
  const currentBasemap = state.map.basemap || BASEMAPS.SATELLITE;

  return (
    <div className="map-toolbar-group">
      <div className="map-toolbar">
        <button
          className={`map-tool${selectActive ? " active" : ""}`}
          title="Click the map to select a location"
          aria-pressed={selectActive}
          onClick={() => {
            if (selectActive) {
              dispatch({ type: "MAP_LOCATION_CLEARED" });
            }
          }}
          type="button"
        >
          <MousePointerClick size={15} />
          <span>{selectActive ? "Selected" : "Select"}</span>
        </button>
        <button
          className="map-tool"
          title="Re-center on the project area"
          onClick={() => CesiumMapApi.flyToCity()}
          type="button"
        >
          <MapIcon size={15} />
          <span>City View</span>
        </button>
        <button
          className="map-tool"
          title="Toggle map layers"
          aria-pressed={!!state.ui.panelOpen.layers}
          onClick={() => dispatch({ type: "TOGGLE_PANEL", panel: "layers" })}
          type="button"
        >
          <Layers size={15} />
          <span>Layers</span>
        </button>
      </div>

      <div className="basemap-toolbar">
        <div className="basemap-title">MAP STYLE</div>
        <div className="basemap-switch">
          <button
            className={`basemap-btn${currentBasemap === BASEMAPS.SATELLITE ? " active" : ""}`}
            title="Satellite / Aerial Imagery"
            onClick={() => dispatch({ type: "SET_BASEMAP", basemap: BASEMAPS.SATELLITE })}
            type="button"
          >
            <span>🛰 Satellite</span>
          </button>
          <button
            className={`basemap-btn${currentBasemap === BASEMAPS.GOOGLE_ROADMAP ? " active" : ""}`}
            title="Google Roadmap"
            onClick={() => dispatch({ type: "SET_BASEMAP", basemap: BASEMAPS.GOOGLE_ROADMAP })}
            type="button"
          >
            <span>🗺 Roadmap</span>
          </button>
        </div>
      </div>
    </div>
  );
}
