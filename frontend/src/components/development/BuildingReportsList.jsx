import {
  FileText,
  Calendar,
  ArrowRight,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { useApp } from "../../store/AppContext.jsx";
import { formatNumber } from "../../utils/format.js";
import { isReportCurrentForDevelopment } from "../../services/reportService.js";

function formatDate(dateStr) {
  if (!dateStr) return "--";
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

export function BuildingReportsList({ reports, onBack, devName, currentDev }) {
  const { dispatch } = useApp();

  function handleOpenReport(report) {
    dispatch({ type: "OPEN_FULL_REPORT", report });
  }

  return (
    <div className="building-reports-history">
      <div className="reports-history-header">
        <button
          className="btn text-btn small"
          onClick={onBack}
          type="button"
          style={{ paddingLeft: 0 }}
        >
          ← Back to Building Details
        </button>
        <div className="reports-history-title">
          <FileText size={15} />
          <span>What-If Simulation History</span>
        </div>
        <div className="reports-history-subtitle">
          {devName || "Building"} · {reports.length} completed {reports.length === 1 ? "report" : "reports"}
        </div>
      </div>

      {reports.length === 0 ? (
        <div className="empty-reports-box">
          <FileText size={28} />
          <p>No completed What-If simulations for this building yet.</p>
          <button
            className="btn primary small"
            onClick={onBack}
            type="button"
          >
            <span>Run New What-If Simulation</span>
          </button>
        </div>
      ) : (
        <div className="reports-history-cards">
          {reports.map((report) => {
            const isCurrent = isReportCurrentForDevelopment(report, currentDev);
            const st4 = report.result?.stage4_impact_assessment || {};
            const impact = (st4.overall_impact_level || st4.development_impact || "HEALTHY").toUpperCase();
            const network = (st4.network_condition || "OPTIMAL").toUpperCase();
            const trips = st4.total_development_trips ?? 0;
            const worsened = st4.roads_worsened_count ?? 0;
            const baselineVc = st4.baseline_average_vc;
            const scenarioVc = st4.average_scenario_vc;

            return (
              <div key={report.id} className="report-history-card">
                <div className="rh-card-top">
                  <div className="rh-card-title-group">
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <span className="rh-card-name">{report.scenarioName || "What-If Simulation"}</span>
                      <span
                        className={`badge-pill ${isCurrent ? "green" : "orange"}`}
                        style={{ fontSize: "8.5px", padding: "1px 5px" }}
                      >
                        {isCurrent ? "CURRENT" : "OUTDATED"}
                      </span>
                    </div>
                    <div className="rh-card-meta">
                      <span className="badge dev-type">
                        {report.developmentType?.replace(/_/g, " ")}
                      </span>
                      <span className="badge">Zone {report.zoneId}</span>
                      <span className="badge">Hour {report.hour}:00</span>
                    </div>
                  </div>
                  <span className="rh-card-date">
                    <Calendar size={11} /> {formatDate(report.createdAt)}
                  </span>
                </div>

                <div className="rh-tags-row">
                  <span className={`rh-impact-badge ${impact.toLowerCase()}`}>
                    {impact === "CRITICAL" || impact === "HIGH" ? (
                      <AlertTriangle size={11} />
                    ) : (
                      <CheckCircle2 size={11} />
                    )}
                    Impact: {impact}
                  </span>
                  <span className="rh-network-badge">
                    Network: {network}
                  </span>
                </div>

                <div className="rh-metrics-grid">
                  <div className="rh-metric">
                    <span className="rh-m-label">Development Trips</span>
                    <span className="rh-m-val">{formatNumber(trips, 1)} veh/h</span>
                  </div>
                  <div className="rh-metric">
                    <span className="rh-m-label">Average V/C</span>
                    <span className="rh-m-val font-mono">
                      {formatNumber(baselineVc, 2)} → {formatNumber(scenarioVc, 2)}
                    </span>
                  </div>
                  <div className="rh-metric">
                    <span className="rh-m-label">Roads Worsened</span>
                    <span className={`rh-m-val ${worsened > 0 ? "highlight-orange" : ""}`}>
                      {worsened} corridors
                    </span>
                  </div>
                </div>

                <div className="rh-card-footer">
                  <button
                    className="btn primary small full"
                    onClick={() => handleOpenReport(report)}
                    type="button"
                  >
                    <FileText size={13} />
                    <span>VIEW FULL REPORT</span>
                    <ArrowRight size={13} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
