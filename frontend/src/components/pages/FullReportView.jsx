import { useState } from "react";
import {
  Activity,
  Zap,
  Droplets,
  Trash2,
  Car,
  CheckCircle2,
  AlertTriangle,
  Info,
  ChevronDown,
  ChevronUp,
  Layers,
  Leaf,
  ArrowLeft,
  RefreshCw,
  Clock,
  Gauge,
  SlidersHorizontal,
} from "lucide-react";
import { useApp } from "../../store/AppContext.jsx";
import { formatNumber } from "../../utils/format.js";
import { classifyScenarioRoadImpact, extractOsmWayId, getScenarioAssessmentSeverityRank } from "../../utils/trafficColors.js";
import { isReportCurrentForDevelopment } from "../../services/reportService.js";
import {
  generateExecutiveExplanation,
  generateWhatThisMeansStatements,
  getNetworkWideChangeLabel,
  getLocalizedImpactLabel,
} from "../../utils/reportInterpretation.js";

function formatChange(change) {
  if (change === null || change === undefined || Number.isNaN(Number(change))) return "--";
  const num = Number(change);
  const formatted = Math.abs(num).toFixed(2);
  if (num > 0.0001) return `+${formatted}`;
  if (num < -0.0001) return `-${formatted}`;
  return "+0.00";
}

function formatDevType(type) {
  if (!type) return "Proposed Development";
  return type
    .replace(/_/g, " ")
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

export function FullReportView() {
  const { state, dispatch } = useApp();
  const [techDetailsOpen, setTechDetailsOpen] = useState(false);

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

  const rawBottlenecks = (st4.top_bottlenecks && st4.top_bottlenecks.length > 0)
    ? st4.top_bottlenecks
    : (st4.road_assessments || []);

  const bottlenecks = [...rawBottlenecks]
    .sort((a, b) => {
      if (b.bottleneck_score !== undefined && a.bottleneck_score !== undefined) {
        return Number(b.bottleneck_score) - Number(a.bottleneck_score);
      }
      const rankB = getScenarioAssessmentSeverityRank(b);
      const rankA = getScenarioAssessmentSeverityRank(a);
      if (rankB !== rankA) return rankB - rankA;
      const deltaB = Number(b.vc_change ?? (b.scenario_vc !== undefined && b.baseline_vc !== undefined ? b.scenario_vc - b.baseline_vc : 0));
      const deltaA = Number(a.vc_change ?? (a.scenario_vc !== undefined && a.baseline_vc !== undefined ? a.scenario_vc - a.baseline_vc : 0));
      if (deltaB !== deltaA) return deltaB - deltaA;
      return Number(b.scenario_vc ?? 0) - Number(a.scenario_vc ?? 0);
    })
    .slice(0, 15);
  const devImpact = (st4.development_impact || st4.overall_impact_level || "HEALTHY").toUpperCase();
  const netCondition = (st4.network_condition || "GOOD").toUpperCase();
  const criticalRoadsCount = Number(st4.roads_reaching_vc_1_or_more_count ?? 0);

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

  const devDisplayName =
    devInput.name ||
    selectedReport?.scenarioName ||
    currentDev?.name ||
    "Proposed Development";

  const devTypeTitle = formatDevType(devInput.development_type || currentDev?.development_type || currentDev?.type);
  const zoneId = devInput.zone_id || currentDev?.zone_id || "Z0089";
  const hour = data.simulation_hour ?? data.hour ?? 8;
  const createdDate = selectedReport?.createdAt ? new Date(selectedReport.createdAt) : new Date();

  const executiveExplanation = generateExecutiveExplanation(st4);
  const whatThisMeansStatements = generateWhatThisMeansStatements(st4);
  const networkWideLabel = getNetworkWideChangeLabel(st4);
  const localizedImpactLabel = getLocalizedImpactLabel(st4);

  return (
    <div className="full-report-view">
      {/* ========================================================
          SIMPLIFIED STICKY HEADER
          ======================================================== */}
      <div className="full-report-header">
        <div className="full-report-title-group">
          <div className="header-badge">
            <Activity size={12} />
            <span>
              {selectedReport
                ? isCurrent
                  ? "SAVED WHAT-IF REPORT"
                  : "HISTORICAL WHAT-IF REPORT (OUTDATED)"
                : "WHAT-IF IMPACT ASSESSMENT"}
            </span>
          </div>

          <h2 className="report-main-title">{devDisplayName}</h2>

          <div className="report-subtitle-meta">
            <span className="meta-highlight">
              {devTypeTitle} · Zone {zoneId}
            </span>
            <span className="meta-dot">·</span>
            <span className="meta-time">
              Hour {String(hour).padStart(2, "0")}:00 ·{" "}
              {createdDate.toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}{" "}
              ·{" "}
              {createdDate.toLocaleTimeString("en-US", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
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

      {/* ========================================================
          MAIN REPORT BODY
          ======================================================== */}
      <div className="full-report-inner">
        {/* Outdated configuration alert banner if applicable */}
        {selectedReport && !isCurrent && (
          <div className="historical-outdated-banner">
            <AlertTriangle size={16} />
            <div>
              <strong>Historical Report</strong> — Based on a previous building configuration. Simulation metrics reflect the configuration at the time of execution.
            </div>
          </div>
        )}

        {/* ----------------------------------------------------
            SECTION 1 — EXECUTIVE RESULT
            ---------------------------------------------------- */}
        <div className="executive-card">
          <div className="executive-badges-row">
            <div className={`exec-badge impact-${devImpact.toLowerCase()}`}>
              <span className="exec-badge-title">DEVELOPMENT IMPACT</span>
              <span className="exec-badge-val">{devImpact}</span>
            </div>
            <div className={`exec-badge network-${netCondition.toLowerCase()}`}>
              <span className="exec-badge-title">NETWORK CONDITION</span>
              <span className="exec-badge-val">{netCondition}</span>
            </div>
          </div>

          <p className="executive-explanation">
            {executiveExplanation}
          </p>

          <div className="executive-metrics-grid">
            <div className="exec-metric">
              <span className="exec-metric-label">New Traffic</span>
              <span className="exec-metric-val">{formatNumber(st4.total_development_trips)} <span className="exec-unit">veh/h</span></span>
            </div>
            <div className="exec-metric">
              <span className="exec-metric-label">Network Utilization</span>
              <span className="exec-metric-val font-mono">{formatNumber(st4.average_scenario_vc ?? st4.baseline_average_vc, 2)} <span className="exec-unit">V/C</span></span>
            </div>
            <div className="exec-metric">
              <span className="exec-metric-label">Maximum Impact</span>
              <span className="exec-metric-val font-mono highlight-orange">{formatChange(st4.max_vc_change)} <span className="exec-unit">V/C</span></span>
            </div>
            <div className="exec-metric">
              <span className="exec-metric-label">Critical Roads</span>
              <span className={`exec-metric-val font-mono ${criticalRoadsCount > 0 ? "highlight-red" : ""}`}>
                {formatNumber(criticalRoadsCount, 0)}
              </span>
            </div>
          </div>
        </div>

        {/* ----------------------------------------------------
            SECTION 2 — WHAT DOES THIS MEAN?
            ---------------------------------------------------- */}
        <div className="report-card what-means-card">
          <div className="card-header-simple">
            <Info size={16} className="card-icon-blue" />
            <h3>What This Means</h3>
          </div>
          <div className="what-means-list">
            {whatThisMeansStatements.map((stmt, idx) => (
              <div key={idx} className={`what-means-item ${stmt.type}`}>
                <span className="what-means-bullet">
                  {stmt.type === "critical" || stmt.type === "warning" ? (
                    <AlertTriangle size={15} />
                  ) : stmt.type === "neutral" ? (
                    <Info size={15} />
                  ) : (
                    <CheckCircle2 size={15} />
                  )}
                </span>
                <span className="what-means-text">{stmt.text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ----------------------------------------------------
            SECTION 3 — WHERE IS THE IMPACT? (Most Affected Roads)
            ---------------------------------------------------- */}
        {bottlenecks.length > 0 && (
          <div className="report-card">
            <div className="card-header-with-desc">
              <div className="card-title-row">
                <AlertTriangle size={16} className="card-icon-orange" />
                <h3>Most Affected Roads</h3>
              </div>
              <p className="card-subtitle-desc">
                These are the road segments experiencing the largest traffic impact from the development.
              </p>
            </div>

            <div className="table-wrapper">
              <table className="infra-table decision-table">
                <thead>
                  <tr>
                    <th>Road</th>
                    <th>Road Type</th>
                    <th>Baseline V/C</th>
                    <th>Scenario V/C</th>
                    <th>Change</th>
                    <th>LOS Change</th>
                    <th>Impact</th>
                  </tr>
                </thead>
                <tbody>
                  {bottlenecks.map((b, i) => {
                    const wayId = extractOsmWayId(b.road_id || `road_${i}`);
                    const impact = classifyScenarioRoadImpact(b);
                    const deltaVc = b.vc_change ?? (b.scenario_vc !== undefined && b.baseline_vc !== undefined ? b.scenario_vc - b.baseline_vc : 0);
                    const losTrans = b.baseline_los && b.scenario_los ? `${b.baseline_los} → ${b.scenario_los}` : "--";

                    const isCritical = impact.severity === "critical" || (b.scenario_vc >= 1.0);
                    const isWorsened = impact.severity === "worsened" || (deltaVc >= 0.05);

                    return (
                      <tr key={wayId || i} className={isCritical ? "row-critical" : isWorsened ? "row-worsened" : ""}>
                        <td className="code-cell font-mono">Way #{wayId}</td>
                        <td><span className="badge road-type-badge">{b.road_type || b.highway || "Road"}</span></td>
                        <td className="font-mono">{formatNumber(b.baseline_vc, 2)}</td>
                        <td className="font-mono highlight-cyan">{formatNumber(b.scenario_vc, 2)}</td>
                        <td className="font-mono highlight-orange">{formatChange(deltaVc)}</td>
                        <td><span className="badge los-badge">{losTrans}</span></td>
                        <td>
                          <span
                            className="badge impact-pill"
                            style={{
                              backgroundColor: `${impact.hex}18`,
                              color: impact.hex,
                              borderColor: `${impact.hex}44`,
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
        )}

        {/* ----------------------------------------------------
            SECTION 4 — TRAFFIC IMPACT
            ---------------------------------------------------- */}
        <div className="report-card">
          <div className="card-header-with-tags">
            <div className="card-title-row">
              <Car size={16} className="card-icon-blue" />
              <h3>Traffic Impact</h3>
            </div>
            <div className="impact-conclusion-tags">
              <span className="conclusion-tag network-wide">
                Network-wide: <strong>{networkWideLabel}</strong>
              </span>
              <span className={`conclusion-tag localized ${localizedImpactLabel.includes("SIGNIFICANT") ? "significant" : ""}`}>
                Localized: <strong>{localizedImpactLabel}</strong>
              </span>
            </div>
          </div>

          <div className="traffic-impact-groups-grid">
            {/* GROUP A: Traffic Added */}
            <div className="traffic-impact-group">
              <h4 className="tgroup-title">Traffic Added</h4>
              <div className="tgroup-rows">
                <div className="tgroup-row">
                  <span className="trow-label">Development Trips</span>
                  <span className="trow-val font-mono">{formatNumber(st4.total_development_trips)} veh/h</span>
                </div>
                <div className="tgroup-row">
                  <span className="trow-label">Assigned External Trips</span>
                  <span className="trow-val font-mono">{formatNumber(st4.assigned_external_trips, 1)} veh/h</span>
                </div>
                <div className="tgroup-row">
                  <span className="trow-label">Unassigned Internal Trips</span>
                  <span className="trow-val font-mono">{formatNumber(st4.unassigned_internal_trips, 1)} veh/h</span>
                </div>
              </div>
            </div>

            {/* GROUP B: Network Utilization */}
            <div className="traffic-impact-group">
              <h4 className="tgroup-title">Network Utilization</h4>
              <div className="tgroup-rows">
                <div className="tgroup-row">
                  <span className="trow-label">Baseline Average V/C</span>
                  <span className="trow-val font-mono">{formatNumber(st4.baseline_average_vc, 2)}</span>
                </div>
                <div className="tgroup-row">
                  <span className="trow-label">Scenario Average V/C</span>
                  <span className="trow-val font-mono highlight-cyan">{formatNumber(st4.average_scenario_vc, 2)}</span>
                </div>
                <div className="tgroup-row">
                  <span className="trow-label">Average Change</span>
                  <span className="trow-val font-mono">{formatChange(avgChange)}</span>
                </div>
              </div>
            </div>

            {/* GROUP C: Worst-Case Impact */}
            <div className="traffic-impact-group">
              <h4 className="tgroup-title">Worst-Case Impact</h4>
              <div className="tgroup-rows">
                <div className="tgroup-row">
                  <span className="trow-label">Maximum V/C Change</span>
                  <span className="trow-val font-mono highlight-orange">{formatChange(st4.max_vc_change)}</span>
                </div>
                <div className="tgroup-row">
                  <span className="trow-label">Maximum Traffic Volume Delta</span>
                  <span className="trow-val font-mono">{formatNumber(st4.max_delta_traffic_veh_h, 1)} veh/h</span>
                </div>
                <div className="tgroup-row">
                  <span className="trow-label">Average Traffic Volume Delta</span>
                  <span className="trow-val font-mono">{formatNumber(st4.average_delta_traffic_veh_h, 1)} veh/h</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ----------------------------------------------------
            SECTION 5 — NETWORK STATUS
            ---------------------------------------------------- */}
        <div className="report-card">
          <div className="card-header-simple">
            <Gauge size={16} className="card-icon-blue" />
            <h3>Network Status</h3>
          </div>

          <div className="network-status-bar">
            <div className="nstatus-block">
              <span className="nstatus-num font-mono">{formatNumber(st4.number_of_affected_roads ?? 962, 0)}</span>
              <span className="nstatus-title">Roads Analyzed</span>
              <span className="nstatus-sub">Road segments evaluated</span>
            </div>
            <div className="nstatus-block">
              <span className={`nstatus-num font-mono ${(st4.roads_worsened_count || 0) > 0 ? "highlight-orange" : ""}`}>
                {formatNumber(st4.roads_worsened_count ?? 0, 0)}
              </span>
              <span className="nstatus-title">Roads Worsened</span>
              <span className="nstatus-sub">LOS deterioration</span>
            </div>
            <div className="nstatus-block">
              <span className={`nstatus-num font-mono ${(st4.roads_reaching_los_E_or_F_count || 0) > 0 ? "highlight-orange" : ""}`}>
                {formatNumber(st4.roads_reaching_los_E_or_F_count ?? 0, 0)}
              </span>
              <span className="nstatus-title">Roads Reaching LOS E/F</span>
              <span className="nstatus-sub">Severe congestion</span>
            </div>
            <div className="nstatus-block">
              <span className={`nstatus-num font-mono ${criticalRoadsCount > 0 ? "highlight-red" : ""}`}>
                {formatNumber(criticalRoadsCount, 0)}
              </span>
              <span className="nstatus-title">Roads ≥ V/C 1.0</span>
              <span className="nstatus-sub">At or above capacity</span>
            </div>
          </div>
        </div>

        {/* ----------------------------------------------------
            SECTION 6 — RESOURCE IMPACT
            ---------------------------------------------------- */}
        <div className="report-card">
          <div className="card-header-simple">
            <Zap size={16} className="card-icon-yellow" />
            <h3>Multi-Utility Resource Model Outputs</h3>
          </div>

          <div className="resource-compact-grid">
            {/* Electricity */}
            <div className="resource-compact-card">
              <div className="rc-header electricity">
                <Zap size={15} />
                <span>Electricity</span>
              </div>
              <div className="rc-body">
                <div className="rc-main-val font-mono">
                  {formatNumber(st5.electricity_kwh ?? st5.daily_kwh ?? 0, 1)} <span className="rc-unit">kWh</span>
                </div>
                <div className="rc-sub-desc">Estimated demand</div>
                <div className="rc-meta-row">
                  <span>Floor Area: {formatNumber(st5.gross_floor_area_sqm ?? devInput.properties?.gross_leasable_area_sqm ?? 5000)} m²</span>
                </div>
              </div>
            </div>

            {/* Water */}
            <div className="resource-compact-card">
              <div className="rc-header water">
                <Droplets size={15} />
                <span>Water</span>
              </div>
              <div className="rc-body">
                <div className="rc-main-val font-mono">
                  {formatNumber(st6.water_demand_m3_hour ?? st6.prediction ?? 0, 1)} <span className="rc-unit">m³/hr</span>
                </div>
                <div className="rc-sub-desc">Estimated consumption</div>
                <div className="rc-meta-row">
                  <span className="badge-pill">{st6.model || "ExtraTreesRegressor"}</span>
                </div>
              </div>
            </div>

            {/* Solid Waste */}
            <div className="resource-compact-card">
              <div className="rc-header waste">
                <Trash2 size={15} />
                <span>Solid Waste</span>
              </div>
              <div className="rc-body">
                <div className="rc-main-val font-mono">
                  {formatNumber(st7.waste_generation_kg_day ?? st7.waste_generation_kg ?? 0, 1)} <span className="rc-unit">kg/day</span>
                </div>
                <div className="rc-sub-desc">Estimated generation</div>
                <div className="rc-meta-row">
                  <span className="badge-pill">{st7.model || "XGBRegressor"}</span>
                </div>
              </div>
            </div>

            {/* CO2 Emissions */}
            <div className="resource-compact-card">
              <div className="rc-header co2">
                <Leaf size={15} />
                <span>Environmental</span>
              </div>
              <div className="rc-body">
                <div className="rc-main-val font-mono">
                  {formatNumber(st8.total_co2_kg ?? ((st5.electricity_kwh || 500) * 0.48), 1)} <span className="rc-unit">kg CO₂</span>
                </div>
                <div className="rc-sub-desc">Estimated emissions</div>
                <div className="rc-meta-row">
                  <span className="badge-pill green">Egyptian Energy Code 2025</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ----------------------------------------------------
            SECTION 7 — TECHNICAL DETAILS (COLLAPSIBLE)
            ---------------------------------------------------- */}
        <div className="collapsible-section">
          <button
            type="button"
            className="collapsible-toggle-btn"
            onClick={() => setTechDetailsOpen((prev) => !prev)}
            aria-expanded={techDetailsOpen}
          >
            <div className="collapsible-title-left">
              <SlidersHorizontal size={15} />
              <span>Technical Traffic Details</span>
            </div>
            <div className="collapsible-indicator">
              <span>{techDetailsOpen ? "Hide" : "Show"}</span>
              {techDetailsOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </div>
          </button>

          {techDetailsOpen && (
            <div className="collapsible-content">
              <div className="traffic-detail-grid">
                <div className="stat-row">
                  <span className="stat-label">Development trips generated</span>
                  <span className="stat-value font-mono">{formatNumber(st4.total_development_trips)} trips/h</span>
                </div>
                <div className="stat-row">
                  <span className="stat-label">Assigned external trips</span>
                  <span className="stat-value font-mono">{formatNumber(st4.assigned_external_trips)} trips/h</span>
                </div>
                <div className="stat-row">
                  <span className="stat-label">Unassigned internal trips</span>
                  <span className="stat-value font-mono">{formatNumber(st4.unassigned_internal_trips)} trips/h</span>
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
                  <span className="stat-value font-mono">{formatNumber(st4.max_delta_traffic_veh_h)} veh/h</span>
                </div>
                <div className="stat-row">
                  <span className="stat-label">Average traffic volume delta</span>
                  <span className="stat-value font-mono">{formatNumber(st4.average_delta_traffic_veh_h)} veh/h</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ========================================================
            FOOTER ACTIONS
            ======================================================== */}
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
