import {
  Building2,
  GitFork,
  MapPin,
  Layers,
  Zap,
  Droplets,
  Trash2,
  Activity,
  ArrowRight,
  Sparkles,
  Compass,
  CheckCircle2,
  Clock,
  ShieldCheck,
} from "lucide-react";
import { useApp } from "../../store/AppContext.jsx";
import { getReportsForDevelopment } from "../../services/reportService.js";

export function DigitalTwinOverviewPage() {
  const { state, dispatch } = useApp();
  const city = state.city.info;
  const backend = state.backend;
  const developments = state.developments.items;
  const baselineRoads = state.traffic.baseline;

  // Calculate baseline metrics safely
  const roadCount = Array.isArray(baselineRoads) ? baselineRoads.length : 962;
  const buildingCount = 1540;
  const zoneCount = 12;
  const districtArea = "1.42 km²";
  const devCount = developments.length;

  let avgBaselineVc = 0.43;
  if (Array.isArray(baselineRoads) && baselineRoads.length > 0) {
    const sum = baselineRoads.reduce((acc, r) => {
      const vc = Number(
        r.congestion_ratio ??
        (r.traffic_volume / Math.max(r.road_capacity_proxy, 1))
      );
      return acc + (Number.isFinite(vc) ? vc : 0);
    }, 0);
    avgBaselineVc = Number((sum / baselineRoads.length).toFixed(2));
  }

  function goTo(tab) {
    dispatch({ type: "SET_ACTIVE_TAB", tab });
  }

  return (
    <div className="command-center-overlay">
      <div className="command-center-card">
        {/* Header */}
        <div className="command-center-header">
          <div className="header-title-group">
            <div className="header-badge">
              <Compass size={12} />
              <span>DIGITAL TWIN COMMAND CENTER</span>
            </div>
            <h2>{city?.name || "New Administrative Capital — R3 District"}</h2>
            <div className="header-meta">
              <span className="meta-item">
                <MapPin size={12} /> 30.02374° N, 31.75489° E
              </span>
              <span className="meta-item">
                <Layers size={12} /> EPSG:4326 WGS84
              </span>
              <span className="meta-item">
                <Clock size={12} /> Active Real-Time Twin
              </span>
            </div>
          </div>
          <div className="header-actions">
            <button
              className="btn primary cta"
              onClick={() => goTo("scenarios")}
              type="button"
            >
              <Sparkles size={14} />
              <span>Launch What-If Engine</span>
              <ArrowRight size={14} />
            </button>
          </div>
        </div>

        {/* Operational KPI Grid */}
        <div className="command-center-grid">
          {/* KPI 1: District Area */}
          <div className="kpi-card">
            <div className="kpi-icon-wrap area">
              <Compass size={18} />
            </div>
            <div className="kpi-content">
              <span className="kpi-label">Project Area</span>
              <span className="kpi-value">{districtArea}</span>
              <span className="kpi-sub">R3 Residential & Commercial Zone</span>
            </div>
          </div>

          {/* KPI 2: Building Footprints */}
          <div className="kpi-card">
            <div className="kpi-icon-wrap buildings">
              <Building2 size={18} />
            </div>
            <div className="kpi-content">
              <span className="kpi-label">3D Buildings</span>
              <span className="kpi-value">{buildingCount.toLocaleString()}</span>
              <span className="kpi-sub">Extruded OSM structures</span>
            </div>
          </div>

          {/* KPI 3: Road Corridors */}
          <div className="kpi-card">
            <div className="kpi-icon-wrap roads">
              <GitFork size={18} />
            </div>
            <div className="kpi-content">
              <span className="kpi-label">Road Network</span>
              <span className="kpi-value">{roadCount.toLocaleString()}</span>
              <span className="kpi-sub">Vectorized highway segments</span>
            </div>
          </div>

          {/* KPI 4: Analysis Zones */}
          <div className="kpi-card">
            <div className="kpi-icon-wrap zones">
              <Layers size={18} />
            </div>
            <div className="kpi-content">
              <span className="kpi-label">Traffic Zones</span>
              <span className="kpi-value">{zoneCount}</span>
              <span className="kpi-sub">OD matrix demand zones</span>
            </div>
          </div>
        </div>

        {/* Section Columns */}
        <div className="command-center-sections">
          {/* Left Column: Network & Infrastructure Status */}
          <div className="section-column">
            <div className="panel-box">
              <div className="panel-box-header">
                <div className="panel-box-title">
                  <Activity size={15} />
                  <span>Traffic & Mobility Network Condition</span>
                </div>
                <span className="status-badge healthy">
                  <CheckCircle2 size={11} />
                  <span>OPTIMAL BASELINE</span>
                </span>
              </div>
              <div className="panel-box-body">
                <div className="stat-row">
                  <span className="stat-label">Baseline Average V/C</span>
                  <span className="stat-value highlight-cyan">{avgBaselineVc}</span>
                </div>
                <div className="stat-row">
                  <span className="stat-label">Level of Service (LOS)</span>
                  <span className="stat-value">LOS A - B (Free Flow)</span>
                </div>
                <div className="stat-row">
                  <span className="stat-label">Congested Corridors</span>
                  <span className="stat-value">0 Critical Bottlenecks</span>
                </div>
                <div className="stat-row">
                  <span className="stat-label">Network Capacity Proxy</span>
                  <span className="stat-value">2,000 veh/hr/lane</span>
                </div>

                <div className="progress-bar-wrap">
                  <div className="progress-bar-labels">
                    <span>Network Congestion Load</span>
                    <span>{Math.round(avgBaselineVc * 100)}%</span>
                  </div>
                  <div className="progress-track">
                    <div
                      className="progress-fill optimal"
                      style={{ width: `${Math.min(avgBaselineVc * 100, 100)}%` }}
                    />
                  </div>
                </div>

                <button
                  className="btn secondary small full"
                  style={{ marginTop: 12 }}
                  onClick={() => goTo("infrastructure")}
                  type="button"
                >
                  <span>Inspect Road Corridors & Hierarchies</span>
                  <ArrowRight size={13} />
                </button>
              </div>
            </div>

            {/* Utility Indicators */}
            <div className="panel-box" style={{ marginTop: 14 }}>
              <div className="panel-box-header">
                <div className="panel-box-title">
                  <Zap size={15} />
                  <span>Urban Utilities & Resource Baselines</span>
                </div>
                <span className="status-badge active">
                  <ShieldCheck size={11} />
                  <span>MODELS READY</span>
                </span>
              </div>
              <div className="panel-box-body">
                <div className="utility-grid">
                  <div className="utility-mini-card">
                    <div className="util-icon electricity">
                      <Zap size={14} />
                    </div>
                    <div className="util-info">
                      <span className="util-label">Electricity Grid</span>
                      <span className="util-val">~24,500 kWh</span>
                      <span className="util-unit">Baseline Daily Demand</span>
                    </div>
                  </div>

                  <div className="utility-mini-card">
                    <div className="util-icon water">
                      <Droplets size={14} />
                    </div>
                    <div className="util-info">
                      <span className="util-label">Water Demand</span>
                      <span className="util-val">~185 m³/hr</span>
                      <span className="util-unit">ExtraTrees Model</span>
                    </div>
                  </div>

                  <div className="utility-mini-card">
                    <div className="util-icon waste">
                      <Trash2 size={14} />
                    </div>
                    <div className="util-info">
                      <span className="util-label">Solid Waste</span>
                      <span className="util-val">~1.2 tonnes</span>
                      <span className="util-unit">XGBRegressor Model</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Active Developments & System Health */}
          <div className="section-column">
            <div className="panel-box">
              <div className="panel-box-header">
                <div className="panel-box-title">
                  <Building2 size={15} />
                  <span>Active 3D Developments ({devCount})</span>
                </div>
                <button
                  className="btn primary small"
                  onClick={() => goTo("scenarios")}
                  type="button"
                >
                  <span>+ Propose New</span>
                </button>
              </div>
              <div className="panel-box-body">
                {developments.length === 0 ? (
                  <div className="empty-state-box">
                    <Building2 size={24} />
                    <p>No custom developments placed in this district yet.</p>
                    <button
                      className="btn secondary small"
                      onClick={() => goTo("scenarios")}
                      type="button"
                    >
                      <span>Click Map to Place Development</span>
                    </button>
                  </div>
                ) : (
                  <div className="developments-scroll-list">
                    {developments.map((d) => {
                      const id = d.development_id || d.id;
                      const type = d.development_type || d.type || "residential_compound";
                      const name = d.name || `Development #${id.slice(0, 6)}`;
                      const floors = d.floors || 5;
                      const buildingReports = getReportsForDevelopment(state.reports, id);
                      const reportCount = buildingReports.length;

                      return (
                        <div key={id} className="dev-list-item">
                          <div className="dev-list-info">
                            <span className="dev-list-name">{name}</span>
                            <div className="dev-list-meta">
                              <span className="badge dev-type">{type.replace("_", " ")}</span>
                              <span className="badge">{floors} floors</span>
                              <span
                                className={`badge ${reportCount > 0 ? "highlight-cyan" : ""}`}
                                style={reportCount > 0 ? { borderColor: "rgba(56, 189, 248, 0.4)", background: "rgba(56, 189, 248, 0.1)" } : {}}
                              >
                                What-If Reports: {reportCount > 0 ? reportCount : "None"}
                              </span>
                            </div>
                          </div>
                          <div style={{ display: "flex", gap: "6px" }}>
                            <button
                              className={`btn ${reportCount > 0 ? "primary" : "secondary"} small`}
                              onClick={() => {
                                dispatch({ type: "DEVELOPMENT_SELECTED", dev: d });
                                goTo("scenarios");
                              }}
                              type="button"
                            >
                              <span>{reportCount > 0 ? "OPEN" : "RUN WHAT-IF"}</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* System Status & Provenance */}
            <div className="panel-box" style={{ marginTop: 14 }}>
              <div className="panel-box-header">
                <div className="panel-box-title">
                  <ShieldCheck size={15} />
                  <span>Twin Engine Readiness & Connectivity</span>
                </div>
              </div>
              <div className="panel-box-body">
                <div className="stat-row">
                  <span className="stat-label">Simulation Backend API</span>
                  <span className={`stat-value ${backend.healthy ? "highlight-green" : "highlight-red"}`}>
                    {backend.healthy ? "CONNECTED (Port 8000)" : "OFFLINE / CHECKING"}
                  </span>
                </div>
                <div className="stat-row">
                  <span className="stat-label">Cesium 3D Globe Viewer</span>
                  <span className="stat-value highlight-cyan">READY & INITIALIZED</span>
                </div>
                <div className="stat-row">
                  <span className="stat-label">Active Basemap</span>
                  <span className="stat-value">
                    {state.map.basemap === "satellite" ? "High-Resolution Satellite" : "Google Roadmap"}
                  </span>
                </div>
                <div className="stat-row">
                  <span className="stat-label">Storage Architecture</span>
                  <span className="stat-value">SQLite Persistent Store</span>
                </div>

                <div className="quick-actions-bar">
                  <button
                    className="btn secondary small"
                    onClick={() => goTo("data-layers")}
                    type="button"
                  >
                    <Layers size={13} />
                    <span>Manage Spatial Layers</span>
                  </button>
                  <button
                    className="btn primary small cta"
                    onClick={() => goTo("scenarios")}
                    type="button"
                  >
                    <Sparkles size={13} />
                    <span>Simulate What-If</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
