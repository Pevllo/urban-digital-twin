import { Trash2 } from "lucide-react";
import { formatNumber } from "../../utils/format.js";

export function WasteCard({ stage }) {
  const available = stage?.waste_available === true;

  return (
    <div className="impact-card waste-card">
      <div className="impact-card-header">
        <Trash2 size={15} />
        <span>Solid Waste</span>
      </div>

      {!available ? (
        <div className="impact-not-available">Not available</div>
      ) : (
        <>
          <div className="electricity-main">
            <span className="impact-big-value">
              {formatNumber(stage.waste_generation_kg_day)}
            </span>
            <span className="impact-unit">kg/day</span>
          </div>
          <div className="impact-rows">
            {stage.waste_generation_tonnes_day !== undefined && (
              <div className="impact-row">
                <span>Generation</span>
                <span className="impact-value">
                  {formatNumber(stage.waste_generation_tonnes_day, 3)}{" "}
                  <span className="impact-unit">tonnes/day</span>
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
