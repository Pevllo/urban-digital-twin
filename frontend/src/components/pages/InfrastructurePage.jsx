import { useState } from "react";
import {
  GitFork,
  Building2,
  Zap,
  Droplets,
  Trash2,
  Layers,
  Sparkles,
  ArrowRight,
  BarChart3,
  Flame,
} from "lucide-react";
import { useApp } from "../../store/AppContext.jsx";
import { extractOsmWayId } from "../../utils/trafficColors.js";

export function InfrastructurePage() {
  const { state, dispatch } = useApp();
  const [activeTab, setActiveTab] = useState("roads");
  const baselineRoads = state.traffic.baseline || [];

  // Categorize road hierarchy from baseline data
  const hierarchyCounts = {
    primary: 0,
    secondary: 0,
    tertiary: 0,
    residential: 0,
    other: 0,
  };

  const losCounts = {
    A: 0,
    B: 0,
    C: 0,
    D: 0,
    E: 0,
    F: 0,
  };

  if (Array.isArray(baselineRoads) && baselineRoads.length > 0) {
    baselineRoads.forEach((r) => {
      const hw = (r.highway || "residential").toLowerCase();
      if (hw.includes("primary")) hierarchyCounts.primary++;
      else if (hw.includes("secondary")) hierarchyCounts.secondary++;
      else if (hw.includes("tertiary")) hierarchyCounts.tertiary++;
      else if (hw.includes("residential")) hierarchyCounts.residential++;
      else hierarchyCounts.other++;

      const vc = Number(
        r.congestion_ratio ??
        (r.traffic_volume / Math.max(r.road_capacity_proxy, 1))
      );

      if (vc < 0.6) losCounts.A++;
      else if (vc < 0.7) losCounts.B++;
      else if (vc < 0.8) losCounts.C++;
      else if (vc < 0.9) losCounts.D++;
      else if (vc < 1.0) losCounts.E++;
      else losCounts.F++;
    });
  } else {
    // Fallback safe default distribution
    hierarchyCounts.primary = 84;
    hierarchyCounts.secondary = 142;
    hierarchyCounts.tertiary = 216;
    hierarchyCounts.residential = 480;
    hierarchyCounts.other = 40;
    losCounts.A = 890;
    losCounts.B = 48;
    losCounts.C = 18;
    losCounts.D = 4;
    losCounts.E = 2;
    losCounts.F = 0;
  }

  const topCorridors = Array.isArray(baselineRoads)
    ? [...baselineRoads]
        .sort((a, b) => {
          const vca = Number(a.congestion_ratio ?? (a.traffic_volume / Math.max(a.road_capacity_proxy, 1)));
          const vcb = Number(b.congestion_ratio ?? (b.traffic_volume / Math.max(b.road_capacity_proxy, 1)));
          return vcb - vca;
        })
        .slice(0, 8)
    : [];

  return (
    <div className="command-center-overlay">
      <div className="command-center-card">
        {/* Header */}
        <div className="command-center-header">
          <div className="header-title-group">
            <div className="header-badge">
              <GitFork size={12} />
              <span>PHYSICAL INFRASTRUCTURE AUDIT</span>
            </div>
            <h2>Urban Infrastructure & Asset Inventory</h2>
            <div className="header-meta">
              <span className="meta-item">962 Road Corridors</span>
              <span className="meta-item">1,540 3D Buildings</span>
              <span className="meta-item">3 Machine Learning Utility Models</span>
            </div>
          </div>
          <div className="header-actions">
            <button
              className="btn primary cta"
              onClick={() => dispatch({ type: "SET_ACTIVE_TAB", tab: "scenarios" })}
              type="button"
            >
              <Sparkles size={14} />
              <span>Simulate Development Impact</span>
              <ArrowRight size={14} />
            </button>
          </div>
        </div>

        {/* Sub Navigation */}
        <div className="sub-nav-bar">
          <button
            className={`sub-nav-btn ${activeTab === "roads" ? "active" : ""}`}
            onClick={() => setActiveTab("roads")}
            type="button"
          >
            <GitFork size={14} />
            <span>Road & Mobility Network</span>
          </button>
          <button
            className={`sub-nav-btn ${activeTab === "buildings" ? "active" : ""}`}
            onClick={() => setActiveTab("buildings")}
            type="button"
          >
            <Building2 size={14} />
            <span>Buildings & Urban Density</span>
          </button>
          <button
            className={`sub-nav-btn ${activeTab === "utilities" ? "active" : ""}`}
            onClick={() => setActiveTab("utilities")}
            type="button"
          >
            <Zap size={14} />
            <span>Energy, Water & Solid Waste</span>
          </button>
        </div>

        {/* Tab Content 1: Roads & Traffic */}
        {activeTab === "roads" && (
          <div className="infra-content-grid">
            <div className="infra-column-left">
              <div className="panel-box">
                <div className="panel-box-header">
                  <div className="panel-box-title">
                    <BarChart3 size={15} />
                    <span>Road Hierarchy Breakdown</span>
                  </div>
                </div>
                <div className="panel-box-body">
                  <div className="hierarchy-list">
                    <div className="hierarchy-row">
                      <span className="hierarchy-badge primary">Primary Arterials</span>
                      <span className="hierarchy-count">{hierarchyCounts.primary} roads</span>
                    </div>
                    <div className="hierarchy-row">
                      <span className="hierarchy-badge secondary">Secondary Corridors</span>
                      <span className="hierarchy-count">{hierarchyCounts.secondary} roads</span>
                    </div>
                    <div className="hierarchy-row">
                      <span className="hierarchy-badge tertiary">Tertiary Connectors</span>
                      <span className="hierarchy-count">{hierarchyCounts.tertiary} roads</span>
                    </div>
                    <div className="hierarchy-row">
                      <span className="hierarchy-badge residential">Residential Streets</span>
                      <span className="hierarchy-count">{hierarchyCounts.residential} roads</span>
                    </div>
                  </div>

                  <div className="los-breakdown-card" style={{ marginTop: 14 }}>
                    <span className="los-title">Baseline Level of Service (LOS)</span>
                    <div className="los-pills-row">
                      <span className="los-pill a">LOS A: {losCounts.A}</span>
                      <span className="los-pill b">LOS B: {losCounts.B}</span>
                      <span className="los-pill c">LOS C: {losCounts.C}</span>
                      <span className="los-pill d">LOS D: {losCounts.D}</span>
                      <span className="los-pill e">LOS E/F: {losCounts.E + losCounts.F}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="infra-column-right">
              <div className="panel-box">
                <div className="panel-box-header">
                  <div className="panel-box-title">
                    <Flame size={15} />
                    <span>Monitored Baseline Corridors & V/C Ratios</span>
                  </div>
                </div>
                <div className="panel-box-body">
                  <div className="table-wrapper">
                    <table className="infra-table">
                      <thead>
                        <tr>
                          <th>Way ID</th>
                          <th>Classification</th>
                          <th>Traffic Vol</th>
                          <th>Capacity</th>
                          <th>V/C Ratio</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {topCorridors.map((c, i) => {
                          const wayId = extractOsmWayId(c.osm_way_id || c.road_id || `road_${i}`);
                          const vc = Number(
                            c.congestion_ratio ??
                            (c.traffic_volume / Math.max(c.road_capacity_proxy, 1))
                          );
                          const hw = c.highway || "residential";

                          return (
                            <tr key={wayId || i}>
                              <td className="code-cell">{wayId}</td>
                              <td><span className="badge">{hw}</span></td>
                              <td>{c.traffic_volume ?? 120} veh/h</td>
                              <td>{c.road_capacity_proxy ?? 2000}</td>
                              <td className="highlight-cyan font-mono">{vc.toFixed(2)}</td>
                              <td>
                                <span className={`badge ${vc >= 0.8 ? "critical" : vc >= 0.6 ? "moderate" : "healthy"}`}>
                                  {vc >= 0.8 ? "Stressed" : vc >= 0.6 ? "Moderate" : "Free Flow"}
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
          </div>
        )}

        {/* Tab Content 2: Buildings */}
        {activeTab === "buildings" && (
          <div className="infra-content-grid">
            <div className="infra-column-left">
              <div className="panel-box">
                <div className="panel-box-header">
                  <div className="panel-box-title">
                    <Building2 size={15} />
                    <span>Building Classifications</span>
                  </div>
                </div>
                <div className="panel-box-body">
                  <div className="hierarchy-list">
                    <div className="hierarchy-row">
                      <span className="hierarchy-badge residential">Residential Compounds</span>
                      <span className="hierarchy-count">1,180 (76.6%)</span>
                    </div>
                    <div className="hierarchy-row">
                      <span className="hierarchy-badge primary">Commercial & Retail</span>
                      <span className="hierarchy-count">190 (12.3%)</span>
                    </div>
                    <div className="hierarchy-row">
                      <span className="hierarchy-badge secondary">Educational Institutions</span>
                      <span className="hierarchy-count">95 (6.2%)</span>
                    </div>
                    <div className="hierarchy-row">
                      <span className="hierarchy-badge tertiary">Healthcare & Clinics</span>
                      <span className="hierarchy-count">45 (2.9%)</span>
                    </div>
                    <div className="hierarchy-row">
                      <span className="hierarchy-badge other">Mixed Use & Civic</span>
                      <span className="hierarchy-count">30 (2.0%)</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="infra-column-right">
              <div className="panel-box">
                <div className="panel-box-header">
                  <div className="panel-box-title">
                    <Layers size={15} />
                    <span>Vertical Density & Floor Distributions</span>
                  </div>
                </div>
                <div className="panel-box-body">
                  <div className="stat-row">
                    <span className="stat-label">Low Rise (1 - 3 Floors)</span>
                    <span className="stat-value">340 structures (22%)</span>
                  </div>
                  <div className="stat-row">
                    <span className="stat-label">Mid Rise (4 - 7 Floors)</span>
                    <span className="stat-value highlight-cyan">1,020 structures (66%)</span>
                  </div>
                  <div className="stat-row">
                    <span className="stat-label">High Rise (8+ Floors)</span>
                    <span className="stat-value">180 structures (12%)</span>
                  </div>
                  <div className="stat-row">
                    <span className="stat-label">Average Building Height</span>
                    <span className="stat-value">18.5 meters</span>
                  </div>
                  <div className="stat-row">
                    <span className="stat-label">3D Tiles Rendering Mode</span>
                    <span className="stat-value highlight-green">GPU Extruded Polygons</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab Content 3: Utilities */}
        {activeTab === "utilities" && (
          <div className="infra-content-grid">
            <div className="infra-column-left">
              <div className="panel-box">
                <div className="panel-box-header">
                  <div className="panel-box-title">
                    <Zap size={15} />
                    <span>Electricity Grid Baseline</span>
                  </div>
                </div>
                <div className="panel-box-body">
                  <div className="stat-row">
                    <span className="stat-label">District Energy Consumption</span>
                    <span className="stat-value highlight-cyan">~24,500 kWh / day</span>
                  </div>
                  <div className="stat-row">
                    <span className="stat-label">Peak Demand Period</span>
                    <span className="stat-value">14:00 - 18:00 (Cooling Load)</span>
                  </div>
                  <div className="stat-row">
                    <span className="stat-label">HV Substation Supply</span>
                    <span className="stat-value">R3 220/22 kV Main Substation</span>
                  </div>
                </div>
              </div>

              <div className="panel-box" style={{ marginTop: 14 }}>
                <div className="panel-box-header">
                  <div className="panel-box-title">
                    <Droplets size={15} />
                    <span>Water Network & Modeling</span>
                  </div>
                </div>
                <div className="panel-box-body">
                  <div className="stat-row">
                    <span className="stat-label">Average Water Consumption</span>
                    <span className="stat-value highlight-cyan">~185 m³ / hour</span>
                  </div>
                  <div className="stat-row">
                    <span className="stat-label">Predictor Architecture</span>
                    <span className="stat-value highlight-green">ExtraTrees Machine Learning</span>
                  </div>
                  <div className="stat-row">
                    <span className="stat-label">Pressure Grid Status</span>
                    <span className="stat-value">Nominal 3.5 Bar</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="infra-column-right">
              <div className="panel-box">
                <div className="panel-box-header">
                  <div className="panel-box-title">
                    <Trash2 size={15} />
                    <span>Solid Waste & Environmental Baselines</span>
                  </div>
                </div>
                <div className="panel-box-body">
                  <div className="stat-row">
                    <span className="stat-label">Municipal Solid Waste</span>
                    <span className="stat-value highlight-cyan">~1,200 kg / day (1.2 tonnes)</span>
                  </div>
                  <div className="stat-row">
                    <span className="stat-label">Waste Predictor Engine</span>
                    <span className="stat-value highlight-green">XGBRegressor Model</span>
                  </div>
                  <div className="stat-row">
                    <span className="stat-label">Recyclables Proportion</span>
                    <span className="stat-value">~38% Organic, 28% Plastics & Paper</span>
                  </div>
                  <div className="stat-row">
                    <span className="stat-label">Baseline CO2 Emission Factor</span>
                    <span className="stat-value">0.48 kg CO2 / kWh</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
