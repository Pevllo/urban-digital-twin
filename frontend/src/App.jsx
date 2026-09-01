import CesiumMap from "./components/map/CesiumMap";
import SimulationResults from "./components/simulation/SimulationResults";
import { useEffect, useState } from "react";
import spatialData from "./data/spatialFeatures.json";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

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
  { label: "Dashboard", icon: Gauge, disabled: true },
  { label: "Digital Twin", icon: Map, active: true },
  { label: "Analytics", icon: BarChart3, disabled: true },
  { label: "What-If Simulator", icon: Layers3 },
  { label: "Reports", icon: Cloud, disabled: true },
];

const tools = [
  { label: "Buildings", icon: Building2, key: "buildings" },
  { label: "Roads", icon: Map, key: "roads" },
  { label: "Traffic", icon: Car, disabled: true },
  { label: "Electricity", icon: Zap, disabled: true },
  { label: "Environment", icon: Leaf, disabled: true },
];

function App() {
  const [selectedBuilding, setSelectedBuilding] = useState(null);
  const [selectedRoad, setSelectedRoad] = useState(null);
  const [roadTraffic, setRoadTraffic] = useState(null);

  const [developmentMode, setDevelopmentMode] = useState(false);
  const [developmentLocation, setDevelopmentLocation] = useState(null);
  const [proposedDevelopment, setProposedDevelopment] = useState(null);
  const [selectedDevelopment, setSelectedDevelopment] = useState(null);

  const [developmentForm, setDevelopmentForm] = useState({
    development_type: "residential",
    name: "",
    floors: 1,

    num_units: 0,
    num_residents: 0,

    num_beds: 0,
    staff_count: 0,
    visitor_capacity: 0,

    num_students: 0,
    num_employees: 0,

    gross_leasable_area_sqm: 0,
    gross_floor_area_sqm: 0,
  });

  const [simulationResult, setSimulationResult] = useState(null);
  const [simulationLoading, setSimulationLoading] = useState(false);
  const [simulationError, setSimulationError] = useState(null);

  const [backendOnline, setBackendOnline] = useState(null);
  const [layerVisibility, setLayerVisibility] = useState({
    buildings: true,
    roads: true,
  });

  // =========================================================
  // BACKEND HEALTH CHECK
  // =========================================================

  useEffect(() => {
    fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(5000) })
      .then((res) => {
        setBackendOnline(res.ok);
      })
      .catch(() => {
        setBackendOnline(false);
      });
  }, []);

  // =========================================================
  // LOAD TRAFFIC WHEN A ROAD IS SELECTED
  // =========================================================

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

    const osmWayId = selectedId.replace(/^way_/, "");

    if (!/^\d+$/.test(osmWayId)) {
      console.warn("Invalid OSM way ID:", selectedId);
      setRoadTraffic(null);
      return;
    }

    let cancelled = false;

    fetch(
      `${API_BASE}/api/v1/traffic/baseline?osm_way_id=${osmWayId}`,
    )
      .then((response) => {
        if (!response.ok) {
          throw new Error(
            `Traffic API returned ${response.status} for OSM way ${osmWayId}`,
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

  // =========================================================
  // DEVELOPMENT MODE
  // =========================================================

  const toggleDevelopmentMode = () => {
    setDevelopmentMode((current) => !current);

    setDevelopmentLocation(null);
    setSelectedBuilding(null);
    setSelectedRoad(null);
    setRoadTraffic(null);
  };

  // =========================================================
  // UPDATE FORM FIELD
  // =========================================================

  const updateDevelopmentForm = (field, value) => {
    setDevelopmentForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  // =========================================================
  // DEVELOPMENT TYPE CHANGE
  // =========================================================

  const handleDevelopmentTypeChange = (type) => {
    setDevelopmentForm((current) => ({
      ...current,

      development_type: type,

      num_units:
        type === "residential" || type === "residential_compound" || type === "mixed_use" ? current.num_units : 0,

      num_residents:
        type === "residential" || type === "residential_compound" || type === "mixed_use"
          ? current.num_residents
          : 0,

      num_beds: type === "hospital" || type === "hotel" ? current.num_beds : 0,

      staff_count:
        type === "hospital" || type === "school" || type === "hotel" ? current.staff_count : 0,

      visitor_capacity:
        type === "hospital" || type === "commercial" || type === "retail" || type === "mall" || type === "hotel"
          ? current.visitor_capacity
          : 0,

      num_students: type === "school" ? current.num_students : 0,

      num_employees:
        type === "office" ||
        type === "commercial" ||
        type === "retail" ||
        type === "mall" ||
        type === "mixed_use"
          ? current.num_employees
          : 0,

      gross_leasable_area_sqm:
        type === "commercial" || type === "retail" || type === "mall"
          ? current.gross_leasable_area_sqm
          : 0,
    }));
  };

  // =========================================================
  // CREATE DEVELOPMENT
  // =========================================================

  const handleCreateDevelopment = async () => {
    if (!developmentLocation) {
      return;
    }
    // =========================================================
    // DELETE CURRENT PROPOSED DEVELOPMENT
    // =========================================================

    

    const type = developmentForm.development_type;

    const properties = {
      floors: Number(developmentForm.floors) || 1,

      gross_floor_area_sqm: Number(developmentForm.gross_floor_area_sqm) || 0,
    };

    // -------------------------------------------------------
    // RESIDENTIAL / RESIDENTIAL COMPOUND
    // -------------------------------------------------------

    if (type === "residential" || type === "residential_compound") {
      properties.num_units = Number(developmentForm.num_units) || 0;

      properties.num_residents = Number(developmentForm.num_residents) || 0;
    }

    // -------------------------------------------------------
    // HOSPITAL / HOTEL
    // -------------------------------------------------------

    if (type === "hospital" || type === "hotel") {
      properties.num_beds = Number(developmentForm.num_beds) || 0;

      properties.staff_count = Number(developmentForm.staff_count) || 0;

      if (type === "hospital" || type === "hotel") {
        properties.visitor_capacity =
          Number(developmentForm.visitor_capacity) || 0;
      }
    }

    // -------------------------------------------------------
    // SCHOOL
    // -------------------------------------------------------

    if (type === "school") {
      properties.num_students = Number(developmentForm.num_students) || 0;

      properties.staff_count = Number(developmentForm.staff_count) || 0;
    }

    // -------------------------------------------------------
    // OFFICE
    // -------------------------------------------------------

    if (type === "office") {
      properties.num_employees = Number(developmentForm.num_employees) || 0;
    }

    // -------------------------------------------------------
    // COMMERCIAL / RETAIL / MALL
    // -------------------------------------------------------

    if (type === "commercial" || type === "retail" || type === "mall") {
      properties.visitor_capacity =
        Number(developmentForm.visitor_capacity) || 0;

      properties.num_employees = Number(developmentForm.num_employees) || 0;

      properties.gross_leasable_area_sqm =
        Number(developmentForm.gross_leasable_area_sqm) || 0;
    }

    // -------------------------------------------------------
    // MIXED USE
    // -------------------------------------------------------

    if (type === "mixed_use") {
      properties.num_units = Number(developmentForm.num_units) || 0;

      properties.num_residents = Number(developmentForm.num_residents) || 0;

      properties.num_employees = Number(developmentForm.num_employees) || 0;
    }

    // -------------------------------------------------------
    // API PAYLOAD
    // -------------------------------------------------------

    const payload = {
      development_id: `dev_${Date.now()}`,

      development_type: type,

      name: developmentForm.name || "New Development",

      latitude: developmentLocation.latitude,

      longitude: developmentLocation.longitude,

      floors: Number(developmentForm.floors) || 1,

      properties,

      simulation_hour: 8,
    };

    console.log("Creating development:", payload);

    // -------------------------------------------------------
    // SEND TO FASTAPI
    // -------------------------------------------------------

    try {
      const response = await fetch(
        `${API_BASE}/api/v1/developments`,
        {
          method: "POST",

          headers: {
            "Content-Type": "application/json",
          },

          body: JSON.stringify(payload),
        },
      );

      if (!response.ok) {
        const errorText = await response.text();

        throw new Error(
          `Development API returned ${response.status}: ${errorText}`,
        );
      }

      const createdDevelopment = await response.json();

      console.log("Development created successfully:", createdDevelopment);

      setProposedDevelopment({
        ...createdDevelopment,
        latitude: createdDevelopment.latitude ?? developmentLocation.latitude,
        longitude:
          createdDevelopment.longitude ?? developmentLocation.longitude,
        floors:
          createdDevelopment.floors ?? (Number(developmentForm.floors) || 1),
      });

      setSimulationResult(null);
      setSimulationError(null);

      alert("Development created successfully.");
    } catch (error) {
      console.error("Failed to create development:", error);

      alert(`Failed to create development: ${error.message}`);
    }
  };
  // =========================================================
  // DELETE CURRENT PROPOSED DEVELOPMENT
  // =========================================================

  const handleDeleteDevelopment = async () => {
    if (!selectedDevelopment) {
      return;
    }

    const devId = selectedDevelopment.development_id || selectedDevelopment.id;

    try {
      const response = await fetch(
        `${API_BASE}/api/v1/developments/${devId}`,
        { method: "DELETE" },
      );

      if (!response.ok && response.status !== 404) {
        const errorText = await response.text();
        throw new Error(
          `Delete API returned ${response.status}: ${errorText}`,
        );
      }
    } catch (error) {
      console.error("Failed to delete development on backend:", error);
      alert(`Failed to delete development: ${error.message}`);
      return;
    }

    setSelectedDevelopment(null);
    setProposedDevelopment(null);
    setDevelopmentLocation(null);
    setSimulationResult(null);
    setSimulationError(null);

    console.log("Development deleted:", devId);
  };

  // =========================================================
  // RUN SIMULATION
  // =========================================================

  const handleRunSimulation = async () => {
    if (!selectedDevelopment) {
      return;
    }

    setSimulationLoading(true);
    setSimulationError(null);

    const dev = selectedDevelopment;

    const payload = {
      development_id: dev.development_id || dev.id,
      development_type: dev.development_type,
      zone_id: dev.zone_id || "",
      name: dev.name || "New Development",
      properties: dev.properties || {},
      simulation_hour: dev.simulation_hour ?? 8,
      latitude: dev.latitude,
      longitude: dev.longitude,
    };

    console.log("Running simulation:", payload);

    try {
      const response = await fetch(
        `${API_BASE}/api/v1/scenarios/simulate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Simulation API returned ${response.status}: ${errorText}`,
        );
      }

      const result = await response.json();
      console.log("Simulation result:", result);
      setSimulationResult(result);
    } catch (error) {
      console.error("Simulation failed:", error);
      setSimulationError(
        error.message || "Simulation failed. Please try again.",
      );
    } finally {
      setSimulationLoading(false);
    }
  };

  // =========================================================
  // CLEAR SELECTED DEVELOPMENT
  // =========================================================

  useEffect(() => {
    if (!proposedDevelopment && selectedDevelopment) {
      setSelectedDevelopment(null);
    }
  }, [proposedDevelopment, selectedDevelopment]);

  // =========================================================
  // RENDER
  // =========================================================

  return (
    <div className="app">
      {/* =====================================================
          SIDEBAR
      ===================================================== */}

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
            {navigation.map(({ label, icon: Icon, active, disabled }) => (
              <button
                key={label}
                className={`nav-item ${active ? "active" : ""} ${disabled ? "nav-disabled" : ""}`}
                disabled={disabled}
                title={disabled ? "Coming Soon" : undefined}
              >
                <Icon size={18} />
                <span>{label}</span>
                {disabled && <span className="nav-badge">Soon</span>}
              </button>
            ))}
          </nav>
        </div>

        <div className="sidebar-section">
          <p className="section-label">City Layers</p>

          <div className="layer-list">
            {tools.map(({ label, icon: Icon, key, disabled }) => (
              <button
                className={`layer-item ${disabled ? "layer-disabled" : ""}`}
                key={label}
                disabled={disabled}
                title={disabled ? "Not implemented" : undefined}
                onClick={key ? () => {
                  setLayerVisibility((prev) => ({
                    ...prev,
                    [key]: !prev[key],
                  }));
                } : undefined}
              >
                <span className="layer-left">
                  <Icon size={17} />
                  {label}
                </span>

                {key ? (
                  <span className={`toggle ${layerVisibility[key] ? "on" : ""}`}>
                    <span />
                  </span>
                ) : (
                  <span className="toggle disabled-toggle">
                    <span />
                  </span>
                )}
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

      {/* =====================================================
          MAIN
      ===================================================== */}

      <main className="main">
        {/* ===================================================
            TOP BAR
        =================================================== */}

        <header className="topbar">
          <div className="mobile-menu">
            <Menu size={21} />
          </div>

          <div>
            <p className="breadcrumb">Workspace / Digital Twin</p>

            <h2>City Overview</h2>
          </div>

          <div className="topbar-actions">
            <div className={`status ${backendOnline === false ? "status-offline" : ""}`}>
              <span className={`status-dot ${backendOnline === false ? "dot-offline" : ""} ${backendOnline === null ? "dot-loading" : ""}`} />
              {backendOnline === null
                ? "Checking..."
                : backendOnline
                  ? "System Operational"
                  : "Backend Offline"}
            </div>

            <button className="icon-button">
              <CircleHelp size={19} />
            </button>

            <button className="icon-button">
              <Settings size={19} />
            </button>
          </div>
        </header>

        {/* ===================================================
            CONTENT
        =================================================== */}

        <section className="content">
          {/* =================================================
              KPI
          ================================================= */}

          <div className="kpi-grid">
            <div className="kpi-card">
              <div className="kpi-icon building">
                <Building2 size={20} />
              </div>

              <div>
                <span>Total Buildings</span>

                <strong>{(spatialData.metadata?.total_buildings ?? 0).toLocaleString()}</strong>
              </div>

              <small>City model</small>
            </div>

            <div className="kpi-card">
              <div className="kpi-icon traffic">
                <Car size={20} />
              </div>

              <div>
                <span>Traffic Level</span>

                <strong>—</strong>
              </div>

              <small>Not available</small>
            </div>

            <div className="kpi-card">
              <div className="kpi-icon energy">
                <Zap size={20} />
              </div>

              <div>
                <span>Energy Demand</span>

                <strong>—</strong>
              </div>

              <small>Not available</small>
            </div>

            <div className="kpi-card">
              <div className="kpi-icon environment">
                <Leaf size={20} />
              </div>

              <div>
                <span>CO₂ Emissions</span>

                <strong>—</strong>
              </div>

              <small>Not available</small>
            </div>
          </div>

          {/* =================================================
              WORKSPACE
          ================================================= */}

          <div className="workspace">
            {/* =================================================
                MAP
            ================================================= */}

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

                  <button
                    className={`control-button ${
                      developmentMode ? "active" : ""
                    }`}
                    onClick={toggleDevelopmentMode}
                  >
                    <Building2 size={17} />

                    {developmentMode ? "Cancel Development" : "Add Development"}
                  </button>
                </div>
              </div>

              <div className="map-placeholder">
                <CesiumMap
                  onBuildingSelect={(building) => {
                    if (developmentMode) {
                      return;
                    }

                    setSelectedBuilding(building);

                    setSelectedRoad(null);
                    setRoadTraffic(null);

                    setSelectedDevelopment(null);
                  }}
                  onDevelopmentSelect={(developmentId) => {
                    if (!proposedDevelopment) {
                      setSelectedDevelopment(null);
                      return;
                    }

                    const currentDevelopmentId =
                      proposedDevelopment.development_id ||
                      proposedDevelopment.id;

                    const isSelected =
                      String(currentDevelopmentId) ===
                      String(developmentId);

                    if (isSelected || !currentDevelopmentId) {
                      setSelectedDevelopment(proposedDevelopment);
                    } else {
                      // The Cesium entity may have a generated ID.
                      // Since there is only one proposed development,
                      // treat the clicked proposed-development entity
                      // as the selected development.
                      setSelectedDevelopment(proposedDevelopment);
                    }

                    setSelectedBuilding(null);
                    setSelectedRoad(null);
                    setRoadTraffic(null);

                    console.log(
                      "Development selected:",
                      proposedDevelopment
                    );
                  }}
                  onRoadSelect={(road) => {
                    if (developmentMode) {
                      return;
                    }

                    setSelectedRoad(road);

                    setSelectedBuilding(null);

                    setRoadTraffic(null);

                    setSelectedDevelopment(null);
                  }}
                  onMapLocationSelect={(location) => {
                    if (!developmentMode) {
                      return;
                    }

                    setDevelopmentLocation(location);

                    setSelectedBuilding(null);

                    setSelectedRoad(null);
                    setRoadTraffic(null);

                    console.log("Development location selected:", location);
                  }}
                  developmentMode={developmentMode}
                  proposedDevelopment={proposedDevelopment}
                  scenarioImpact={simulationResult?.stage4_impact_assessment}
                  layerVisibility={layerVisibility}
                />

                <div className="map-badge">
                  <span className="status-dot" />
                  Live City Model
                </div>
              </div>
            </div>

            {/* =================================================
                INSPECTOR
            ================================================= */}

            <aside className="details-panel">
              <div className="panel-header">
                <div>
                  <span className="eyebrow">INSPECTOR</span>

                  <h3>Selected Object</h3>
                </div>
              </div>

              {/* =================================================
                  BUILDING
              ================================================= */}

              {selectedDevelopment ? (
                <div className="building-details">
                  <div className="selected-object-header">
                    <div className="empty-icon">
                      <Building2 size={24} />
                    </div>

                    <div>
                      <span className="eyebrow">PROPOSED DEVELOPMENT</span>

                      <h4>
                        {selectedDevelopment.name || "New Development"}
                      </h4>
                    </div>
                  </div>

                  <div className="property-list">
                    <div className="property">
                      <span>ID</span>

                      <strong>
                        {selectedDevelopment.development_id ||
                          selectedDevelopment.id ||
                          "—"}
                      </strong>
                    </div>

                    <div className="property">
                      <span>Type</span>

                      <strong>
                        {selectedDevelopment.development_type || "Unknown"}
                      </strong>
                    </div>

                    <div className="property">
                      <span>Floors</span>

                      <strong>
                        {selectedDevelopment.floors ?? "—"}
                      </strong>
                    </div>

                    <div className="property">
                      <span>Gross Floor Area</span>

                      <strong>
                        {Number(
                          selectedDevelopment.properties
                            ?.gross_floor_area_sqm ??
                            selectedDevelopment.gross_floor_area_sqm ??
                            0,
                        ).toLocaleString()}{" "}
                        m²
                      </strong>
                    </div>

                    <div className="property">
                      <span>Latitude</span>

                      <strong>
                        {Number.isFinite(
                          Number(selectedDevelopment.latitude),
                        )
                          ? Number(selectedDevelopment.latitude).toFixed(6)
                          : "—"}
                      </strong>
                    </div>

                    <div className="property">
                      <span>Longitude</span>

                      <strong>
                        {Number.isFinite(
                          Number(selectedDevelopment.longitude),
                        )
                          ? Number(selectedDevelopment.longitude).toFixed(6)
                          : "—"}
                      </strong>
                    </div>
                  </div>

                  <button
                    className="secondary-button"
                    onClick={handleRunSimulation}
                    disabled={simulationLoading}
                    style={{
                      width: "100%",
                      marginTop: "16px",
                      ...(simulationLoading ? { opacity: 0.6, cursor: "not-allowed" } : {}),
                    }}
                  >
                    {simulationLoading ? "Running Simulation..." : "Run Simulation"}
                  </button>

                  {simulationLoading && (
                    <div className="sim-loading">
                      <div className="sim-loading-bar" />
                      <span>Trip demand → Traffic assignment → Impact assessment</span>
                    </div>
                  )}

                  {simulationError && (
                    <div
                      style={{
                        marginTop: "8px",
                        padding: "8px 12px",
                        background: "#fef2f2",
                        border: "1px solid #fecaca",
                        borderRadius: "6px",
                        color: "#dc2626",
                        fontSize: "13px",
                      }}
                    >
                      {simulationError}
                    </div>
                  )}

                  <SimulationResults simulationResult={simulationResult} />

                  <button
                    className="secondary-button"
                    onClick={handleDeleteDevelopment}
                    style={{
                      background: "#ef4444",
                      borderColor: "#ef4444",
                      width: "100%",
                      marginTop: "8px",
                    }}
                  >
                    Delete Development
                  </button>
                </div>
              ) : selectedBuilding ? (
                <div className="building-details">
                  <div className="selected-object-header">
                    <div className="empty-icon">
                      <Building2 size={24} />
                    </div>

                    <div>
                      <span className="eyebrow">BUILDING</span>

                      <h4>
                        {selectedBuilding.name ||
                          `Building ${String(selectedBuilding.id || "").replace(
                            "bldg_",
                            "",
                          )}`}
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
              ) : selectedRoad ? (
                /* =================================================
                    ROAD
                ================================================= */

                <div className="road-details">
                  <div className="selected-object-header">
                    <div className="empty-icon">
                      <Map size={24} />
                    </div>

                    <div>
                      <span className="eyebrow">ROAD</span>

                      <h4>
                        {selectedRoad.name ||
                          `Road ${String(selectedRoad.id || "").replace(
                            "way_",
                            "",
                          )}`}
                      </h4>
                    </div>
                  </div>

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

                  {/* =================================================
                      TRAFFIC
                  ================================================= */}

                  {roadTraffic ? (
                    <div className="traffic-details">
                      <span className="eyebrow">TRAFFIC</span>

                      <div className="property-list">
                        <div className="property">
                          <span>Traffic Volume</span>

                          <strong>
                            {Number(
                              roadTraffic.traffic_volume || 0,
                            ).toLocaleString()}{" "}
                            veh/h
                          </strong>
                        </div>

                        <div className="property">
                          <span>Capacity</span>

                          <strong>
                            {Number(
                              roadTraffic.road_capacity_proxy || 0,
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

                          <strong>{roadTraffic.road_hierarchy || "—"}</strong>
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
                /* =================================================
                    EMPTY
                ================================================= */

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

          {/* =================================================
              WHAT-IF SIMULATION
          ================================================= */}

          <section className="simulation-panel">
            <div>
              <span className="eyebrow">SIMULATION</span>

              <h3>What-If Scenario</h3>

              <p>Create a development and evaluate its impact on the city.</p>

              {/* NORMAL MODE */}

              {!developmentMode && (
                <p>
                  Click <strong>Add Development</strong> above to begin.
                </p>
              )}

              {/* DEVELOPMENT MODE - NO LOCATION */}

              {developmentMode && !developmentLocation && (
                <p>
                  Click an empty location on the map to place your development.
                </p>
              )}

              {/* DEVELOPMENT FORM */}

              {developmentMode && developmentLocation && (
                <div className="development-form">
                  {/* LOCATION */}

                  <div className="property">
                    <span>Latitude</span>

                    <strong>{developmentLocation.latitude.toFixed(6)}</strong>
                  </div>

                  <div className="property">
                    <span>Longitude</span>

                    <strong>{developmentLocation.longitude.toFixed(6)}</strong>
                  </div>

                  {/* DEVELOPMENT TYPE */}

                  <label>
                    Development Type
                    <select
                      value={developmentForm.development_type}
                      onChange={(event) =>
                        handleDevelopmentTypeChange(event.target.value)
                      }
                    >
                      <option value="residential">Residential</option>

                      <option value="residential_compound">Residential Compound</option>

                      <option value="commercial">Commercial</option>

                      <option value="retail">Retail</option>

                      <option value="mall">Mall</option>

                      <option value="office">Office</option>

                      <option value="hotel">Hotel</option>

                      <option value="mixed_use">Mixed Use</option>

                      <option value="school">School</option>

                      <option value="hospital">Hospital</option>
                    </select>
                  </label>

                  {/* NAME */}

                  <label>
                    Development Name
                    <input
                      type="text"
                      placeholder="New Development"
                      value={developmentForm.name}
                      onChange={(event) =>
                        updateDevelopmentForm("name", event.target.value)
                      }
                    />
                  </label>

                  {/* FLOORS */}

                  <label>
                    Floors
                    <input
                      type="number"
                      min="1"
                      value={developmentForm.floors}
                      onChange={(event) =>
                        updateDevelopmentForm(
                          "floors",
                          Number(event.target.value),
                        )
                      }
                    />
                  </label>

                  {/* =================================================
                      RESIDENTIAL / RESIDENTIAL COMPOUND
                  ================================================= */}

                  {(developmentForm.development_type === "residential" ||
                    developmentForm.development_type === "residential_compound") && (
                    <>
                      <label>
                        Number of Units
                        <input
                          type="number"
                          min="0"
                          value={developmentForm.num_units}
                          onChange={(event) =>
                            updateDevelopmentForm(
                              "num_units",
                              Number(event.target.value),
                            )
                          }
                        />
                      </label>

                      <label>
                        Number of Residents
                        <input
                          type="number"
                          min="0"
                          value={developmentForm.num_residents}
                          onChange={(event) =>
                            updateDevelopmentForm(
                              "num_residents",
                              Number(event.target.value),
                            )
                          }
                        />
                      </label>
                    </>
                  )}

                  {/* =================================================
                      HOSPITAL / HOTEL
                  ================================================= */}

                  {(developmentForm.development_type === "hospital" ||
                    developmentForm.development_type === "hotel") && (
                    <>
                      <label>
                        Number of Beds
                        <input
                          type="number"
                          min="0"
                          value={developmentForm.num_beds}
                          onChange={(event) =>
                            updateDevelopmentForm(
                              "num_beds",
                              Number(event.target.value),
                            )
                          }
                        />
                      </label>

                      <label>
                        Staff Count
                        <input
                          type="number"
                          min="0"
                          value={developmentForm.staff_count}
                          onChange={(event) =>
                            updateDevelopmentForm(
                              "staff_count",
                              Number(event.target.value),
                            )
                          }
                        />
                      </label>

                      <label>
                        Visitor Capacity
                        <input
                          type="number"
                          min="0"
                          value={developmentForm.visitor_capacity}
                          onChange={(event) =>
                            updateDevelopmentForm(
                              "visitor_capacity",
                              Number(event.target.value),
                            )
                          }
                        />
                      </label>
                    </>
                  )}

                  {/* =================================================
                      SCHOOL
                  ================================================= */}

                  {developmentForm.development_type === "school" && (
                    <>
                      <label>
                        Number of Students
                        <input
                          type="number"
                          min="0"
                          value={developmentForm.num_students}
                          onChange={(event) =>
                            updateDevelopmentForm(
                              "num_students",
                              Number(event.target.value),
                            )
                          }
                        />
                      </label>

                      <label>
                        Staff Count
                        <input
                          type="number"
                          min="0"
                          value={developmentForm.staff_count}
                          onChange={(event) =>
                            updateDevelopmentForm(
                              "staff_count",
                              Number(event.target.value),
                            )
                          }
                        />
                      </label>
                    </>
                  )}

                  {/* =================================================
                      OFFICE
                  ================================================= */}

                  {developmentForm.development_type === "office" && (
                    <label>
                      Number of Employees
                      <input
                        type="number"
                        min="0"
                        value={developmentForm.num_employees}
                        onChange={(event) =>
                          updateDevelopmentForm(
                            "num_employees",
                            Number(event.target.value),
                          )
                        }
                      />
                    </label>
                  )}

                  {/* =================================================
                      COMMERCIAL / RETAIL / MALL
                  ================================================= */}

                  {(developmentForm.development_type === "commercial" ||
                    developmentForm.development_type === "retail" ||
                    developmentForm.development_type === "mall") && (
                    <>
                      <label>
                        Visitor Capacity
                        <input
                          type="number"
                          min="0"
                          value={developmentForm.visitor_capacity}
                          onChange={(event) =>
                            updateDevelopmentForm(
                              "visitor_capacity",
                              Number(event.target.value),
                            )
                          }
                        />
                      </label>

                      <label>
                        Number of Employees
                        <input
                          type="number"
                          min="0"
                          value={developmentForm.num_employees}
                          onChange={(event) =>
                            updateDevelopmentForm(
                              "num_employees",
                              Number(event.target.value),
                            )
                          }
                        />
                      </label>

                      <label>
                        Gross Leasable Area (m²)
                        <input
                          type="number"
                          min="0"
                          value={developmentForm.gross_leasable_area_sqm}
                          onChange={(event) =>
                            updateDevelopmentForm(
                              "gross_leasable_area_sqm",
                              Number(event.target.value),
                            )
                          }
                        />
                      </label>
                    </>
                  )}

                  {/* =================================================
                      MIXED USE
                  ================================================= */}

                  {developmentForm.development_type === "mixed_use" && (
                    <>
                      <label>
                        Number of Units
                        <input
                          type="number"
                          min="0"
                          value={developmentForm.num_units}
                          onChange={(event) =>
                            updateDevelopmentForm(
                              "num_units",
                              Number(event.target.value),
                            )
                          }
                        />
                      </label>

                      <label>
                        Number of Residents
                        <input
                          type="number"
                          min="0"
                          value={developmentForm.num_residents}
                          onChange={(event) =>
                            updateDevelopmentForm(
                              "num_residents",
                              Number(event.target.value),
                            )
                          }
                        />
                      </label>

                      <label>
                        Number of Employees
                        <input
                          type="number"
                          min="0"
                          value={developmentForm.num_employees}
                          onChange={(event) =>
                            updateDevelopmentForm(
                              "num_employees",
                              Number(event.target.value),
                            )
                          }
                        />
                      </label>
                    </>
                  )}

                  {/* =================================================
                      GROSS FLOOR AREA
                  ================================================= */}

                  <label>
                    Gross Floor Area (m²)
                    <input
                      type="number"
                      min="0"
                      value={developmentForm.gross_floor_area_sqm}
                      onChange={(event) =>
                        updateDevelopmentForm(
                          "gross_floor_area_sqm",
                          Number(event.target.value),
                        )
                      }
                    />
                  </label>

                  {/* LOCATION */}

                  <div className="property">
                    <span>Selected Location</span>

                    <strong>
                      {developmentLocation.latitude.toFixed(6)},{" "}
                      {developmentLocation.longitude.toFixed(6)}
                    </strong>
                  </div>
                </div>
              )}
            </div>

           {/* =================================================
                  ACTION BUTTON
              ================================================= */}

              <div style={{ display: "flex", gap: "10px" }}>
                {developmentMode && developmentLocation && (
                  <button
                    className="secondary-button"
                    onClick={handleCreateDevelopment}
                  >
                    Create Development
                  </button>
                )}

                {selectedDevelopment && !developmentMode && (
                  <span style={{ display: "none" }}>
                    Delete Development
                  </span>
                )}

                {!developmentMode && !selectedDevelopment && (
                  <button
                    className="secondary-button"
                    onClick={() => {
                      setDevelopmentMode(true);
                      setDevelopmentLocation(null);
                    }}
                  >
                    Add Development
                  </button>
                )}
              </div>
                        </section>
                      </section>
                    </main>
                  </div>
                );
              }

export default App;