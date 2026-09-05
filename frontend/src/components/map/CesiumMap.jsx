import { useEffect, useRef } from "react";
import {
  Viewer,
  Ion,
  Terrain,
  Cartesian3,
  Cartographic,
  Math as CesiumMath,
  Color,
  ScreenSpaceEventType,
  ScreenSpaceEventHandler,
  HeightReference,
  Rectangle,
  Camera,
  ColorMaterialProperty,
  CustomDataSource,
  createOsmBuildingsAsync,
} from "cesium";

import "cesium/Build/Cesium/Widgets/widgets.css";
import "./CesiumMap.css";

import { SPATIAL_FEATURES, OSM_BOUNDS, PROJECT_CENTER, BASEMAPS, getProjectBounds } from "../../config/mapConfig.js";
import { useApp } from "../../store/AppContext.jsx";
import { CesiumMapApi } from "./CesiumMapApi.js";
import { render3DDevelopmentComplex } from "./development/Development3DRenderer.js";
import { findNearestValidPosition } from "./development/spatialValidation.js";
import { createSatelliteLayer, createGoogleRoadmapLayer } from "../../services/basemapService.js";
import {
  classifyBaselineTraffic,
  classifyScenarioRoadImpact,
  extractOsmWayId,
  pickMoreSevereScenarioAssessment,
} from "../../utils/trafficColors.js";

// Pre-configure Cesium's default view to the authoritative OSM project bounds
Camera.DEFAULT_VIEW_RECTANGLE = Rectangle.fromDegrees(
  OSM_BOUNDS.west,
  OSM_BOUNDS.south,
  OSM_BOUNDS.east,
  OSM_BOUNDS.north,
);

const CESIUM_ION_TOKEN = import.meta.env.VITE_CESIUM_ION_TOKEN || "";

if (CESIUM_ION_TOKEN) {
  Ion.defaultAccessToken = CESIUM_ION_TOKEN;
}

const COLOR_BY_HIGHWAY = {
  motorway: Color.fromCssColorString("#ff7a45"),
  trunk: Color.fromCssColorString("#e88a3a"),
  primary: Color.fromCssColorString("#d99a2b"),
  secondary: Color.fromCssColorString("#b0a048"),
  tertiary: Color.fromCssColorString("#95a06a"),
  residential: Color.fromCssColorString("#8aa0b0"),
  service: Color.fromCssColorString("#6a7686"),
  unclassified: Color.fromCssColorString("#6a7686"),
  construction: Color.fromCssColorString("#4a4a5a"),
};
const DEFAULT_ROAD_COLOR = Color.fromCssColorString("#6a7686");

const BOUNDARY_COLOR = Color.fromCssColorString("#38bdf8").withAlpha(0.9);
const BOUNDARY_FILL = Color.fromCssColorString("#38bdf8").withAlpha(0.05);

function roadColor(highway) {
  return COLOR_BY_HIGHWAY[highway] || DEFAULT_ROAD_COLOR;
}

function roadWidth(highway) {
  switch (highway) {
    case "motorway":
      return 3.4;
    case "trunk":
      return 3.0;
    case "primary":
      return 2.6;
    case "secondary":
      return 2.2;
    case "tertiary":
      return 2.0;
    case "residential":
      return 1.7;
    default:
      return 1.2;
  }
}

// Visual extrusion height for a building (compute-time only, never written
// back to spatialFeatures.json). Prefers the real OSM height when present,
// then the real floor count, then a footprint-derived visual default.
function buildingExtrudedHeight(building) {
  if (Number.isFinite(Number(building.height)) && Number(building.height) > 0) {
    return Math.max(4, Math.min(200, Number(building.height)));
  }
  if (Number.isFinite(building.levels) && building.levels > 0) {
    const h = building.levels * 3.2;
    return Math.max(8, Math.min(120, h));
  }
  return Math.max(8, Math.min(40, (building.radius || 20) * 1.2));
}

export function CesiumMap() {
  const containerRef = useRef(null);
  const viewerRef = useRef(null);
  const layerGroupsRef = useRef({});
  const activeBasemapLayerRef = useRef(null);
  const spatialReady = useRef(false);
  const didInitialFly = useRef(false);

  const { state, dispatch } = useApp();
  const basemap = state.map.basemap || BASEMAPS.SATELLITE;
  const layerVisibility = state.map.layerVisibility;
  const selectedLocation = state.map.selectedLocation;
  const developments = state.developments.items;
  const placedDev = state.development.placed;
  const selectedDev = state.developments.selected;
  const cityInfo = state.city.info;
  const trafficBaseline = state.traffic.baseline;
  const trafficScenario = state.traffic.scenario;
  const simulationResult = state.simulation.result;

  const developmentsRef = useRef(developments);
  const placedDevRef = useRef(placedDev);
  const layerVisibilityRef = useRef(layerVisibility);
  const trafficBaselineRef = useRef(trafficBaseline);
  const trafficScenarioRef = useRef(trafficScenario);
  const simulationResultRef = useRef(simulationResult);

  useEffect(() => {
    developmentsRef.current = developments;
    placedDevRef.current = placedDev;
    layerVisibilityRef.current = layerVisibility;
    trafficBaselineRef.current = trafficBaseline;
    trafficScenarioRef.current = trafficScenario;
    simulationResultRef.current = simulationResult;
  }, [developments, placedDev, layerVisibility, trafficBaseline, trafficScenario, simulationResult]);

  // ---- Init once ----
  useEffect(() => {
    if (!containerRef.current || viewerRef.current) return;

    // Reset per-viewer guards (StrictMode re-mounts effects in dev, and these
    // refs persist across the remount; they must reset for the new viewer).
    spatialReady.current = false;
    didInitialFly.current = false;

    const viewer = new Viewer(containerRef.current, {
      animation: false,
      timeline: false,
      baseLayerPicker: false,
      geocoder: false,
      homeButton: false,
      sceneModePicker: false,
      navigationHelpButton: false,
      fullscreenButton: false,
      infoBox: false,
      selectionIndicator: false,
      scene3DOnly: true,
      imageryProvider: false,
      requestRenderMode: true,
      targetFrameRate: 30,
      contextOptions: {
        webgl: {
          failIfMajorPerformanceCaveat: false,
        },
      },
    });

    viewer.scene.screenSpaceCameraController.maximumZoomDistance = 100000;
    viewer.scene.pickTranslucentDepth = true;

    // The globe's bare-ellipsoid fallback normally renders a flat blue surface
    // when imagery/terrain has not covered it yet. Give it a neutral dark base
    // that matches the command-center theme instead of the default blue.
    viewer.scene.globe.baseColor = Color.fromCssColorString("#2a3240");

    viewerRef.current = viewer;

    // Immediately position camera on the actual OSM project area on first frame
    flyToCityArea(viewer, null, 0);

    if (CESIUM_ION_TOKEN) {
      const terrainObj = Terrain.fromWorldTerrain();
      viewer.scene.setTerrain(terrainObj);
      const enableDepthTesting = () => {
        if (!viewer.isDestroyed()) {
          viewer.scene.globe.depthTestAgainstTerrain = true;
        }
      };
      if (terrainObj.ready) {
        enableDepthTesting();
      } else {
        terrainObj.readyEvent.addEventListener(enableDepthTesting);
      }

      createOsmBuildingsAsync()
        .then((tileset) => {
          if (viewer.isDestroyed()) return;
          viewer.scene.primitives.add(tileset);
        })
        .catch(() => {
          // basemap + local entities still work
        });
    }

    // ---- Location, Development, and Road selection ----
    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((click) => {
      const picked = viewer.scene.pick(click.position);
      if (picked && picked.id) {
        const entity = picked.id;

        // 1. Check if user clicked an existing or proposed development 3D entity
        const devId =
          entity.properties?.development_id?.getValue?.() ||
          entity.properties?.development_id ||
          (typeof entity.id === "string" && entity.id.startsWith("dev_")
            ? entity.id.split("_")[1]
            : null);

        if (devId) {
          const matchedDev =
            developmentsRef.current.find(
              (d) => (d.development_id || d.id) === devId
            ) ||
            (placedDevRef.current &&
            (placedDevRef.current.development_id || placedDevRef.current.id) === devId
              ? placedDevRef.current
              : null);

          if (matchedDev) {
            dispatch({
              type: "DEVELOPMENT_SELECTED",
              dev: matchedDev,
            });
            return;
          }
        }

        // 2. Check if user clicked a road entity
        if (entity.id && (String(entity.id).startsWith("way_") || entity.polyline)) {
          const props = entity.properties?.getValue ? entity.properties.getValue() : entity.properties;
          const wayId = props?.osm_way_id || extractOsmWayId(entity.id);
          const assessment = props?.trafficAssessment;
          const baseline = props?.baselineTraffic;

          dispatch({
            type: "MAP_ROAD_SELECTED",
            road: {
              id: entity.id,
              osm_way_id: wayId,
              name: entity.name || props?.road_name || `Road ${wayId}`,
              highway: props?.highway || "road",
              lanes: props?.lanes,
              maxspeed: props?.maxspeed,
              trafficAssessment: assessment,
              baselineTraffic: baseline,
              trafficStatus: props?.trafficStatus,
            },
          });
          return;
        }
      }

      // 3. Normal location click
      const ray = viewer.camera.getPickRay(click.position);
      if (!ray) return;
      let cartesian = viewer.scene.globe.pick(ray, viewer.scene);
      if (!cartesian) {
        cartesian = viewer.scene.pickPosition(click.position);
      }
      if (!cartesian) return;
      const carto = Cartographic.fromCartesian(cartesian);
      const latitude = CesiumMath.toDegrees(carto.latitude);
      const longitude = CesiumMath.toDegrees(carto.longitude);

      // Validate and adapt location if clicked on a road or existing structure
      const validPos = findNearestValidPosition(latitude, longitude, SPATIAL_FEATURES, 80, 6);
      const targetLat = validPos ? validPos.lat : latitude;
      const targetLon = validPos ? validPos.lon : longitude;

      dispatch({
        type: "MAP_LOCATION_SELECTED",
        location: {
          latitude: targetLat,
          longitude: targetLon,
          name: validPos?.adjusted ? "Selected Location (Auto-Adjusted)" : "Selected Location",
          adjusted: Boolean(validPos?.adjusted),
        },
      });
    }, ScreenSpaceEventType.LEFT_CLICK);

    CesiumMapApi.register({
      flyToCity: () => flyToCityArea(viewer, cityInfo),
    });

    return () => {
      CesiumMapApi.unregister();
      try {
        handler.destroy();
      } catch {
        // no-op
      }
      if (viewerRef.current) {
        viewerRef.current.destroy();
        viewerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Switch basemap imagery layer without touching entities or camera ----
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    let isCancelled = false;

    async function applyBasemap() {
      const resultLayer =
        basemap === BASEMAPS.GOOGLE_ROADMAP
          ? (await createGoogleRoadmapLayer()).layer
          : createSatelliteLayer(Boolean(CESIUM_ION_TOKEN));

      if (isCancelled || !viewerRef.current || viewerRef.current.isDestroyed()) {
        try {
          if (resultLayer && !resultLayer.isDestroyed?.()) {
            resultLayer.destroy?.();
          }
        } catch {
          // no-op
        }
        return;
      }

      // Remove existing basemap layer safely
      if (activeBasemapLayerRef.current && viewer.imageryLayers.contains(activeBasemapLayerRef.current)) {
        viewer.imageryLayers.remove(activeBasemapLayerRef.current, true);
      }

      viewer.imageryLayers.add(resultLayer, 0);
      activeBasemapLayerRef.current = resultLayer;
      viewer.scene.requestRender();
    }

    applyBasemap();

    return () => {
      isCancelled = true;
    };
  }, [basemap]);

  // ---- Render OSM buildings + roads once ----
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || spatialReady.current) return;
    spatialReady.current = true;

    viewer.entities.suspendEvents();
    try {
      buildRoads(viewer, layerGroupsRef, trafficBaselineRef.current, trafficScenarioRef.current);
      buildBuildings(viewer, layerGroupsRef);
      buildOsmBoundaries(viewer, layerGroupsRef);
    } finally {
      viewer.entities.resumeEvents();
    }
  }, []);

  // ---- Update road traffic materials without rebuilding datasource ----
  useEffect(() => {
    const roadsGroup = layerGroupsRef.current.roads;
    const viewer = viewerRef.current;
    if (!roadsGroup || !viewer) return;
    updateRoadTrafficVisuals(roadsGroup, trafficBaseline, trafficScenario, viewer);
  }, [trafficBaseline, trafficScenario]);

  // ---- Render project boundary (static, based on city metadata) ----
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    renderBoundary(viewer, cityInfo, layerGroupsRef);
  }, [cityInfo]);

  // ---- Fly to project area when metadata arrives ----
  useEffect(() => {
    if (!viewerRef.current || !cityInfo || didInitialFly.current) return;
    flyToCityArea(viewerRef.current, cityInfo);
    didInitialFly.current = true;
    dispatch({ type: "MAP_VIEWER_READY" });
  }, [cityInfo, dispatch]);

  // ---- Apply layer visibility ----
  useEffect(() => {
    const setVisible = (key, visible) => {
      const group = layerGroupsRef.current[key];
      if (group) group.show = visible;
    };
    setVisible("roads", layerVisibility.roads);
    setVisible("buildings", layerVisibility.buildings);
    setVisible("boundary", layerVisibility.projectBoundary);
    setVisible("osmBoundaries", layerVisibility.osmBoundaries);
    setVisible("developments", layerVisibility.developments);
    if (viewerRef.current && !viewerRef.current.isDestroyed()) {
      viewerRef.current.scene.requestRender();
    }
  }, [layerVisibility]);

  // ---- Render developments ----
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    const old = layerGroupsRef.current.developments;
    if (old) viewer.dataSources.remove(old);

    const group = new CustomDataSource("Developments");
    group.show = Boolean(layerVisibilityRef.current?.developments);
    viewer.dataSources.add(group);
    layerGroupsRef.current.developments = group;

    developments.forEach((dev) => {
      if (dev.latitude == null || dev.longitude == null) return;
      const isProposed = Boolean(placedDev && dev.development_id === placedDev.development_id);
      render3DDevelopmentComplex(dev, group, isProposed, SPATIAL_FEATURES);
    });

    viewer.scene.requestRender();
  }, [developments, placedDev]);

  // ---- Render selected location marker ----
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    renderSelectedMarker(viewer, selectedLocation, placedDev, selectedDev);
    viewer.scene.requestRender();
  }, [selectedLocation, placedDev, selectedDev]);

  return (
    <div className="cesium-container">
      <div className="cesium-canvas" ref={containerRef} />
    </div>
  );
}

// ============ Builders ============

function flyToCityArea(viewer, _info, duration = 2.0) {
  if (!viewer || viewer.isDestroyed()) return;
  const lon = PROJECT_CENTER.longitude; // 31.75489° E
  const lat = PROJECT_CENTER.latitude;  // 30.02374° N
  const height = 5000;

  viewer.camera.flyTo({
    destination: Cartesian3.fromDegrees(lon, lat, height),
    orientation: {
      heading: CesiumMath.toRadians(0),
      pitch: CesiumMath.toRadians(-48),
      roll: 0,
    },
    duration,
  });
}

function buildRoads(viewer, layerGroupsRef, baselineTraffic, scenarioTraffic) {
  const group = new CustomDataSource("Roads");
  viewer.dataSources.add(group);
  layerGroupsRef.current.roads = group;
  const entities = group.entities;

  SPATIAL_FEATURES.roads.forEach((road) => {
    if (!road.coordinates || road.coordinates.length < 2) return;
    const positions = Cartesian3.fromDegreesArray(
      road.coordinates.flatMap(([lat, lon]) => [lon, lat])
    );
    const initialWidth = roadWidth(road.highway);
    const initialColor = roadColor(road.highway);
    const osmWayId = road.osm_way_id || extractOsmWayId(road.id);

    entities.add({
      id: road.id,
      name: road.name_en || road.name || `Road ${osmWayId}`,
      properties: {
        id: road.id,
        osm_way_id: osmWayId,
        highway: road.highway,
        road_name: road.name_en || road.name || "",
        lanes: road.lanes,
        maxspeed: road.maxspeed,
        baseWidth: initialWidth,
        trafficAssessment: null,
        baselineTraffic: null,
        trafficStatus: null,
      },
      polyline: {
        positions,
        width: initialWidth,
        material: new ColorMaterialProperty(initialColor),
        clampToGround: true,
      },
    });
  });

  // Apply initial traffic materials if data is already present
  updateRoadTrafficVisuals(group, baselineTraffic, scenarioTraffic, viewer);
}

function updateRoadTrafficVisuals(roadsGroup, baselineRoads, scenarioAssessments, viewer) {
  if (!roadsGroup) return;

  const isScenarioActive = Array.isArray(scenarioAssessments) && scenarioAssessments.length > 0;

  // 1. Build lookup map for scenario results with authoritative worst-segment selection
  const scenarioMap = new Map();
  if (isScenarioActive) {
    scenarioAssessments.forEach((r) => {
      const wayId = extractOsmWayId(r.road_id);
      if (!wayId) return;
      const existing = scenarioMap.get(wayId);
      scenarioMap.set(wayId, pickMoreSevereScenarioAssessment(existing, r));
    });
  }

  // 2. Build lookup map for baseline results
  const baselineMap = new Map();
  if (Array.isArray(baselineRoads)) {
    baselineRoads.forEach((r) => {
      const wayId = extractOsmWayId(r.osm_way_id);
      baselineMap.set(wayId, r);
    });
  }

  let matchedBaselineCount = 0;
  let matchedScenarioCount = 0;
  let sampleLogged = false;

  const entities = roadsGroup.entities.values;
  roadsGroup.entities.suspendEvents();
  try {
    for (let i = 0; i < entities.length; i++) {
      const entity = entities[i];
      const props = entity.properties?.getValue ? entity.properties.getValue() : entity.properties;
      const wayId = props?.osm_way_id || extractOsmWayId(entity.id);
      const highway = props?.highway;
      const baseW = props?.baseWidth || roadWidth(highway);

      if (isScenarioActive) {
        const scenRecord = scenarioMap.get(wayId);
        if (scenRecord) {
          matchedScenarioCount++;
          const baseRecord = baselineMap.get(wayId);
          const impact = classifyScenarioRoadImpact(scenRecord, baseRecord);
          entity.polyline.material = new ColorMaterialProperty(impact.color);
          entity.polyline.width = impact.isHighlighted ? Math.max(baseW * 1.6, 3.2) : baseW;
          if (entity.properties) {
            entity.properties.trafficAssessment = scenRecord;
            entity.properties.trafficStatus = impact.label;
          }

          if (!sampleLogged) {
            sampleLogged = true;
            console.log("[Traffic Diagnostic] Scenario Matched Road:", {
              osmId: wayId,
              baselineVc: scenRecord.baseline_vc,
              scenarioVc: scenRecord.scenario_vc,
              deltaVc: scenRecord.vc_change,
              classification: impact.label,
              cesiumColor: impact.hex,
              width: entity.polyline.width,
            });
          }
        } else {
          // Road unaffected in scenario: color by baseline if available, or default
          const baseRecord = baselineMap.get(wayId);
          if (baseRecord) {
            matchedBaselineCount++;
            const vc = Number(
              baseRecord.congestion_ratio ??
              (baseRecord.traffic_volume / Math.max(baseRecord.road_capacity_proxy, 1))
            );
            const traffic = classifyBaselineTraffic(vc);
            entity.polyline.material = new ColorMaterialProperty(traffic.color);
          } else {
            entity.polyline.material = new ColorMaterialProperty(roadColor(highway));
          }
          entity.polyline.width = baseW;
          if (entity.properties) {
            entity.properties.trafficAssessment = null;
            entity.properties.trafficStatus = "Unaffected";
          }
        }
      } else if (baselineMap.size > 0) {
        const baseRecord = baselineMap.get(wayId);
        if (baseRecord) {
          matchedBaselineCount++;
          const vc = Number(
            baseRecord.congestion_ratio ??
            (baseRecord.traffic_volume / Math.max(baseRecord.road_capacity_proxy, 1))
          );
          const traffic = classifyBaselineTraffic(vc);
          entity.polyline.material = new ColorMaterialProperty(traffic.color);
          if (entity.properties) {
            entity.properties.baselineTraffic = baseRecord;
            entity.properties.trafficStatus = traffic.label;
          }

          if (!sampleLogged) {
            sampleLogged = true;
            console.log("[Traffic Diagnostic] Baseline Matched Road:", {
              osmId: wayId,
              baselineVc: vc,
              classification: traffic.label,
              cesiumColor: traffic.hex,
              width: baseW,
            });
          }
        } else {
          entity.polyline.material = new ColorMaterialProperty(roadColor(highway));
        }
        entity.polyline.width = baseW;
      } else {
        entity.polyline.material = new ColorMaterialProperty(roadColor(highway));
        entity.polyline.width = baseW;
      }
    }
  } finally {
    roadsGroup.entities.resumeEvents();
  }

  if (baselineMap.size > 0 || isScenarioActive) {
    console.log("[Traffic Diagnostic] Summary:", {
      baselineRecords: baselineMap.size,
      roadEntities: entities.length,
      matchedRoadIds: matchedBaselineCount,
      unmatchedTrafficIds: Math.max(0, baselineMap.size - matchedBaselineCount),
      unmatchedRoadIds: Math.max(0, entities.length - matchedBaselineCount),
      scenarioAssessments: scenarioMap.size,
      scenarioMatchedRoads: matchedScenarioCount,
    });
  }

  if (viewer && !viewer.isDestroyed()) {
    viewer.scene.requestRender();
  }
}

function buildBuildings(viewer, layerGroupsRef) {
  const group = new CustomDataSource("Buildings");
  viewer.dataSources.add(group);
  layerGroupsRef.current.buildings = group;
  const entities = group.entities;

  SPATIAL_FEATURES.buildings.forEach((building) => {
    const coords = building.coordinates;
    if (!coords || coords.length < 3) return;
    const positions = coords.map(([lat, lon]) => Cartesian3.fromDegrees(lon, lat, 0));
    const height = buildingExtrudedHeight(building);
    entities.add({
      id: building.id,
      name: building.name || `Building ${building.id.replace("bldg_", "")}`,
      polygon: {
        hierarchy: positions,
        height: 0,
        extrudedHeight: height,
        heightReference: HeightReference.CLAMP_TO_GROUND,
        // Opaque project scaffold so the project's OSM-derived buildings read as
        // the authoritative foreground layer and don't visually double with the
        // contextual Cesium Ion OSM Buildings tiles beneath them.
        material: Color.fromCssColorString("#3a4a5c"),
        outline: true,
        outlineColor: Color.fromCssColorString("#5a6a7c").withAlpha(0.4),
      },
    });
  });
}

function buildOsmBoundaries(viewer, layerGroupsRef) {
  const group = new CustomDataSource("OSM Boundaries");
  viewer.dataSources.add(group);
  layerGroupsRef.current.osmBoundaries = group;
  const entities = group.entities;

  (SPATIAL_FEATURES.boundaries || []).forEach((boundary) => {
    const coords = boundary.coordinates;
    if (!coords || coords.length < 3) return;
    const positions = coords.map(([lat, lon]) =>
      Cartesian3.fromDegrees(lon, lat, 0),
    );
    entities.add({
      id: boundary.id,
      name: boundary.name_en || boundary.name || "OSM Boundary",
      polygon: {
        hierarchy: positions,
        height: 0,
        material: new ColorMaterialProperty(BOUNDARY_FILL),
        outline: true,
        outlineColor: BOUNDARY_COLOR,
      },
    });
  });
}

function renderBoundary(viewer, info, layerGroupsRef) {
  // Remove any existing boundary group before re-adding to avoid duplicates
  // (this effect re-runs when city metadata eventually loads).
  const existing = layerGroupsRef.current.boundary;
  if (existing) viewer.dataSources.remove(existing);

  const b = getProjectBounds(info);
  const positions = Cartesian3.fromDegreesArray([
    b.west, b.south,
    b.east, b.south,
    b.east, b.north,
    b.west, b.north,
    b.west, b.south,
  ]);

  const group = new CustomDataSource("Project Boundary");
  viewer.dataSources.add(group);
  layerGroupsRef.current.boundary = group;

  group.entities.add({
    name: "Project Boundary",
    polygon: {
      hierarchy: positions,
      height: 0,
      material: new ColorMaterialProperty(BOUNDARY_FILL),
      outline: true,
      outlineColor: BOUNDARY_COLOR,
    },
  });
}



function renderSelectedMarker(viewer, location, placedDev, selectedDev) {
  const toRemove = viewer.entities.values.filter((e) =>
    e.id && String(e.id).startsWith("selected-loc-"),
  );
  toRemove.forEach((e) => viewer.entities.remove(e));

  // Hide the selection marker if no location is selected, or if a development is placed or selected
  if (!location || location.latitude == null || location.longitude == null) return;
  if (placedDev || selectedDev) return;

  const lat = Number(location.latitude);
  const lon = Number(location.longitude);
  viewer.entities.add({
    id: `selected-loc-${lat}-${lon}`,
    name: location.name || "Selected Location",
    position: Cartesian3.fromDegrees(lon, lat, 0),
    point: {
      pixelSize: 10,
      color: Color.fromCssColorString("#38bdf8"),
      outlineColor: Color.WHITE,
      outlineWidth: 2,
      heightReference: HeightReference.CLAMP_TO_GROUND,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  });
}
