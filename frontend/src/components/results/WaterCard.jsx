import { Droplets } from "lucide-react";
import { formatNumber } from "../../utils/format.js";

export function WaterCard({ stage }) {
  const available = stage?.water_available === true;

  return (
    <div className="impact-card water-card">
      <div className="impact-card-header">
        <Droplets size={15} />
        <span>Water</span>
      </div>

      {!available ? (
        <div className="impact-not-available">Not available</div>
      ) : (
        <>
          <div className="electricity-main">
            <span className="impact-big-value">
              {formatNumber(stage.water_demand_m3_hour)}
            </span>
            <span className="impact-unit">m³/hr</span>
          </div>
          <div className="impact-rows">
            {stage.water_demand_liters_hour !== undefined && (
              <div className="impact-row">
                <span>Demand</span>
                <span className="impact-value">
                  {formatNumber(stage.water_demand_liters_hour, 0)}{" "}
                  <span className="impact-unit">liters/hr</span>
                </span>
              </div>
            )}
            {stage.model && (
              <div className="impact-row">
                <span>Model</span>
                <span className="impact-value">{stage.model}</span>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
