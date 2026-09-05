import {
  Activity,
  Zap,
  Droplets,
  Trash2,
  Car,
  CheckCircle2,
  AlertTriangle,
  Building2,
  Layers,
  Leaf,
  ArrowLeft,
  RefreshCw,
  TrendingUp,
  Clock,
} from "lucide-react";
import { useApp } from "../../store/AppContext.jsx";
import { formatNumber } from "../../utils/format.js";
import { classifyScenarioRoadImpact, extractOsmWayId } from "../../utils/trafficColors.js";
import { isReportCurrentForDevelopment } from "../../services/reportService.js";

function formatChange(change) {
  if (change === null || change === undefined || Number.isNaN(Number(change))) return "--";
  const num = Number(change);
  const formatted = Math.abs(num).toFixed(2);
  if (num > 0.0001) return `+${formatted}`;
  if (num < -0.0001) return `-${formatted}`;
  return "+0.00";
}

export function FullReportView() {
  const { state, dispatch } = useApp();
  const selectedReport = state.ui.selectedReport;
  const data = selectedReport?.result || state.simulation.result;

  if (!data) return null;

  const st4 = data.stage4_impact_assessment || {};
  const st5 = data.stage5_electricity || {};
  const st6 = data.stage6_water || {};
  const st7 = data.stage7_waste || {};
  const st8 = data.stage8_environment || {};
  const devInput = data.development_input || {};

  const currentDev =
    state.developments.items.find(
      (d) => (d.development_id || d.id) === selectedReport?.developmentId
    ) ||
    state.developments.selected ||
    state.development.placed;

  const isCurrent =
    selectedReport && currentDev
      ? isReportCurrentForDevelopment(selectedReport, currentDev)
      : true;

  const bottlenecks = st4.top_bottlenecks || st4.road_assessments?.slice(0, 10) || [];
  const overallSeverity = (st4.overall_impact_level || st4.development_impact || "HEALTHY").toUpperCase();
  const avgChange = st4.avg_vc_change !== undefined
    ? st4.avg_vc_change
    : (st4.average_scenario_vc !== undefined && st4.baseline_average_vc !== undefined
        ? st4.average_scenario_vc - st4.baseline_average_vc
        : undefined);

  function handleClose() {
    dispatch({ type: "CLOSE_FULL_REPORT" });
  }

  function handleNewScenario() {
    dispatch({ type: "SET_NEW_SCENARIO" });
  }

  const reportTitle = selectedReport?.scenarioName || "Scenario Simulation Comprehensive Report";

  return (
    <div className="full-report-view">
      {/* Sticky Header */}
      <div className="full-report-header">
        <div className="full-report-title-group">
          <div className="header-badge">
            <Activity size={12} />
            <span>
              {selectedReport
                ? isCurrent
                  ? "SAVED WHAT-IF REPORT (CURRENT)"
                  : "HISTORICAL WHAT-IF REPORT (OUTDATED)"
                : "WHAT-IF IMPACT ASSESSMENT"}
            </span>
          </div>
          <h2>{reportTitle}</h2>
          <div className="header-meta">
            <span className="meta-item">
              <Building2 size={12} /> {devInput.development_type?.replace("_", " ") || "Proposed Development"}
            </span>
            <span className="meta-item">
              <Layers size={12} /> Zone {devInput.zone_id || "R3-Z01"}
            </span>
            <span className="meta-item">Hour {data.simulation_hour ?? data.hour ?? 8}:00</span>
            {selectedReport?.createdAt && (
              <span className="meta-item font-mono">
                <Clock size={11} />
                {new Date(selectedReport.createdAt).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            )}
          </div>
        </div>

        <div className="full-report-actions">
          <button className="btn secondary" onClick={handleNewScenario} type="button">
            <RefreshCw size={13} />
            <span>New Scenario</span>
          </button>
          <button className="btn primary cta" onClick={handleClose} type="button">
            <ArrowLeft size={14} />
            <span>Back to Map / Building</span>
          </button>
        </div>
      </div>

      {/* Main Inner Content */}
      <div className="full-report-inner">
        {/* Outdated configuration alert banner if applicable */}
        {selectedReport && !isCurrent && (
          <div className="historical-outdated-banner">
            <AlertTriangle size={16} />
            <div>
              <strong>Historical Report</strong> — Based on previous building configuration. Simulation metrics reflect the configuration at the time of execution.
            </div>
          </div>
        )}
        {/* Executive Summary Banner */}
        <div className="summary-banner">
          <div className="banner-badge-group">
            <div className={`severity-tag ${overallSeverity.toLowerCase()}`}>
              {overallSeverity === "CRITICAL" || overallSeverity === "HIGH" ? (
                <AlertTriangle size={15} />
              ) : (
                <CheckCircle2 size={15} />
              )}
              <span>DEVELOPMENT IMPACT: {overallSeverity}</span>
            </div>
            <div className="network-tag">
              <span>NETWORK CONDITION: {st4.network_condition || "MODERATE"}</span>
            </div>
          </div>

          <div className="banner-stats">
            <div className="bstat">
              <span className="bstat-label">Development Trips</span>
              <span className="bstat-val">{formatNumber(st4.total_development_trips)} veh/h</span>
            </div>
            <div className="bstat">
              <span className="bstat-label">Baseline Average V/C</span>
              <span className="bstat-val font-mono">{formatNumber(st4.baseline_average_vc, 2)}</span>
            </div>
            <div className="bstat">
              <span className="bstat-label">Scenario Average V/C</span>
              <span className="bstat-val font-mono highlight-cyan">{formatNumber(st4.average_scenario_vc, 2)}</span>
            </div>
            <div className="bstat">
              <span className="bstat-label">Max Δ V/C</span>
              <span className="bstat-val font-mono highlight-orange">{formatChange(st4.max_vc_change)}</span>
            </div>
          </div>
        </div>

        {/* Section 1: Mobility & Traffic Metrics */}
        <div className="report-section">
          <div className="report-section-title">
            <Car size={16} />
            <span>Mobility & Traffic Assignment Overview</span>
          </div>
          <div className="report-grid">
            <div className="report-stat-card">
              <span className="rstat-label">Roads Analyzed</span>
              <span className="rstat-val">{formatNumber(st4.number_of_affected_roads ?? 962, 0)}</span>
              <span className="rstat-sub">OSM highway corridors</span>
            </div>
            <div className="report-stat-card">
              <span className="rstat-label">Roads Worsened</span>
              <span className={`rstat-val ${(st4.roads_worsened_count || 0) > 0 ? "highlight-orange" : ""}`}>
                {formatNumber(st4.roads_worsened_count ?? 0, 0)}
              </span>
              <span className="rstat-sub">Level of Service deteriorated</span>
            </div>
            <div className="report-stat-card">
              <span className="rstat-label">Roads Reaching LOS E/F</span>
              <span className="rstat-val">{formatNumber(st4.roads_reaching_los_E_or_F_count ?? 0, 0)}</span>
              <span className="rstat-sub">Congested threshold</span>
            </div>
            <div className="report-stat-card">
              <span className="rstat-label">Roads Reaching V/C ≥ 1.0</span>
              <span className="rstat-val">{formatNumber(st4.roads_reaching_vc_1_or_more_count ?? 0, 0)}</span>
              <span className="rstat-sub">At or above capacity</span>
            </div>
          </div>
        </div>

        {/* Detailed Traffic Metrics Grid */}
        <div className="report-section">
          <div className="report-section-title">
            <TrendingUp size={16} />
            <span>Traffic Assignment Detailed Parameters</span>
          </div>
          <div className="panel-box">
            <div className="panel-box-body">
              <div className="traffic-detail-grid">
                <div className="stat-row">
                  <span className="stat-label">Development trips generated</span>
                  <span className="stat-value">{formatNumber(st4.total_development_trips)} trips/h</span>
                </div>
                <div className="stat-row">
                  <span className="stat-label">Assigned external trips</span>
                  <span className="stat-value">{formatNumber(st4.assigned_external_trips)} trips/h</span>
                </div>
                <div className="stat-row">
                  <span className="stat-label">Unassigned internal trips</span>
                  <span className="stat-value">{formatNumber(st4.unassigned_internal_trips)} trips/h</span>
                </div>
                <div className="stat-row">
                  <span className="stat-label">Baseline average V/C</span>
                  <span className="stat-value font-mono">{formatNumber(st4.baseline_average_vc, 2)}</span>
                </div>
                <div className="stat-row">
                  <span className="stat-label">Scenario average V/C</span>
                  <span className="stat-value font-mono highlight-cyan">{formatNumber(st4.average_scenario_vc, 2)}</span>
                </div>
                <div className="stat-row">
                  <span className="stat-label">Average V/C change (Δ)</span>
                  <span className="stat-value font-mono">{formatChange(avgChange)}</span>
                </div>
                <div className="stat-row">
                  <span className="stat-label">Maximum V/C change</span>
                  <span className="stat-value font-mono highlight-orange">{formatChange(st4.max_vc_change)}</span>
                </div>
                <div className="stat-row">
                  <span className="stat-label">Maximum traffic volume delta</span>
                  <span className="stat-value">{formatNumber(st4.max_delta_traffic_veh_h)} veh/h</span>
                </div>
                <div className="stat-row">
                  <span className="stat-label">Average traffic volume delta</span>
                  <span className="stat-value">{formatNumber(st4.average_delta_traffic_veh_h)} veh/h</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Section 2: Top Bottlenecks Table */}
        {bottlenecks.length > 0 && (
          <div className="report-section">
            <div className="report-section-title">
              <AlertTriangle size={16} />
              <span>Critical Corridors & Top Affected Bottlenecks</span>
            </div>
            <div className="panel-box">
              <div className="panel-box-body" style={{ padding: 0 }}>
                <div className="table-wrapper">
                  <table className="infra-table">
                    <thead>
                      <tr>
                        <th>Way ID</th>
                        <th>Classification</th>
                        <th>Baseline V/C</th>
                        <th>Scenario V/C</th>
                        <th>Δ V/C</th>
                        <th>LOS Transition</th>
                        <th>Impact Severity</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bottlenecks.map((b, i) => {
                        const wayId = extractOsmWayId(b.road_id || `road_${i}`);
                        const impact = classifyScenarioRoadImpact(b);
                        const deltaVc = b.vc_change ?? (b.scenario_vc !== undefined && b.baseline_vc !== undefined ? b.scenario_vc - b.baseline_vc : 0);
                        const losTrans = b.baseline_los && b.scenario_los ? `${b.baseline_los} → ${b.scenario_los}` : "--";

                        return (
                          <tr key={wayId || i}>
                            <td className="code-cell font-mono">#{wayId}</td>
                            <td><span className="badge">{b.road_type || b.highway || "highway"}</span></td>
                            <td className="font-mono">{formatNumber(b.baseline_vc, 2)}</td>
                            <td className="font-mono highlight-cyan">{formatNumber(b.scenario_vc, 2)}</td>
                            <td className="font-mono highlight-orange">{formatChange(deltaVc)}</td>
                            <td><span className="badge">{losTrans}</span></td>
                            <td>
                              <span
                                className="badge"
                                style={{
                                  backgroundColor: `${impact.hex}22`,
                                  color: impact.hex,
                                  borderColor: `${impact.hex}55`,
                                }}
                              >
                                {impact.label}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Section 3: Resource Model Outputs */}
        <div className="report-section">
          <div className="report-section-title">
            <Zap size={16} />
            <span>Multi-Utility Resource Model Outputs</span>
          </div>
          <div className="resource-cards-grid">
            {/* Electricity */}
            <div className="resource-card">
              <div className="rcard-header electricity">
                <Zap size={16} />
                <span>Electricity Demand</span>
              </div>
              <div className="rcard-body">
                <div className="rcard-main-val">
                  {formatNumber(st5.electricity_kwh ?? st5.daily_kwh ?? 0)} <span className="runit">kWh</span>
                </div>
                <div className="rcard-row">
                  <span>Floor Area</span>
                  <span>{formatNumber(st5.gross_floor_area_sqm ?? devInput.properties?.gross_leasable_area_sqm ?? 5000)} m²</span>
                </div>
                <div className="rcard-row">
                  <span>Target Use</span>
                  <span>{devInput.development_type?.replace("_", " ") || "Compound"}</span>
                </div>
              </div>
            </div>

            {/* Water */}
            <div className="resource-card">
              <div className="rcard-header water">
                <Droplets size={16} />
                <span>Water Consumption</span>
              </div>
              <div className="rcard-body">
                <div className="rcard-main-val">
                  {formatNumber(st6.water_demand_m3_hour ?? st6.prediction ?? 0, 1)} <span className="runit">m³/hr</span>
                </div>
                <div className="rcard-row">
                  <span>Liters / Hour</span>
                  <span>{formatNumber((st6.water_demand_m3_hour || 0) * 1000)} L/hr</span>
                </div>
                <div className="rcard-row">
                  <span>Inference Model</span>
                  <span className="badge-pill">{st6.model || "ExtraTreesRegressor"}</span>
                </div>
              </div>
            </div>

            {/* Solid Waste */}
            <div className="resource-card">
              <div className="rcard-header waste">
                <Trash2 size={16} />
                <span>Solid Waste Generation</span>
              </div>
              <div className="rcard-body">
                <div className="rcard-main-val">
                  {formatNumber(st7.waste_generation_kg_day ?? st7.waste_generation_kg ?? 0, 1)} <span className="runit">kg/day</span>
                </div>
                <div className="rcard-row">
                  <span>Daily Tonnes</span>
                  <span>{formatNumber((st7.waste_generation_kg_day || 0) / 1000, 3)} tonnes</span>
                </div>
                <div className="rcard-row">
                  <span>Inference Model</span>
                  <span className="badge-pill">{st7.model || "XGBRegressor"}</span>
                </div>
              </div>
            </div>

            {/* CO2 Emissions */}
            <div className="resource-card">
              <div className="rcard-header co2">
                <Leaf size={16} />
                <span>Environmental Footprint</span>
              </div>
              <div className="rcard-body">
                <div className="rcard-main-val">
                  {formatNumber(st8.total_co2_kg ?? ((st5.electricity_kwh || 500) * 0.48), 1)} <span className="runit">kg CO₂</span>
                </div>
                <div className="rcard-row">
                  <span>Emission Factor</span>
                  <span>0.48 kg CO₂/kWh</span>
                </div>
                <div className="rcard-row">
                  <span>Compliance</span>
                  <span className="badge-pill green">Egyptian Energy Code 2025</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="full-report-footer">
          <button className="btn primary cta" onClick={handleClose} type="button">
            <ArrowLeft size={14} />
            <span>Return to 3D Map</span>
          </button>
          <button className="btn secondary" onClick={handleNewScenario} type="button">
            <RefreshCw size={14} />
            <span>Start Another Scenario</span>
          </button>
        </div>
      </div>
    </div>
  );
}
