import { Zap } from "lucide-react";
import { formatNumber } from "../../utils/format.js";

export function ElectricityCard({ stage }) {
  const available = stage?.electricity_available === true;

  return (
    <div className="impact-card electricity-card">
      <div className="impact-card-header">
        <Zap size={15} />
        <span>Electricity</span>
      </div>

      {!available ? (
        <div className="impact-not-available">
          {stage?.reason ? "Not available" : "Not available"}
        </div>
      ) : (
        <>
          <div className="electricity-main">
            <span className="impact-big-value">{formatNumber(stage.electricity_kwh)}</span>
            <span className="impact-unit">kWh</span>
          </div>
          <div className="impact-rows">
            {stage.building_type && (
              <div className="impact-row">
                <span>Building type</span>
                <span className="impact-value">{stage.building_type}</span>
              </div>
            )}
            {stage.floor_area_sqm !== undefined && (
              <div className="impact-row">
                <span>Floor area</span>
                <span className="impact-value">
                  {formatNumber(stage.floor_area_sqm, 0)} <span className="impact-unit">m²</span>
                </span>
              </div>
            )}
            {stage.total_floor_area_sqm !== undefined && (
              <div className="impact-row">
                <span>Total floor area</span>
                <span className="impact-value">
                  {formatNumber(stage.total_floor_area_sqm, 0)} <span className="impact-unit">m²</span>
                </span>
              </div>
            )}
            {stage.calibration && (
              <div className="impact-row">
                <span>Calibration</span>
                <span className="impact-value">{stage.calibration}</span>
              </div>
            )}
            {stage.city && (
              <div className="impact-row">
                <span>City</span>
                <span className="impact-value">{stage.city}</span>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
