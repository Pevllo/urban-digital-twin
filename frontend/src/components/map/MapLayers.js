import {
  Cartesian3,
  Color,
  Cesium3DTileStyle,
  PolylineGlowMaterialProperty,
  createOsmBuildingsAsync,
} from 'cesium';

import spatialData from '../../data/spatialFeatures.json';
import { ROAD_WIDTH_BY_TYPE, getDatasetDiagnostics } from '../../utils/buildabilityEngine.js';

let osmBuildingsTileset = null;
let roadEntities = [];

export async function loadMapLayers(viewer) {
  if (!viewer) return;

  // Log Dataset Diagnostics
  const diag = getDatasetDiagnostics(spatialData);
  console.log('[GIS Pipeline Audit]:', diag);

  // 1. Load and Style 3D OSM Buildings
  try {
    osmBuildingsTileset = await createOsmBuildingsAsync();
    osmBuildingsTileset.style = new Cesium3DTileStyle({
      color: {
        conditions: [
          ['${feature["building"]} === "hospital"', 'color("#f87171", 0.9)'],
          ['${feature["building"]} === "residential"', 'color("#60a5fa", 0.85)'],
          ['${feature["building"]} === "commercial"', 'color("#c084fc", 0.85)'],
          ['true', 'color("#334155", 0.9)'],
        ],
      },
    });
    viewer.scene.primitives.add(osmBuildingsTileset);
  } catch (e) {
    console.warn('[MapLayers] OSM 3D Buildings load fallback:', e);
  }

  // 2. Render Road Network Polylines (Consuming exact normalized road dataset)
  roadEntities = [];
  const roads = spatialData?.roads || [];
  if (Array.isArray(roads) && roads.length > 0) {
    roads.forEach((roadFeature) => {
      const rawCoords = roadFeature.coordinates || roadFeature;
      if (!Array.isArray(rawCoords) || rawCoords.length < 2) return;

      const flatPositions = [];
      rawCoords.forEach((pt) => {
        const rLat = Array.isArray(pt) ? pt[0] : pt.latitude;
        const rLon = Array.isArray(pt) ? pt[1] : pt.longitude;
        if (typeof rLat === 'number' && typeof rLon === 'number' && !Number.isNaN(rLat) && !Number.isNaN(rLon)) {
          flatPositions.push(rLon, rLat);
        }
      });

      if (flatPositions.length < 4) return;

      const hwType = roadFeature.highway || 'default';
      const baseWidth = ROAD_WIDTH_BY_TYPE[hwType] || 5.0;

      // Road Visual Hierarchy for maximum contrast against satellite imagery
      let renderWidth = 2.0;
      let renderColor = '#64748b';
      let isGlow = false;

      if (['motorway', 'motorway_link', 'trunk', 'trunk_link'].includes(hwType)) {
        renderWidth = 6.0;
        renderColor = '#38bdf8';
        isGlow = true;
      } else if (['primary', 'primary_link', 'secondary', 'secondary_link'].includes(hwType)) {
        renderWidth = 4.5;
        renderColor = '#60a5fa';
      } else if (['tertiary', 'tertiary_link'].includes(hwType)) {
        renderWidth = 3.5;
        renderColor = '#818cf8';
      } else if (['residential', 'unclassified'].includes(hwType)) {
        renderWidth = 2.5;
        renderColor = '#a5b4fc';
      } else { // service, living_street, construction, etc.
        renderWidth = 1.8;
        renderColor = '#64748b';
      }

      const entity = viewer.entities.add({
        polyline: {
          positions: Cartesian3.fromDegreesArray(flatPositions),
          width: renderWidth,
          material: isGlow
            ? new PolylineGlowMaterialProperty({
                glowPower: 0.25,
                color: Color.fromCssColorString(renderColor),
              })
            : Color.fromCssColorString(renderColor),
          clampToGround: true,
        },
      });
      roadEntities.push(entity);
    });
  }
}

export function setBuildingsVisible(visible) {
  if (osmBuildingsTileset) {
    osmBuildingsTileset.show = visible;
  }
}

export function setTrafficVisible(visible) {
  roadEntities.forEach((ent) => {
    ent.show = visible;
  });
}

