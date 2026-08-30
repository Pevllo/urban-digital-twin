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

function CesiumMap({ onBuildingSelect, onRoadSelect }) {
  const containerRef = useRef(null);
  const viewerRef = useRef(null);

  const buildingSelectRef = useRef(onBuildingSelect);
  const roadSelectRef = useRef(onRoadSelect);

  const [trafficData, setTrafficData] = useState({});

  // --------------------------------------------------
  // KEEP CALLBACK REFERENCES UP TO DATE
  // --------------------------------------------------

  useEffect(() => {
    buildingSelectRef.current = onBuildingSelect;
    roadSelectRef.current = onRoadSelect;
  }, [onBuildingSelect, onRoadSelect]);

  // --------------------------------------------------
  // LOAD TRAFFIC DATA
  // --------------------------------------------------

  useEffect(() => {
    let cancelled = false;

    async function loadTraffic() {
      try {
        const response = await fetch(
          "http://127.0.0.1:8000/api/v1/traffic/baseline/all"
        );

        if (!response.ok) {
          throw new Error(
            `Traffic request failed: ${response.status}`
          );
        }

        const data = await response.json();

        if (cancelled) return;

        const lookup = {};

        for (const road of data.roads || []) {
          lookup[String(road.osm_way_id)] = road;
        }

        setTrafficData(lookup);

        console.log(
          `Loaded traffic data for ${Object.keys(lookup).length} OSM roads.`
        );
      } catch (error) {
        console.error(
          "Failed to load traffic data:",
          error
        );
      }
    }

    loadTraffic();

    return () => {
      cancelled = true;
    };
  }, []);

  // --------------------------------------------------
  // CESIUM VIEWER
  // --------------------------------------------------

  useEffect(() => {
    if (!containerRef.current) return;

    const viewer = new Viewer(containerRef.current, {
      baseLayer: new ImageryLayer(
        new OpenStreetMapImageryProvider({
          url: "https://tile.openstreetmap.org/",
        })
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

    // --------------------------------------------------
    // NAC CAMERA
    // --------------------------------------------------

    viewer.camera.setView({
      destination: Cartesian3.fromDegrees(
        31.75,
        30.01,
        12000
      ),
      orientation: {
        heading: CesiumMath.toRadians(0),
        pitch: CesiumMath.toRadians(-45),
        roll: 0,
      },
    });

    // --------------------------------------------------
    // BUILDINGS
    // --------------------------------------------------

    spatialData.buildings.forEach((building) => {
      const positions = [];

      building.coordinates.forEach(([lat, lon]) => {
        positions.push(
          Cartesian3.fromDegrees(lon, lat)
        );
      });

      if (positions.length < 3) return;

      const height = Math.max(
        8,
        Math.min(
          40,
          building.radius * 1.2
        )
      );

      viewer.entities.add({
        id: building.id,

        name:
          building.name ||
          `Building ${building.id.replace(
            "bldg_",
            ""
          )}`,

        polygon: {
          hierarchy: positions,

          height: 0,

          extrudedHeight: height,

          material: Color.fromCssColorString(
            "#64748b"
          ).withAlpha(0.85),

          outline: true,

          outlineColor:
            Color.fromCssColorString(
              "#cbd5e1"
            ),
        },

        properties: {
          type: "building",

          buildingType:
            building.building,

          name: building.name,

          centroid:
            building.centroid,

          radius:
            building.radius,
        },
      });
    });

    // --------------------------------------------------
    // ROADS
    // --------------------------------------------------

    spatialData.roads.forEach((road) => {
      const positions = [];

      road.coordinates.forEach(
        ([lat, lon]) => {
          positions.push(
            Cartesian3.fromDegrees(
              lon,
              lat,
              2
            )
          );
        }
      );

      if (positions.length < 2) return;

      viewer.entities.add({
        id: road.id,

        name:
          road.name ||
          `Road ${road.id.replace(
            "way_",
            ""
          )}`,

        polyline: {
          positions,

          width:
            getRoadWidth(
              road.highway
            ),

          material:
            getTrafficColor(
              trafficData[
                String(
                  road.id.replace("way_", "")
                )
              ]?.congestion_percent ?? 0
          ),

          clampToGround: true,
        },

        properties: {
          type: "road",

          highway:
            road.highway,

          name:
            road.name,
        },
      });
    });

    // --------------------------------------------------
    // MAP SELECTION
    // --------------------------------------------------

    const handler =
      viewer.screenSpaceEventHandler;

    handler.setInputAction(
      (movement) => {
        const picked =
          viewer.scene.pick(
            movement.position
          );

        // ------------------------------------------------
        // NOTHING SELECTED
        // ------------------------------------------------

        if (
          !picked ||
          !picked.id
        ) {
          viewer.selectedEntity =
            undefined;

          return;
        }

        const entity =
          picked.id;

        // ------------------------------------------------
        // BUILDING SELECTION
        // ------------------------------------------------

        if (
          entity.properties?.type?.getValue() ===
          "building"
        ) {
          viewer.selectedEntity =
            entity;

          const building =
            spatialData.buildings.find(
              (item) =>
                item.id ===
                entity.id
            );

          if (
            building &&
            buildingSelectRef.current
          ) {
            buildingSelectRef.current(
              building
            );
          }
        }

        // ------------------------------------------------
        // ROAD SELECTION
        // ------------------------------------------------

        if (
          entity.properties?.type?.getValue() ===
          "road"
        ) {
          viewer.selectedEntity =
            entity;

          const road =
            spatialData.roads.find(
              (item) =>
                item.id ===
                entity.id
            );

          if (
            road &&
            roadSelectRef.current
          ) {
            roadSelectRef.current(
              road
            );
          }
        }
      },
      ScreenSpaceEventType.LEFT_CLICK
    );

    // --------------------------------------------------
    // CLEANUP
    // --------------------------------------------------

    return () => {
      if (
        !viewer.isDestroyed()
      ) {
        viewer.destroy();
      }

      viewerRef.current = null;
    };
  }, []);

  // --------------------------------------------------
  // MAP CONTAINER
  // --------------------------------------------------

  return (
    <div
      ref={containerRef}
      className="cesium-map"
    />
  );
}

// --------------------------------------------------
// ROAD WIDTH
// --------------------------------------------------

function getRoadWidth(highway) {
  switch (highway) {
    case "motorway":
      return 5;

    case "trunk":
      return 4;

    case "primary":
      return 4;

    case "secondary":
      return 3;

    case "tertiary":
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

// --------------------------------------------------
// ROAD COLOR
// --------------------------------------------------

function getRoadColor(highway) {
  switch (highway) {
    case "motorway":
    case "motorway_link":
      return Color.fromCssColorString(
        "#f97316"
      );

    case "trunk":
    case "trunk_link":
      return Color.fromCssColorString(
        "#f59e0b"
      );

    case "primary":
    case "primary_link":
      return Color.fromCssColorString(
        "#eab308"
      );

    case "secondary":
    case "secondary_link":
      return Color.fromCssColorString(
        "#94a3b8"
      );

    case "tertiary":
    case "tertiary_link":
      return Color.fromCssColorString(
        "#64748b"
      );

    case "construction":
      return Color.fromCssColorString(
        "#ef4444"
      );

    default:
      return Color.fromCssColorString(
        "#475569"
      );
  }
}
 
function getTrafficColor(congestionPercent) {
  if (congestionPercent < 5.5) {
    return Color.fromCssColorString("#22c55e");
  }

  if (congestionPercent < 8.3) {
    return Color.fromCssColorString("#eab308");
  }

  if (congestionPercent < 11.25) {
    return Color.fromCssColorString("#f97316");
  }

  return Color.fromCssColorString("#ef4444");
}
export default CesiumMap;