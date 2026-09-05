import { MapPin, X, Navigation, Activity } from "lucide-react";
import { useApp } from "../../store/AppContext.jsx";
import { formatLat, formatLon, formatNumber } from "../../utils/format.js";

export function LocationInfoCard() {
  const { state, dispatch } = useApp();
  const location = state.map.selectedLocation;
  const road = state.map.selectedRoad;

  if (road) {
    const assessment = road.trafficAssessment;
    const baseline = road.baselineTraffic;
    const status = road.trafficStatus || "Healthy";
    const statusClass = status.toLowerCase().replace(/[^a-z0-9]/g, "-");

    const baselineVc = assessment?.baseline_vc ?? (baseline ? baseline.traffic_volume / Math.max(baseline.road_capacity_proxy, 1) : null);
    const scenarioVc = assessment?.scenario_vc;
    const vcChange = assessment?.vc_change;

    return (
      <div className="location-card road-info-card">
        <div className="location-card-header">
          <div className="location-card-title">
            <Navigation size={14} />
            <span>ROAD INSPECTOR</span>
          </div>
          <button
            className="icon-button"
            aria-label="Clear road selection"
            onClick={() => dispatch({ type: "MAP_ROAD_CLEARED" })}
            type="button"
          >
            <X size={13} />
          </button>
        </div>

        <div className="road-header-info">
          <div className="road-name">{road.name}</div>
          <div className="road-meta-tags">
            <span className="badge dev-type">{road.highway}</span>
            <span className="badge">OSM {road.osm_way_id}</span>
            {road.trafficStatus && (
              <span className={`badge road-status status-${statusClass}`}>
                {road.trafficStatus}
              </span>
            )}
          </div>
        </div>

        <div className="location-coords">
          {baselineVc != null && (
            <div className="coord-row">
              <span className="coord-label">Baseline V/C</span>
              <span className="coord-value">{formatNumber(baselineVc, 2)}</span>
            </div>
          )}
          {scenarioVc != null && (
            <div className="coord-row">
              <span className="coord-label">Scenario V/C</span>
              <span className="coord-value">{formatNumber(scenarioVc, 2)}</span>
            </div>
          )}
          {vcChange != null && (
            <div className="coord-row">
              <span className="coord-label">Impact Δ V/C</span>
              <span className={`coord-value ${vcChange > 0.001 ? "text-danger" : ""}`}>
                {vcChange > 0.0001 ? `+${formatNumber(vcChange, 2)}` : formatNumber(vcChange, 2)}
              </span>
            </div>
          )}
          {assessment?.scenario_los && (
            <div className="coord-row">
              <span className="coord-label">Level of Service</span>
              <span className="coord-value">
                {assessment.baseline_los ? `${assessment.baseline_los} → ` : ""}
                <strong>LOS {assessment.scenario_los}</strong>
              </span>
            </div>
          )}
          {baseline?.traffic_volume != null && !assessment && (
            <div className="coord-row">
              <span className="coord-label">Baseline Traffic</span>
              <span className="coord-value">{formatNumber(baseline.traffic_volume, 0)} veh/h</span>
            </div>
          )}
        </div>
      </div>
    );
  }

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
        {location.adjusted && (
          <div className="coord-row-badge">
            <Activity size={12} />
            <span>Auto-adjusted to buildable plot</span>
          </div>
        )}
      </div>
    </div>
  );
}
