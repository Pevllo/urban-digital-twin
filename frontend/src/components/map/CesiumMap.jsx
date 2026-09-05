import { useEffect, useRef } from "react";
import {
  Viewer,
  Ion,
  OpenStreetMapImageryProvider,
  ImageryLayer,
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

import { SPATIAL_FEATURES, OSM_BOUNDS, getProjectBounds } from "../../config/mapConfig.js";
import { useApp } from "../../store/AppContext.jsx";
import { CesiumMapApi } from "./CesiumMapApi.js";
import { render3DDevelopmentComplex } from "./development/Development3DRenderer.js";
import { findNearestValidPosition } from "./development/spatialValidation.js";

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
  const spatialReady = useRef(false);
  const didInitialFly = useRef(false);

  const { state, dispatch } = useApp();
  const layerVisibility = state.map.layerVisibility;
  const selectedLocation = state.map.selectedLocation;
  const developments = state.developments.items;
  const placedDev = state.development.placed;
  const selectedDev = state.developments.selected;
  const cityInfo = state.city.info;

  const developmentsRef = useRef(developments);
  const placedDevRef = useRef(placedDev);

  useEffect(() => {
    developmentsRef.current = developments;
    placedDevRef.current = placedDev;
  }, [developments, placedDev]);

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
      imageryProvider: new OpenStreetMapImageryProvider({
        url: "https://tile.openstreetmap.org/",
      }),
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
      // Realistic map surface: Cesium World Terrain (real ground) + Cesium World
      // Imagery (reliable tiles, not the blue ellipsoid fallback).
      //
      // The floating roofs were Cesium Ion OSM Buildings 3D Tiles: they are
      // authored to sit on World Terrain and floated because none was loaded.
      // Loading terrain here makes them (and every clamp-to-ground feature) sit
      // on the actual ground. Both fail gracefully back to the OSM imagery +
      // flat ellipsoid if the Ion token/network is unavailable.

      // In Cesium 1.144 these factory helpers are SYNCHRONOUS: they return the
      // ImageryLayer / Terrain object immediately and resolve their Ion
      // provider in the background (no Promise). Do not call .then() on them.
      const worldImagery = ImageryLayer.fromWorldImagery();
      worldImagery.name = "Cesium World Imagery";
      // Append on top (no explicit index so it can't go out of bounds). World
      // tiles stream in and cover whatever base layer the Viewer already has
      // (the OSM fallback); if World Imagery fails, the base layer below
      // remains visible (never a blank/blue canvas).
      viewer.imageryLayers.add(worldImagery);
      worldImagery.errorEvent.addEventListener(() => {
        // World Imagery failed -> the base OSM layer below remains.
      });

      // Cesium World Terrain: real ground so the Ion OSM Buildings 3D Tiles
      // (baked against World Terrain) sit on it instead of floating above the
      // flat ellipsoid. setTerrain() accepts the Terrain object directly and
      // handles its async readiness.
      const terrainObj = Terrain.fromWorldTerrain();
      viewer.scene.setTerrain(terrainObj);
      // Enable depth testing only once real terrain is actually present, so
      // building bases sit on (not under/over) the ground without z-fighting.
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

    // ---- Location and Development selection ----
    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((click) => {
      // 1. Check if user clicked an existing or proposed development 3D entity
      const picked = viewer.scene.pick(click.position);
      if (picked && picked.id) {
        const entity = picked.id;
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
      }

      // 2. Normal location click
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

  // ---- Render OSM buildings + roads once ----
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || spatialReady.current) return;
    spatialReady.current = true;

    viewer.entities.suspendEvents();
    try {
      buildRoads(viewer, layerGroupsRef);
      buildBuildings(viewer, layerGroupsRef);
      buildOsmBoundaries(viewer, layerGroupsRef);
    } finally {
      viewer.entities.resumeEvents();
    }
  }, []);

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
  }, [layerVisibility]);

  // ---- Render developments ----
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    const old = layerGroupsRef.current.developments;
    if (old) viewer.dataSources.remove(old);

    const group = new CustomDataSource("Developments");
    viewer.dataSources.add(group);
    layerGroupsRef.current.developments = group;

    developments.forEach((dev) => {
      if (dev.latitude == null || dev.longitude == null) return;
      const isProposed = Boolean(placedDev && dev.development_id === placedDev.development_id);
      render3DDevelopmentComplex(dev, group, isProposed, SPATIAL_FEATURES);
    });
  }, [developments, placedDev, layerVisibility.developments]);

  // ---- Render selected location marker ----
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    renderSelectedMarker(viewer, selectedLocation, placedDev, selectedDev);
  }, [selectedLocation, placedDev, selectedDev]);

  return (
    <div className="cesium-container">
      <div className="cesium-canvas" ref={containerRef} />
    </div>
  );
}

// ============ Builders ============

function flyToCityArea(viewer, info, duration = 2.0) {
  if (!viewer || viewer.isDestroyed()) return;
  const b = getProjectBounds(info);
  const rectangle = Rectangle.fromDegrees(
    b.west,
    b.south,
    b.east,
    b.north,
  );
  viewer.camera.flyTo({
    destination: rectangle,
    orientation: {
      heading: CesiumMath.toRadians(0),
      pitch: CesiumMath.toRadians(-48),
      roll: 0,
    },
    duration,
  });
}

function buildRoads(viewer, layerGroupsRef) {
  const group = new CustomDataSource("Roads");
  viewer.dataSources.add(group);
  layerGroupsRef.current.roads = group;
  const entities = group.entities;

  SPATIAL_FEATURES.roads.forEach((road) => {
    if (!road.coordinates || road.coordinates.length < 2) return;
    const positions = road.coordinates.map(([lat, lon]) =>
      Cartesian3.fromDegrees(lon, lat, 5),
    );
    entities.add({
      id: road.id,
      name: road.name_en || road.name || `Road ${road.id.replace("way_", "")}`,
      polyline: {
        positions,
        width: roadWidth(road.highway),
        material: new ColorMaterialProperty(roadColor(road.highway)),
        clampToGround: false,
      },
    });
  });
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
