import { Car } from "lucide-react";
import { formatNumber } from "../../utils/format.js";
import { classifyScenarioRoadImpact, extractOsmWayId } from "../../utils/trafficColors.js";

function bottleneckKey(bottleneck) {
  return `${bottleneck.road_id || "road"}`;
}

function formatChange(change) {
  if (change === null || change === undefined || Number.isNaN(Number(change))) return "--";
  const num = Number(change);
  const formatted = Math.abs(num).toFixed(2);
  if (num > 0.0001) return `+${formatted}`;
  if (num < -0.0001) return `-${formatted}`;
  return "+0.00";
}

export function TrafficImpactCard({ stage1, stage3, stage4 }) {
  const trips = stage1?.total_trips ?? stage3?.total_development_trips ?? stage4?.total_development_trips;
  const devImpact = stage4?.development_impact || stage4?.overall_impact_level;
  const netCondition = stage4?.network_condition;
  const affectedRoads = stage4?.number_of_affected_roads;
  const worsened = stage4?.roads_worsened_count;
  const baselineVc = stage4?.baseline_average_vc;
  const scenarioVc = stage4?.average_scenario_vc;
  const avgVcChange = stage4?.avg_vc_change !== undefined
    ? stage4.avg_vc_change
    : (scenarioVc !== undefined && baselineVc !== undefined ? scenarioVc - baselineVc : undefined);
  const topBottlenecks = stage4?.top_bottlenecks || [];

  const canShowImpact =
    stage4 && Object.keys(stage4).length > 0 &&
    (stage4.number_of_affected_roads !== undefined || devImpact || netCondition);

  return (
    <div className="impact-card traffic-card">
      <div className="impact-card-header">
        <Car size={15} />
        <span>Traffic Impact</span>
      </div>

      {!canShowImpact ? (
        <div className="impact-not-available">Not available</div>
      ) : (
        <>
          {/* Dual Status Badges: Development Impact & Network Condition */}
          <div className="impact-dual-status">
            {devImpact && (
              <div className={`impact-badge-col level-${String(devImpact).toLowerCase()}`}>
                <span className="impact-badge-title">Development Impact</span>
                <span className="impact-badge-value">{devImpact}</span>
              </div>
            )}
            {netCondition && (
              <div className={`impact-badge-col level-${String(netCondition).toLowerCase()}`}>
                <span className="impact-badge-title">Network Condition</span>
                <span className="impact-badge-value">{netCondition}</span>
              </div>
            )}
          </div>

          <div className="traffic-rows">
            {trips !== undefined && (
              <div className="impact-row">
                <span>Development trips</span>
                <span className="impact-value">
                  {formatNumber(trips)} <span className="impact-unit">trips/h</span>
                </span>
              </div>
            )}
          </div>

          {(baselineVc !== undefined || scenarioVc !== undefined) && (
            <div className="vc-matrix-container">
              <div className="vc-matrix-title">Average V/C</div>
              <div className="vc-matrix-grid">
                {baselineVc !== undefined && (
                  <div className="vc-matrix-item">
                    <span className="vc-matrix-label">Baseline</span>
                    <span className="vc-matrix-val">{formatNumber(baselineVc, 2)}</span>
                  </div>
                )}
                {scenarioVc !== undefined && (
                  <div className="vc-matrix-item">
                    <span className="vc-matrix-label">Scenario</span>
                    <span className="vc-matrix-val">{formatNumber(scenarioVc, 2)}</span>
                  </div>
                )}
                {avgVcChange !== undefined && (
                  <div className="vc-matrix-item">
                    <span className="vc-matrix-label">Change</span>
                    <span className="vc-matrix-val">{formatChange(avgVcChange)}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {(affectedRoads !== undefined || worsened !== undefined) && (
            <div className="roads-matrix-grid">
              {affectedRoads !== undefined && (
                <div className="impact-row">
                  <span>Roads Analyzed</span>
                  <span className="impact-value">{formatNumber(affectedRoads, 0)}</span>
                </div>
              )}
              {worsened !== undefined && (
                <div className="impact-row">
                  <span>Roads Worsened</span>
                  <span className="impact-value">{formatNumber(worsened, 0)}</span>
                </div>
              )}
            </div>
          )}

          {topBottlenecks.length > 0 && (
            <div className="bottlenecks">
              <div className="bottlenecks-title">Top Affected Bottlenecks</div>
              <ul className="bottleneck-list">
                {topBottlenecks.slice(0, 5).map((b) => {
                  const wayId = extractOsmWayId(b.road_id);
                  const impact = classifyScenarioRoadImpact(b);
                  const deltaVc = b.vc_change ?? (b.scenario_vc !== undefined && b.baseline_vc !== undefined ? b.scenario_vc - b.baseline_vc : undefined);
                  const losTrans = b.baseline_los && b.scenario_los ? `${b.baseline_los} → ${b.scenario_los}` : null;

                  return (
                    <li key={bottleneckKey(b)} className="bottleneck-row">
                      <div className="bottleneck-road-info">
                        <span className="bottleneck-road">
                          {b.road_type || b.highway || "Road"} <span className="font-mono">#{wayId}</span>
                        </span>
                        {losTrans && (
                          <span className="bottleneck-los">LOS {losTrans}</span>
                        )}
                      </div>
                      <div className="bottleneck-stats">
                        <span className="bottleneck-vc font-mono">
                          V/C {formatNumber(b.scenario_vc, 2)}
                          {deltaVc !== undefined && (
                            <span className="bottleneck-delta"> ({formatChange(deltaVc)})</span>
                          )}
                        </span>
                        <span
                          className="badge bottleneck-badge"
                          style={{
                            backgroundColor: `${impact.hex}22`,
                            color: impact.hex,
                            borderColor: `${impact.hex}55`,
                          }}
                        >
                          {impact.label}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function TrafficDetail({ stage4, stage }) {
  const data = stage4 || stage;
  if (!data || Object.keys(data).length === 0) return null;
  const avgChange = data.avg_vc_change !== undefined
    ? data.avg_vc_change
    : (data.average_scenario_vc !== undefined && data.baseline_average_vc !== undefined
        ? data.average_scenario_vc - data.baseline_average_vc
        : undefined);

  const rows = [
    ["Development Impact", data.development_impact || data.overall_impact_level || "--"],
    ["Network Condition", data.network_condition || "--"],
    ["Development trips", `${formatNumber(data.total_development_trips)} trips/h`],
    ["Assigned external trips", formatNumber(data.assigned_external_trips)],
    ["Unassigned internal trips", formatNumber(data.unassigned_internal_trips)],
    ["Roads analyzed", formatNumber(data.number_of_affected_roads, 0)],
    ["Roads worsened", formatNumber(data.roads_worsened_count, 0)],
    ["Roads reaching LOS E/F", formatNumber(data.roads_reaching_los_E_or_F_count, 0)],
    ["Roads reaching V/C ≥ 1", formatNumber(data.roads_reaching_vc_1_or_more_count, 0)],
    ["Baseline avg V/C", formatNumber(data.baseline_average_vc, 2)],
    ["Scenario avg V/C", formatNumber(data.average_scenario_vc, 2)],
    ["Avg V/C change", formatChange(avgChange)],
    ["Max V/C change", formatChange(data.max_vc_change)],
    ["Max Δ traffic", formatNumber(data.max_delta_traffic_veh_h)],
    ["Avg Δ traffic", formatNumber(data.average_delta_traffic_veh_h)],
  ];
  return (
    <div className="traffic-detail">
      <h4 className="traffic-detail-title">Detailed Traffic Analysis</h4>
      <div className="detail-grid">
        {rows.map(([label, value]) => (
          <div key={label} className="detail-row">
            <span className="detail-label">{label}</span>
            <span className="detail-value">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
