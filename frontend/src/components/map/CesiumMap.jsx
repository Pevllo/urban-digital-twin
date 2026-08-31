import { useEffect, useRef, useState } from "react";

import {
  Viewer,
  OpenStreetMapImageryProvider,
  ImageryLayer,
  Cartesian3,
  Math as CesiumMath,
  Color,
  ScreenSpaceEventType,
} from "cesium";

import "cesium/Build/Cesium/Widgets/widgets.css";
import "./CesiumMap.css";

import spatialData from "../../data/spatialFeatures.json";

function CesiumMap({
  onBuildingSelect,
  onRoadSelect,
  onMapLocationSelect,
  onDevelopmentSelect,
  developmentMode,
  proposedDevelopment,
}) {
  const containerRef = useRef(null);
  const viewerRef = useRef(null);

  const buildingSelectRef = useRef(onBuildingSelect);
  const roadSelectRef = useRef(onRoadSelect);
  const mapLocationSelectRef = useRef(onMapLocationSelect);
  const developmentSelectRef = useRef(onDevelopmentSelect);

  const [trafficData, setTrafficData] = useState({});

  const developmentModeRef = useRef(developmentMode);

  // =========================================================
  // KEEP CALLBACK REFERENCES UP TO DATE
  // =========================================================

  useEffect(() => {
    buildingSelectRef.current = onBuildingSelect;

    roadSelectRef.current = onRoadSelect;

    mapLocationSelectRef.current = onMapLocationSelect;

    developmentSelectRef.current = onDevelopmentSelect;

    developmentModeRef.current = developmentMode;
  }, [onBuildingSelect, onRoadSelect, onMapLocationSelect, onDevelopmentSelect, developmentMode]);

  // =========================================================
  // LOAD TRAFFIC DATA
  // =========================================================

  useEffect(() => {
    let cancelled = false;

    async function loadTraffic() {
      try {
        const response = await fetch(
          "http://127.0.0.1:8000/api/v1/traffic/baseline/all",
        );

        if (!response.ok) {
          throw new Error(`Traffic request failed: ${response.status}`);
        }

        const data = await response.json();

        if (cancelled) {
          return;
        }

        const lookup = {};

        for (const road of data.roads || []) {
          lookup[String(road.osm_way_id)] = road;
        }

        setTrafficData(lookup);

        console.log(
          `Loaded traffic data for ${Object.keys(lookup).length} OSM roads.`,
        );

        console.log("SAMPLE TRAFFIC:", Object.values(lookup).slice(0, 5));
      } catch (error) {
        console.error("Failed to load traffic data:", error);
      }
    }

    loadTraffic();

    return () => {
      cancelled = true;
    };
  }, []);

  // =========================================================
  // UPDATE ROAD COLORS AFTER TRAFFIC LOADS
  // =========================================================

  useEffect(() => {
    if (!viewerRef.current) {
      return;
    }

    const viewer = viewerRef.current;

    console.log(
      "TRAFFIC COLOR UPDATE:",
      Object.keys(trafficData).length,
      "traffic roads",
    );

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
    // NAC CAMERA
    // =======================================================

    viewer.camera.setView({
      destination: Cartesian3.fromDegrees(31.75, 30.01, 12000),

      orientation: {
        heading: CesiumMath.toRadians(0),

        pitch: CesiumMath.toRadians(-45),

        roll: 0,
      },
    });

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
  // MAP CONTAINER
  // =========================================================

  return <div ref={containerRef} className="cesium-map" />;
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

export default CesiumMap;
