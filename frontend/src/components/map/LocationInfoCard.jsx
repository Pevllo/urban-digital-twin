import { MapPin, X } from "lucide-react";
import { useApp } from "../../store/AppContext.jsx";
import { formatLat, formatLon } from "../../utils/format.js";

export function LocationInfoCard() {
  const { state, dispatch } = useApp();
  const location = state.map.selectedLocation;

  if (!location) return null;

  return (
    <div className="location-card">
      <div className="location-card-header">
        <div className="location-card-title">
          <MapPin size={14} />
          <span>SELECTED LOCATION</span>
        </div>
        <button
          className="icon-button"
          aria-label="Clear selection"
          onClick={() => dispatch({ type: "MAP_LOCATION_CLEARED" })}
          type="button"
        >
          <X size={13} />
        </button>
      </div>
      <div className="location-coords">
        <div className="coord-row">
          <span className="coord-label">Latitude</span>
          <span className="coord-value">{formatLat(location.latitude)}</span>
        </div>
        <div className="coord-row">
          <span className="coord-label">Longitude</span>
          <span className="coord-value">{formatLon(location.longitude)}</span>
        </div>
      </div>
    </div>
  );
}
