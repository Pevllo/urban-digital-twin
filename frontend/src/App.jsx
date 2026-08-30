import CesiumMap from "./components/map/CesiumMap";
import { useEffect, useState } from "react";
import {
  BarChart3,
  Building2,
  Car,
  ChevronDown,
  CircleHelp,
  Cloud,
  Gauge,
  Layers3,
  Leaf,
  Map,
  Menu,
  Settings,
  Zap,
} from "lucide-react";
import "./App.css";

const navigation = [
  { label: "Dashboard", icon: Gauge },
  { label: "Digital Twin", icon: Map, active: true },
  { label: "Analytics", icon: BarChart3 },
  { label: "What-If Simulator", icon: Layers3 },
  { label: "Reports", icon: Cloud },
];

const tools = [
  { label: "Buildings", icon: Building2 },
  { label: "Roads", icon: Map },
  { label: "Traffic", icon: Car },
  { label: "Electricity", icon: Zap },
  { label: "Environment", icon: Leaf },
];

function App() {
  const [selectedBuilding, setSelectedBuilding] = useState(null);
  const [selectedRoad, setSelectedRoad] = useState(null);
  const [roadTraffic, setRoadTraffic] = useState(null);

  /*
   * Load traffic information whenever a road is selected.
   */
  useEffect(() => {
    if (!selectedRoad) {
      setRoadTraffic(null);
      return;
    }

    const selectedId = String(selectedRoad.id || "");

    if (!selectedId) {
      setRoadTraffic(null);
      return;
    }

    // Cesium road IDs are currently formatted as:
    // way_90604136
    const osmWayId = selectedId.replace(/^way_/, "");

    if (!/^\d+$/.test(osmWayId)) {
      console.warn("Invalid OSM way ID:", selectedId);
      setRoadTraffic(null);
      return;
    }

    let cancelled = false;

    fetch(
      `http://127.0.0.1:8000/api/v1/traffic/baseline?osm_way_id=${osmWayId}`
    )
      .then((response) => {
        if (!response.ok) {
          throw new Error(
            `Traffic API returned ${response.status} for OSM way ${osmWayId}`
          );
        }

        return response.json();
      })
      .then((data) => {
        if (!cancelled) {
          setRoadTraffic(data);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          console.warn("Traffic data unavailable:", error.message);
          setRoadTraffic(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedRoad]);

  return (
    <div className="app">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <Building2 size={21} />
          </div>

          <div>
            <h1>Urban Twin</h1>
            <span>Digital Twin Platform</span>
          </div>
        </div>

        <div className="sidebar-section">
          <p className="section-label">Workspace</p>

          <nav className="nav-list">
            {navigation.map(({ label, icon: Icon, active }) => (
              <button
                key={label}
                className={`nav-item ${active ? "active" : ""}`}
              >
                <Icon size={18} />
                <span>{label}</span>
              </button>
            ))}
          </nav>
        </div>

        <div className="sidebar-section">
          <p className="section-label">City Layers</p>

          <div className="layer-list">
            {tools.map(({ label, icon: Icon }) => (
              <button className="layer-item" key={label}>
                <span className="layer-left">
                  <Icon size={17} />
                  {label}
                </span>

                <span className="toggle on">
                  <span />
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="sidebar-bottom">
          <button className="nav-item">
            <Settings size={18} />
            <span>Settings</span>
          </button>

          <button className="nav-item">
            <CircleHelp size={18} />
            <span>Help & Support</span>
          </button>

          <div className="user-card">
            <div className="avatar">KR</div>

            <div className="user-info">
              <strong>Urban Planner</strong>
              <span>Administrator</span>
            </div>

            <ChevronDown size={16} />
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="main">
        {/* Top bar */}
        <header className="topbar">
          <div className="mobile-menu">
            <Menu size={21} />
          </div>

          <div>
            <p className="breadcrumb">Workspace / Digital Twin</p>
            <h2>City Overview</h2>
          </div>

          <div className="topbar-actions">
            <div className="status">
              <span className="status-dot" />
              System Operational
            </div>

            <button className="icon-button">
              <CircleHelp size={19} />
            </button>

            <button className="icon-button">
              <Settings size={19} />
            </button>
          </div>
        </header>

        {/* Content */}
        <section className="content">
          {/* KPI row */}
          <div className="kpi-grid">
            <div className="kpi-card">
              <div className="kpi-icon building">
                <Building2 size={20} />
              </div>

              <div>
                <span>Total Buildings</span>
                <strong>1,284</strong>
              </div>

              <small>+3.2%</small>
            </div>

            <div className="kpi-card">
              <div className="kpi-icon traffic">
                <Car size={20} />
              </div>

              <div>
                <span>Traffic Level</span>
                <strong>64%</strong>
              </div>

              <small>Moderate</small>
            </div>

            <div className="kpi-card">
              <div className="kpi-icon energy">
                <Zap size={20} />
              </div>

              <div>
                <span>Energy Demand</span>
                <strong>18.4 MW</strong>
              </div>

              <small>+5.8%</small>
            </div>

            <div className="kpi-card">
              <div className="kpi-icon environment">
                <Leaf size={20} />
              </div>

              <div>
                <span>CO₂ Emissions</span>
                <strong>7.2 t/h</strong>
              </div>

              <small>-2.1%</small>
            </div>
          </div>

          {/* Main workspace */}
          <div className="workspace">
            <div className="map-panel">
              <div className="panel-header">
                <div>
                  <span className="eyebrow">DIGITAL TWIN</span>
                  <h3>Interactive City Map</h3>
                </div>

                <div className="map-controls">
                  <button className="control-button">
                    <Layers3 size={17} />
                    Layers
                  </button>

                  <button className="control-button">
                    <Map size={17} />
                    Map View
                  </button>
                </div>
              </div>

              <div className="map-placeholder">
                <CesiumMap
                  onBuildingSelect={(building) => {
                    setSelectedBuilding(building);
                    setSelectedRoad(null);
                    setRoadTraffic(null);
                  }}
                  onRoadSelect={(road) => {
                    setSelectedRoad(road);
                    setSelectedBuilding(null);
                    setRoadTraffic(null);
                  }}
                />

                <div className="map-badge">
                  <span className="status-dot" />
                  Live City Model
                </div>
              </div>
            </div>

            {/* Right panel */}
            <aside className="details-panel">
              <div className="panel-header">
                <div>
                  <span className="eyebrow">INSPECTOR</span>
                  <h3>Selected Object</h3>
                </div>
              </div>

              {/* ================= BUILDING ================= */}
              {selectedBuilding ? (
                <div className="building-details">
                  <div className="selected-object-header">
                    <div className="empty-icon">
                      <Building2 size={24} />
                    </div>

                    <div>
                      <span className="eyebrow">BUILDING</span>

                      <h4>
                        {selectedBuilding.name ||
                          `Building ${String(
                            selectedBuilding.id || ""
                          ).replace("bldg_", "")}`}
                      </h4>
                    </div>
                  </div>

                  <div className="property-list">
                    <div className="property">
                      <span>ID</span>
                      <strong>{selectedBuilding.id}</strong>
                    </div>

                    <div className="property">
                      <span>Type</span>
                      <strong>{selectedBuilding.building || "Unknown"}</strong>
                    </div>

                    <div className="property">
                      <span>Latitude</span>
                      <strong>
                        {Array.isArray(selectedBuilding.centroid)
                          ? selectedBuilding.centroid[0].toFixed(6)
                          : "—"}
                      </strong>
                    </div>

                    <div className="property">
                      <span>Longitude</span>
                      <strong>
                        {Array.isArray(selectedBuilding.centroid)
                          ? selectedBuilding.centroid[1].toFixed(6)
                          : "—"}
                      </strong>
                    </div>

                    <div className="property">
                      <span>Radius</span>
                      <strong>
                        {typeof selectedBuilding.radius === "number"
                          ? `${selectedBuilding.radius.toFixed(1)} m`
                          : "—"}
                      </strong>
                    </div>
                  </div>
                </div>
              ) : /* ================= ROAD ================= */
              selectedRoad ? (
                <div className="road-details">
                  <div className="selected-object-header">
                    <div className="empty-icon">
                      <Map size={24} />
                    </div>

                    <div>
                      <span className="eyebrow">ROAD</span>

                      <h4>
                        {selectedRoad.name ||
                          `Road ${String(
                            selectedRoad.id || ""
                          ).replace("way_", "")}`}
                      </h4>
                    </div>
                  </div>

                  {/* Road properties */}
                  <div className="property-list">
                    <div className="property">
                      <span>ID</span>
                      <strong>{selectedRoad.id}</strong>
                    </div>

                    <div className="property">
                      <span>Classification</span>
                      <strong>{selectedRoad.highway || "Unknown"}</strong>
                    </div>

                    <div className="property">
                      <span>Name</span>
                      <strong>{selectedRoad.name || "Unnamed"}</strong>
                    </div>

                    <div className="property">
                      <span>Coordinates</span>
                      <strong>
                        {Array.isArray(selectedRoad.coordinates)
                          ? `${selectedRoad.coordinates.length} points`
                          : "—"}
                      </strong>
                    </div>
                  </div>

                  {/* ================= TRAFFIC ================= */}
                  {roadTraffic ? (
                    <div className="traffic-details">
                      <span className="eyebrow">TRAFFIC</span>

                      <div className="property-list">
                        <div className="property">
                          <span>Traffic Volume</span>

                          <strong>
                            {Number(
                              roadTraffic.traffic_volume || 0
                            ).toLocaleString()}{" "}
                            veh/h
                          </strong>
                        </div>

                        <div className="property">
                          <span>Capacity</span>

                          <strong>
                            {Number(
                              roadTraffic.road_capacity_proxy || 0
                            ).toLocaleString()}{" "}
                            veh/h
                          </strong>
                        </div>

                        <div className="property">
                          <span>Segments</span>

                          <strong>{roadTraffic.segment_count ?? "—"}</strong>
                        </div>

                        <div className="property">
                          <span>Road Length</span>

                          <strong>
                            {typeof roadTraffic.road_length_m === "number"
                              ? `${roadTraffic.road_length_m.toLocaleString()} m`
                              : "—"}
                          </strong>
                        </div>

                        <div className="property">
                          <span>Lanes</span>

                          <strong>{roadTraffic.lane_count ?? "—"}</strong>
                        </div>

                        <div className="property">
                          <span>Speed Limit</span>

                          <strong>
                            {roadTraffic.speed_limit_kmh ?? "—"} km/h
                          </strong>
                        </div>

                        <div className="property">
                          <span>Hierarchy</span>

                          <strong>
                            {roadTraffic.road_hierarchy || "—"}
                          </strong>
                        </div>

                        <div className="property">
                          <span>Data Type</span>

                          <strong>SYNTHETIC</strong>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="traffic-unavailable">
                      <span className="eyebrow">TRAFFIC</span>

                      <p>Traffic data is unavailable for this road.</p>

                      <small>
                        This road is not included in the drivable traffic
                        network.
                      </small>
                    </div>
                  )}
                </div>
              ) : (
                /* ================= EMPTY ================= */
                <div className="empty-state">
                  <div className="empty-icon">
                    <Building2 size={24} />
                  </div>

                  <h4>No object selected</h4>

                  <p>
                    Select a building, road, or city element on the map to
                    inspect its properties.
                  </p>
                </div>
              )}
            </aside>
          </div>

          {/* What-if */}
          <section className="simulation-panel">
            <div>
              <span className="eyebrow">SIMULATION</span>

              <h3>What-If Scenario</h3>

              <p>
                Create a scenario and evaluate its impact on the city.
              </p>
            </div>

            <button className="secondary-button">Open Simulator</button>
          </section>
        </section>
      </main>
    </div>
  );
}

export default App;