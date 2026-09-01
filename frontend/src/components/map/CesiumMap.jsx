import { useEffect, useRef, useState, useCallback } from "react";

import {
  Viewer,
  Ion,
  OpenStreetMapImageryProvider,
  ImageryLayer,
  Cartesian3,
  Math as CesiumMath,
  Color,
  ScreenSpaceEventType,
  createOsmBuildingsAsync,
  HeightReference,
} from "cesium";

import "cesium/Build/Cesium/Widgets/widgets.css";
import "./CesiumMap.css";

import spatialData from "../../data/spatialFeatures.json";

// =========================================================
// CESIUM ION AUTHENTICATION
//
// The token is read from VITE_CESIUM_ION_TOKEN in .env.
// Without a valid token the OSM Buildings 3D Tiles will not
// load, but the basemap and local spatialFeatures data will
// continue to work normally.
// =========================================================

const CESIUM_ION_TOKEN = import.meta.env.VITE_CESIUM_ION_TOKEN || "";

if (CESIUM_ION_TOKEN) {
  Ion.defaultAccessToken = CESIUM_ION_TOKEN;
} else {
  console.warn(
    "[CesiumMap] VITE_CESIUM_ION_TOKEN is not set. " +
      "OSM Buildings 3D Tiles will not load. " +
      "Add a valid token to frontend/.env to enable them.",
  );
}

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

const MAX_AUTO_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 2000;

function CesiumMap({
  onBuildingSelect,
  onRoadSelect,
  onMapLocationSelect,
  onDevelopmentSelect,
  onTrafficDataLoaded,
  developmentMode,
  proposedDevelopment,
  scenarioImpact,
  layerVisibility,
}) {
  const containerRef = useRef(null);
  const viewerRef = useRef(null);

  const buildingSelectRef = useRef(onBuildingSelect);
  const roadSelectRef = useRef(onRoadSelect);
  const mapLocationSelectRef = useRef(onMapLocationSelect);
  const developmentSelectRef = useRef(onDevelopmentSelect);
  const trafficDataLoadedRef = useRef(onTrafficDataLoaded);

  const [trafficData, setTrafficData] = useState({});
  const [trafficLoading, setTrafficLoading] = useState(true);
  const [trafficError, setTrafficError] = useState(null);
  const [trafficLoaded, setTrafficLoaded] = useState(false);
  const [trafficRoadCount, setTrafficRoadCount] = useState(0);

  const retryTimeoutRef = useRef(null);
  const cancelledRef = useRef(false);
  const attemptsRef = useRef(0);

  const developmentModeRef = useRef(developmentMode);
  const scenarioImpactRef = useRef(scenarioImpact);
  const layerVisibilityRef = useRef(layerVisibility);
  const osmBuildingsRef = useRef(null);

  // =========================================================
  // KEEP CALLBACK REFERENCES UP TO DATE
  // =========================================================

  useEffect(() => {
    buildingSelectRef.current = onBuildingSelect;

    roadSelectRef.current = onRoadSelect;

    mapLocationSelectRef.current = onMapLocationSelect;

    developmentSelectRef.current = onDevelopmentSelect;

    trafficDataLoadedRef.current = onTrafficDataLoaded;

    developmentModeRef.current = developmentMode;

    scenarioImpactRef.current = scenarioImpact;

    layerVisibilityRef.current = layerVisibility;
  }, [onBuildingSelect, onRoadSelect, onMapLocationSelect, onDevelopmentSelect, developmentMode, scenarioImpact, layerVisibility]);

  // =========================================================
  // LAYER TOGGLE EFFECT
  // =========================================================

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !layerVisibility) return;

    viewer.entities.values.forEach((entity) => {
      const type = entity.properties?.type?.getValue?.();
      if (type === "building" && layerVisibility.buildings !== undefined) {
        entity.show = layerVisibility.buildings;
      } else if (type === "road" && layerVisibility.roads !== undefined) {
        entity.show = layerVisibility.roads;
      }
    });

    const osmTileset = osmBuildingsRef.current;
    if (osmTileset && layerVisibility.buildings !== undefined) {
      osmTileset.show = layerVisibility.buildings;
    }
  }, [layerVisibility]);

  // =========================================================
  // FETCH TRAFFIC DATA
  // =========================================================

  const fetchTraffic = useCallback(async () => {
    if (cancelledRef.current) {
      return;
    }

    setTrafficLoading(true);
    setTrafficError(null);

    try {
      const response = await fetch(
        `${API_BASE}/api/v1/traffic/baseline/all`,
      );

      if (!response.ok) {
        throw new Error(`Traffic request failed: ${response.status}`);
      }

      const data = await response.json();

      if (cancelledRef.current) {
        return;
      }

      const lookup = {};

      for (const road of data.roads || []) {
        lookup[String(road.osm_way_id)] = road;
      }

      const count = Object.keys(lookup).length;

      setTrafficData(lookup);
      setTrafficRoadCount(count);
      setTrafficLoaded(true);
      setTrafficError(null);
      attemptsRef.current = 0;

      if (trafficDataLoadedRef.current) {
        trafficDataLoadedRef.current(lookup);
      }

      console.log(`Loaded traffic data for ${count} OSM roads.`);
    } catch (error) {
      if (cancelledRef.current) {
        return;
      }

      console.error("Failed to load traffic data:", error);

      attemptsRef.current += 1;

      if (attemptsRef.current < MAX_AUTO_RETRIES) {
        const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attemptsRef.current - 1);

        console.log(
          `Retrying traffic fetch in ${delay}ms (attempt ${attemptsRef.current + 1}/${MAX_AUTO_RETRIES})`,
        );

        retryTimeoutRef.current = setTimeout(() => {
          if (!cancelledRef.current) {
            fetchTraffic();
          }
        }, delay);
      } else {
        setTrafficLoading(false);
        setTrafficError(
          "Traffic data unavailable. Check that the backend is running.",
        );
        setTrafficLoaded(false);
      }
    }
  }, []);

  const handleManualRetry = useCallback(() => {
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }

    attemptsRef.current = 0;
    fetchTraffic();
  }, [fetchTraffic]);

  // =========================================================
  // LOAD TRAFFIC ON MOUNT
  // =========================================================

  useEffect(() => {
    cancelledRef.current = false;
    attemptsRef.current = 0;

    fetchTraffic();

    return () => {
      cancelledRef.current = true;

      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
    };
  }, [fetchTraffic]);

  // =========================================================
  // UPDATE ROAD COLORS AFTER TRAFFIC LOADS
  // =========================================================

  useEffect(() => {
    if (!viewerRef.current) {
      return;
    }

    const viewer = viewerRef.current;

    viewer.entities.values.forEach((entity) => {
      if (entity.properties?.type?.getValue() !== "road") {
        return;
      }

      const entityId = String(entity.id);

      const osmWayId = entityId.replace("way_", "");

      const traffic = trafficData[osmWayId];

      if (!traffic) {
        return;
      }

      if (entity.polyline) {
        entity.polyline.material = getTrafficColor(traffic.congestion_percent);
      }
    });
  }, [trafficData]);

  // =========================================================
  // SCENARIO IMPACT COLORING
  //
  // When a simulation result exists, affected roads receive
  // scenario-impact visualization.  Unaffected roads keep
  // their baseline traffic color.
  // =========================================================

  useEffect(() => {
    if (!viewerRef.current) {
      return;
    }

    const viewer = viewerRef.current;

    // -------------------------------------------------------
    // Build way-level impact lookup from stage4 road_assessments.
    //
    // Backend road_ids are segment-level: osm_543053794_0
    // Cesium entity IDs are way-level:   way_543053794
    //
    // When multiple segments map to the same way we keep
    // the worst severity.
    // -------------------------------------------------------

    const SEVERITY_RANK = { LOW: 0, MODERATE: 1, HIGH: 2, CRITICAL: 3 };

    const wayImpact = {};

    const assessments = scenarioImpact?.road_assessments || [];

    for (const a of assessments) {
      const rawId = a.road_id || "";

      // Strip "osm_" prefix and segment suffix: osm_543053794_0 -> 543053794
      const match = rawId.match(/^osm_(\d+)/);

      if (!match) {
        continue;
      }

      const wayId = match[1];
      const sev = a.impact_severity || "LOW";
      const rank = SEVERITY_RANK[sev] ?? 0;

      if (!wayImpact[wayId] || rank > SEVERITY_RANK[wayImpact[wayId].severity]) {
        wayImpact[wayId] = {
          severity: sev,
          scenario_vc: a.scenario_vc || 0,
          delta_traffic: a.delta_traffic_veh_h || 0,
        };
      }
    }

    const hasScenario = assessments.length > 0;

    // -------------------------------------------------------
    // Update road entity colors
    // -------------------------------------------------------

    viewer.entities.values.forEach((entity) => {
      if (entity.properties?.type?.getValue() !== "road") {
        return;
      }

      const entityId = String(entity.id);
      const osmWayId = entityId.replace("way_", "");

      let color;

      if (hasScenario && wayImpact[osmWayId]) {
        // Affected road — use scenario impact color
        color = getScenarioImpactColor(wayImpact[osmWayId].severity);
      } else {
        // Unaffected or no scenario — use baseline traffic color
        const traffic = trafficData[osmWayId];
        color = traffic
          ? getTrafficColor(traffic.congestion_percent)
          : getRoadColor(
              entity.properties?.highway?.getValue() || "default",
            );
      }

      if (entity.polyline) {
        entity.polyline.material = color;
      }
    });
  }, [scenarioImpact, trafficData]);

  // =========================================================
  // INITIALIZE CESIUM VIEWER
  // =========================================================

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const viewer = new Viewer(containerRef.current, {
      baseLayer: new ImageryLayer(
        new OpenStreetMapImageryProvider({
          url: "https://tile.openstreetmap.org/",
        }),
      ),

      baseLayerPicker: false,
      animation: false,
      timeline: false,
      geocoder: false,
      homeButton: false,
      sceneModePicker: false,
      navigationHelpButton: false,
      fullscreenButton: false,
      infoBox: false,
      selectionIndicator: false,
    });

    viewerRef.current = viewer;

    // =======================================================
    // CAMERA — fetch config from backend, fallback to defaults
    // =======================================================

    const fallbackCamera = {
      destination: Cartesian3.fromDegrees(31.75, 30.01, 12000),
      orientation: {
        heading: CesiumMath.toRadians(0),
        pitch: CesiumMath.toRadians(-45),
        roll: 0,
      },
    };

    const applyCamera = (config) => {
      const lat = config.center?.latitude ?? 30.01;
      const lon = config.center?.longitude ?? 31.75;
      const height = config.center?.height ?? 12000;
      const heading = config.default_heading ?? 0;
      const pitch = config.default_pitch ?? -45;

      viewer.camera.setView({
        destination: Cartesian3.fromDegrees(lon, lat, height),
        orientation: {
          heading: CesiumMath.toRadians(heading),
          pitch: CesiumMath.toRadians(pitch),
          roll: 0,
        },
      });
    };

    fetch(`${API_BASE}/api/v1/map/config`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then(applyCamera)
      .catch(() => {
        viewer.camera.setView(fallbackCamera);
      });

    // =======================================================
    // BUILDINGS + ROADS
    //
    // Suspend entity collection events during bulk creation so
    // that collectionChanged fires once at the end instead of
    // 3,567 times (one per add).  This lets Cesium batch the
    // scene update work.
    // =======================================================

    viewer.entities.suspendEvents();

    try {
      // =======================================================
      // BUILDINGS
      // =======================================================

      spatialData.buildings.forEach((building) => {
        const positions = [];

        building.coordinates.forEach(([lat, lon]) => {
          positions.push(Cartesian3.fromDegrees(lon, lat));
        });

        if (positions.length < 3) {
          return;
        }

        const height = Math.max(8, Math.min(40, building.radius * 1.2));

        viewer.entities.add({
          id: building.id,

          name: building.name || `Building ${building.id.replace("bldg_", "")}`,

          polygon: {
            hierarchy: positions,

            height: 0,

            extrudedHeight: height,

            material: Color.fromCssColorString("#64748b").withAlpha(0.85),

            outline: true,

            outlineColor: Color.fromCssColorString("#cbd5e1"),
          },

          properties: {
            type: "building",

            buildingType: building.building,

            name: building.name,

            centroid: building.centroid,

            radius: building.radius,
          },
        });
      });

      // =======================================================
      // OSM BUILDINGS (3D Tiles)
      //
      // Requires a valid Cesium Ion access token. If the token
      // is missing or the request fails, a warning is logged
      // and the rest of the map continues to work.
      // =======================================================

      if (!CESIUM_ION_TOKEN) {
        console.warn(
          "[CesiumMap] Skipping OSM Buildings load — no Ion token configured.",
        );
      } else {
        createOsmBuildingsAsync({
            heightReference: HeightReference.CLAMP_TO_GROUND,
          })
          .then((tileset) => {
            if (viewer.isDestroyed()) {
              return;
            }

            osmBuildingsRef.current = tileset;
            viewer.scene.primitives.add(tileset);

            const vis = layerVisibilityRef.current;
            if (vis && vis.buildings === false) {
              tileset.show = false;
            }

            console.log("[CesiumMap] OSM Buildings 3D Tiles loaded successfully.");
          })
          .catch((error) => {
            console.error("[CesiumMap] Failed to load OSM Buildings 3D Tiles:", error);
          });
      }

      // =======================================================
      // ROADS
      // =======================================================

      spatialData.roads.forEach((road) => {
        const positions = [];

        road.coordinates.forEach(([lat, lon]) => {
          positions.push(Cartesian3.fromDegrees(lon, lat, 2));
        });

        if (positions.length < 2) {
          return;
        }

        const osmWayId = String(road.id.replace("way_", ""));

        const traffic = trafficData[osmWayId];

        const initialColor = traffic
          ? getTrafficColor(traffic.congestion_percent)
          : getRoadColor(road.highway);

        viewer.entities.add({
          id: road.id,

          name: road.name || `Road ${road.id.replace("way_", "")}`,

          polyline: {
            positions,

            width: getRoadWidth(road.highway),

            material: initialColor,

            clampToGround: true,
          },

          properties: {
            type: "road",

            highway: road.highway,

            name: road.name,

            osmWayId: osmWayId,
          },
        });
      });
    } finally {
      viewer.entities.resumeEvents();
    }

    // =======================================================
    // MAP SELECTION
    // =======================================================

    const handler = viewer.screenSpaceEventHandler;

    handler.setInputAction((movement) => {
      const picked = viewer.scene.pick(movement.position);
      // Select a proposed development when clicked
      if (
        picked &&
        picked.id &&
        picked.id.properties &&
        picked.id.properties.type &&
        picked.id.properties.type.getValue() ===
          "proposed-development"
      ) {
        const developmentId =
          picked.id.properties.development_id?.getValue();

        console.log(
          "Selected proposed development:",
          developmentId
        );

        if (developmentSelectRef.current) {
          developmentSelectRef.current(developmentId);
        }

        return;
      }

      // ===================================================
      // NOTHING SELECTED
      // ===================================================

      if (!picked || !picked.id) {
        viewer.selectedEntity = undefined;

        if (developmentModeRef.current) {
          const ray = viewer.camera.getPickRay(movement.position);

          const cartesian = viewer.scene.globe.pick(ray, viewer.scene);

          if (cartesian && mapLocationSelectRef.current) {
            const cartographic =
              viewer.scene.globe.ellipsoid.cartesianToCartographic(cartesian);

            const latitude = CesiumMath.toDegrees(cartographic.latitude);

            const longitude = CesiumMath.toDegrees(cartographic.longitude);

            mapLocationSelectRef.current({
              latitude,
              longitude,
            });
          }
        }

        return;
      }

      const entity = picked.id;

      // ===================================================
      // BUILDING SELECTION
      // ===================================================

      if (entity.properties?.type?.getValue() === "building") {
        viewer.selectedEntity = entity;

        const building = spatialData.buildings.find(
          (item) => item.id === entity.id,
        );

        if (building && buildingSelectRef.current) {
          buildingSelectRef.current(building);
        }

        return;
      }

      // ===================================================
      // ROAD SELECTION
      // ===================================================

      if (entity.properties?.type?.getValue() === "road") {
        viewer.selectedEntity = entity;

        const road = spatialData.roads.find((item) => item.id === entity.id);

        if (road && roadSelectRef.current) {
          const osmWayId = String(road.id.replace("way_", ""));

          const traffic = trafficData[osmWayId] || null;

          roadSelectRef.current({
            ...road,

            traffic,

            osm_way_id: Number(osmWayId),
          });
        }

        return;
      }

      // ===================================================
      // PROPOSED DEVELOPMENT SELECTION
      // ===================================================

      if (
        entity.properties?.type?.getValue() ===
        "proposed-development"
      ) {
        viewer.selectedEntity = entity;

        const developmentId =
          entity.properties.development_id?.getValue();

        console.log(
          "Selected proposed development:",
          developmentId
        );

        if (developmentSelectRef.current) {
          developmentSelectRef.current(developmentId);
        }

        return;
      }
    }, ScreenSpaceEventType.LEFT_CLICK);

    // =========================================================
    // CLEANUP
    // =========================================================

    return () => {
      if (!viewer.isDestroyed()) {
        viewer.destroy();
      }

      viewerRef.current = null;
      osmBuildingsRef.current = null;
    };
  }, []);

  // =========================================================
  // PROPOSED DEVELOPMENT
  //
  // This effect runs whenever App.jsx creates/updates
  // proposedDevelopment.
  // =========================================================

  useEffect(() => {
    console.log("PROPOSED DEVELOPMENT EFFECT:", proposedDevelopment);

    const viewer = viewerRef.current;

    if (!viewer) {
      return;
    }

    // -------------------------------------------------------
    // REMOVE PROPOSED DEVELOPMENT WHEN CLEARED
    // -------------------------------------------------------

    if (!proposedDevelopment) {
      const proposedEntities = viewer.entities.values.filter(
        (entity) =>
          entity.properties?.type?.getValue() ===
          "proposed-development",
      );

      proposedEntities.forEach((entity) => {
        viewer.entities.remove(entity);
      });

      viewer.selectedEntity = undefined;

      console.log(
        "All proposed development entities removed from map.",
      );

      return;
    }

    const developmentId =
      proposedDevelopment.development_id || `dev_${Date.now()}`;

    const entityId = `proposed-${developmentId}`;

    // -------------------------------------------------------
    // REMOVE PREVIOUS VERSION
    // -------------------------------------------------------

    const existingEntity = viewer.entities.getById(entityId);

    if (existingEntity) {
      viewer.entities.remove(existingEntity);
    }

    // -------------------------------------------------------
    // COORDINATES
    // -------------------------------------------------------

    const latitude = Number(proposedDevelopment.latitude);

    const longitude = Number(proposedDevelopment.longitude);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      console.warn(
        "Invalid proposed development coordinates:",
        proposedDevelopment,
      );

      return;
    }

    // -------------------------------------------------------
    // FLOORS / HEIGHT
    // -------------------------------------------------------

    const floors = Math.max(1, Number(proposedDevelopment.floors || 1));

    const height = floors * 3.2;

    // -------------------------------------------------------
    // FOOTPRINT
    //
    // Derive the building footprint from GFA and floors.
    //
    // GFA = total gross floor area
    // footprint = GFA / number of floors
    // -------------------------------------------------------

    const properties = proposedDevelopment.properties || {};

    const grossFloorArea = Math.max(
      1,
      Number(
        properties.gross_floor_area_sqm ||
          proposedDevelopment.gross_floor_area_sqm ||
          900,
      ),
    );

    const footprintArea = grossFloorArea / floors;

    // Keep the building proportion reasonably realistic.
    // Width is slightly larger than depth rather than
    // forcing every building to be a square.

    const aspectRatio = 1.25;

    const footprintWidth = Math.sqrt(footprintArea * aspectRatio);

    const footprintDepth = footprintWidth / aspectRatio;

    // -------------------------------------------------------
    // BUILDING ENTITY
    //
    // Cesium boxes are centered vertically around their
    // position. Therefore we put the center at height / 2
    // so the bottom sits on the terrain.
    // -------------------------------------------------------

    const entity = viewer.entities.add({
      id: entityId,

      name: proposedDevelopment.name || "Proposed Development",

      position: Cartesian3.fromDegrees(longitude, latitude, height / 2),

      box: {
        dimensions: new Cartesian3(footprintWidth, footprintDepth, height),

        material: Color.fromCssColorString("#38bdf8").withAlpha(0.35),

        outline: true,

        outlineColor: Color.fromCssColorString("#7dd3fc").withAlpha(0.9),
      },

      properties: {
        type: "proposed-development",

        development_id: developmentId,

        development_type: proposedDevelopment.development_type,

        name: proposedDevelopment.name || "Proposed Development",

        floors,

        height,

        latitude,

        longitude,
      },
    });

    console.log("Proposed development rendered:", proposedDevelopment);

    // -------------------------------------------------------
    // MOVE CAMERA TO NEW DEVELOPMENT
    // -------------------------------------------------------

    viewer.flyTo(entity, {
      duration: 1.5,
      offset: {
        heading: CesiumMath.toRadians(0),

        pitch: CesiumMath.toRadians(-35),

        range: 150,
      },
    });
  }, [proposedDevelopment]);

  // =========================================================
  // TRAFFIC STATUS INDICATOR
  // =========================================================

  let statusContent;

  if (trafficLoading) {
    statusContent = (
      <div className="traffic-status traffic-status--loading">
        <span className="traffic-status__dot traffic-status__dot--pulse" />
        Loading traffic data...
      </div>
    );
  } else if (trafficLoaded) {
    statusContent = (
      <div className="traffic-status traffic-status--ok">
        <span className="traffic-status__dot traffic-status__dot--green" />
        Traffic data loaded · {trafficRoadCount.toLocaleString()} roads
      </div>
    );
  } else if (trafficError) {
    statusContent = (
      <div className="traffic-status traffic-status--error">
        <span className="traffic-status__dot traffic-status__dot--red" />
        {trafficError}
        <button
          className="traffic-status__retry"
          onClick={handleManualRetry}
        >
          Retry
        </button>
      </div>
    );
  }

  // =========================================================
  // SCENARIO LEGEND (only shown when simulation result exists)
  // =========================================================

  const impactAssessments = scenarioImpact?.road_assessments || [];
  const showLegend = impactAssessments.length > 0;

  let legendContent = null;

  if (showLegend) {
    const severityCounts = { CRITICAL: 0, HIGH: 0, MODERATE: 0, LOW: 0 };

    for (const a of impactAssessments) {
      const s = a.impact_severity || "LOW";
      if (s in severityCounts) {
        severityCounts[s]++;
      }
    }

    legendContent = (
      <div className="scenario-legend">
        <div className="scenario-legend__title">Scenario Impact</div>
        {severityCounts.CRITICAL > 0 && (
          <div className="scenario-legend__item">
            <span
              className="scenario-legend__swatch"
              style={{ background: "#dc2626" }}
            />
            Critical ({severityCounts.CRITICAL})
          </div>
        )}
        {severityCounts.HIGH > 0 && (
          <div className="scenario-legend__item">
            <span
              className="scenario-legend__swatch"
              style={{ background: "#f97316" }}
            />
            High ({severityCounts.HIGH})
          </div>
        )}
        {severityCounts.MODERATE > 0 && (
          <div className="scenario-legend__item">
            <span
              className="scenario-legend__swatch"
              style={{ background: "#eab308" }}
            />
            Moderate ({severityCounts.MODERATE})
          </div>
        )}
        {severityCounts.LOW > 0 && (
          <div className="scenario-legend__item">
            <span
              className="scenario-legend__swatch"
              style={{ background: "#22c55e" }}
            />
            Low ({severityCounts.LOW})
          </div>
        )}
        <div className="scenario-legend__item scenario-legend__item--muted">
          <span
            className="scenario-legend__swatch"
            style={{ background: "#64748b" }}
          />
          Unaffected
        </div>
      </div>
    );
  }

  // =========================================================
  // MAP CONTAINER + OVERLAY
  // =========================================================

  return (
    <div className="cesium-map-wrapper">
      <div ref={containerRef} className="cesium-map" />
      {statusContent}
      {legendContent}
    </div>
  );
}

// ===========================================================
// ROAD WIDTH
// ===========================================================

function getRoadWidth(highway) {
  switch (highway) {
    case "motorway":
    case "motorway_link":
      return 5;

    case "trunk":
    case "trunk_link":
      return 4;

    case "primary":
    case "primary_link":
      return 4;

    case "secondary":
    case "secondary_link":
      return 3;

    case "tertiary":
    case "tertiary_link":
      return 2.5;

    case "residential":
      return 2;

    case "service":
      return 1.5;

    case "construction":
      return 2;

    default:
      return 1.5;
  }
}

// ===========================================================
// ORIGINAL ROAD COLOR
// ===========================================================

function getRoadColor(highway) {
  switch (highway) {
    case "motorway":
    case "motorway_link":
      return Color.fromCssColorString("#f97316");

    case "trunk":
    case "trunk_link":
      return Color.fromCssColorString("#f59e0b");

    case "primary":
    case "primary_link":
      return Color.fromCssColorString("#eab308");

    case "secondary":
    case "secondary_link":
      return Color.fromCssColorString("#94a3b8");

    case "tertiary":
    case "tertiary_link":
      return Color.fromCssColorString("#64748b");

    case "construction":
      return Color.fromCssColorString("#ef4444");

    default:
      return Color.fromCssColorString("#475569");
  }
}

// ===========================================================
// TRAFFIC COLOR
//
// P50 = 5.56%
// P75 = 8.30%
// P90 = 11.25%
// MAX = 43.30%
// ===========================================================

function getTrafficColor(congestionPercent) {
  const value = Number(congestionPercent);

  if (!Number.isFinite(value)) {
    return Color.fromCssColorString("#64748b");
  }

  if (value < 5.5) {
    return Color.fromCssColorString("#22c55e");
  }

  if (value < 8.3) {
    return Color.fromCssColorString("#eab308");
  }

  if (value < 11.25) {
    return Color.fromCssColorString("#f97316");
  }

  return Color.fromCssColorString("#ef4444");
}

// ===========================================================
// SCENARIO IMPACT COLOR
//
// Backend severity levels:
//   CRITICAL, HIGH, MODERATE, LOW
// ===========================================================

function getScenarioImpactColor(severity) {
  switch (severity) {
    case "CRITICAL":
      return Color.fromCssColorString("#dc2626");

    case "HIGH":
      return Color.fromCssColorString("#f97316");

    case "MODERATE":
      return Color.fromCssColorString("#eab308");

    case "LOW":
      return Color.fromCssColorString("#22c55e");

    default:
      return Color.fromCssColorString("#64748b");
  }
}

export default CesiumMap;
