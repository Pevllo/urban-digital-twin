import {
  Layers,
  Eye,
  EyeOff,
  Globe2,
  Building2,
  GitFork,
  Compass,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  Database,
  Map,
} from "lucide-react";
import { useApp } from "../../store/AppContext.jsx";

const DATASETS = [
  {
    id: "roads",
    name: "Road Network & Traffic Polylines",
    type: "Vector Polylines",
    count: "962 features",
    source: "OpenStreetMap Overpass API + Baseline Traffic Flow",
    format: "GeoJSON / Cesium PolylineGraphics",
    icon: GitFork,
    description: "Vector highway segments color-coded by dynamic volume-over-capacity (V/C) and LOS.",
  },
  {
    id: "buildings",
    name: "OSM 3D Extruded Buildings",
    type: "3D Extruded Geometry",
    count: "1,540 structures",
    source: "OpenStreetMap Building Footprints",
    format: "Cesium PolygonGraphics with Height Extrusion",
    icon: Building2,
    description: "Physical building footprints with algorithmic height estimations for urban form rendering.",
  },
  {
    id: "developments",
    name: "Proposed 3D Development Complexes",
    type: "Multi-Building 3D Compound",
    count: "Dynamic active store",
    source: "SQLite Persistent Store (/api/v1/developments)",
    format: "Cesium CustomDataSource (Buildings + Landscape)",
    icon: Sparkles,
    description: "Architectural compound complexes placed by user with spatial setback validation.",
  },
  {
    id: "projectBoundary",
    name: "R3 District Project Boundary",
    type: "Polygon Boundary",
    count: "1 polygon",
    source: "Urban Planning Master Plan GeoJSON",
    format: "Cesium Polyline Outline & Translucent Fill",
    icon: Compass,
    description: "Primary operational district boundary for New Administrative Capital R3 district.",
  },
  {
    id: "osmBoundaries",
    name: "Administrative & Zonal Boundaries",
    type: "Multi-Polygon",
    count: "12 TAZ zones",
    source: "OpenStreetMap Administrative Boundary Data",
    format: "Cesium PolylineGraphics Boundary Ring",
    icon: Map,
    description: "Zonal administrative divisions used by 4-step traffic demand trip assignment model.",
  },
];

export function DataLayersPage() {
  const { state, dispatch } = useApp();
  const layerVis = state.map.layerVisibility || {};
  const currentBasemap = state.map.basemap || "satellite";

  function toggleLayer(layerKey) {
    dispatch({ type: "TOGGLE_LAYER", layer: layerKey });
  }

  function setBasemap(basemapKey) {
    dispatch({ type: "SET_BASEMAP", basemap: basemapKey });
  }

  return (
    <div className="command-center-overlay">
      <div className="command-center-card">
        {/* Header */}
        <div className="command-center-header">
          <div className="header-title-group">
            <div className="header-badge">
              <Layers size={12} />
              <span>SPATIAL DATASET INVENTORY</span>
            </div>
            <h2>Geospatial Data Layers & Base Maps</h2>
            <div className="header-meta">
              <span className="meta-item">
                <Database size={12} /> 5 Core Spatial Datasets
              </span>
              <span className="meta-item">
                <Globe2 size={12} /> 2 High-Res Basemap Providers
              </span>
              <span className="meta-item">
                <CheckCircle2 size={12} /> Synchronized with Cesium 3D Globe
              </span>
            </div>
          </div>
          <div className="header-actions">
            <button
              className="btn primary cta"
              onClick={() => dispatch({ type: "SET_ACTIVE_TAB", tab: "scenarios" })}
              type="button"
            >
              <Sparkles size={14} />
              <span>Launch What-If Simulation</span>
              <ArrowRight size={14} />
            </button>
          </div>
        </div>

        {/* Basemap Selection Bar */}
        <div className="basemap-section">
          <span className="section-label">SELECT BASEMAP IMAGERY</span>
          <div className="basemap-cards-row">
            <button
              className={`basemap-card ${currentBasemap === "satellite" ? "active" : ""}`}
              onClick={() => setBasemap("satellite")}
              type="button"
            >
              <div className="basemap-card-header">
                <Globe2 size={16} />
                <span className="basemap-title">High-Resolution Satellite</span>
              </div>
              <p className="basemap-desc">
                High-detail aerial imagery with topographic texture and true elevation.
              </p>
              <span className="basemap-badge">
                {currentBasemap === "satellite" ? "ACTIVE BASEMAP" : "SELECT"}
              </span>
            </button>

            <button
              className={`basemap-card ${currentBasemap === "google-roadmap" ? "active" : ""}`}
              onClick={() => setBasemap("google-roadmap")}
              type="button"
            >
              <div className="basemap-card-header">
                <Map size={16} />
                <span className="basemap-title">Google Roadmap / Standard Cartography</span>
              </div>
              <p className="basemap-desc">
                Clean vector cartographic tile layer optimized for infrastructure clarity.
              </p>
              <span className="basemap-badge">
                {currentBasemap === "google-roadmap" ? "ACTIVE BASEMAP" : "SELECT"}
              </span>
            </button>
          </div>
        </div>

        {/* Spatial Datasets Table */}
        <div className="datasets-table-box" style={{ marginTop: 18 }}>
          <div className="panel-box-header">
            <div className="panel-box-title">
              <Layers size={15} />
              <span>Available Spatial Layers & Visibility Controls</span>
            </div>
          </div>
          <div className="panel-box-body">
            <div className="table-wrapper">
              <table className="infra-table datasets-table">
                <thead>
                  <tr>
                    <th>Layer</th>
                    <th>Type</th>
                    <th>Features</th>
                    <th>Source & Format</th>
                    <th>Visibility</th>
                  </tr>
                </thead>
                <tbody>
                  {DATASETS.map((d) => {
                    const isVisible = layerVis[d.id] !== false;
                    const Icon = d.icon;

                    return (
                      <tr key={d.id} className={isVisible ? "" : "row-dimmed"}>
                        <td>
                          <div className="dataset-name-cell">
                            <Icon size={16} className="dataset-icon" />
                            <div>
                              <span className="dataset-name">{d.name}</span>
                              <span className="dataset-desc">{d.description}</span>
                            </div>
                          </div>
                        </td>
                        <td><span className="badge">{d.type}</span></td>
                        <td className="highlight-cyan font-mono">{d.count}</td>
                        <td>
                          <div className="dataset-meta-cell">
                            <span className="source-label">{d.source}</span>
                            <span className="format-label">{d.format}</span>
                          </div>
                        </td>
                        <td>
                          <button
                            className={`layer-toggle-btn ${isVisible ? "active" : "inactive"}`}
                            onClick={() => toggleLayer(d.id)}
                            type="button"
                            title={isVisible ? "Hide Layer" : "Show Layer"}
                          >
                            {isVisible ? <Eye size={13} /> : <EyeOff size={13} />}
                            <span>{isVisible ? "VISIBLE" : "HIDDEN"}</span>
                          </button>
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
  );
}
