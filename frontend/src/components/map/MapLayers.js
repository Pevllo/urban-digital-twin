import {
  Cartesian3,
  Color,
  Cesium3DTileStyle,
  PolylineGlowMaterialProperty,
  createOsmBuildingsAsync,
} from 'cesium';

import spatialData from '../../data/spatialFeatures.json';
import { ROAD_WIDTH_BY_TYPE, getDatasetDiagnostics } from '../../utils/buildabilityEngine.js';

export async function loadMapLayers(viewer) {
  if (!viewer) return;

  // Log Dataset Diagnostics
  const diag = getDatasetDiagnostics(spatialData);
  console.log('[GIS Pipeline Audit]:', diag);

  // 1. Load and Style 3D OSM Buildings
  try {
    const osmBuildings = await createOsmBuildingsAsync();
    osmBuildings.style = new Cesium3DTileStyle({
      color: {
        conditions: [
          ['${feature["building"]} === "hospital"', 'color("#f87171", 0.9)'],
          ['${feature["building"]} === "residential"', 'color("#60a5fa", 0.85)'],
          ['${feature["building"]} === "commercial"', 'color("#c084fc", 0.85)'],
          ['true', 'color("#334155", 0.9)'],
        ],
      },
    });
    viewer.scene.primitives.add(osmBuildings);
  } catch (e) {
    console.warn('[MapLayers] OSM 3D Buildings load fallback:', e);
  }

  // 2. Render Road Network Polylines (Consuming exact normalized road dataset)
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

      const isMajor = ['motorway', 'trunk', 'primary', 'secondary'].includes(hwType);
      const isMedium = ['tertiary', 'unclassified'].includes(hwType);

      const renderWidth = isMajor ? Math.min(6, Math.max(4, baseWidth * 0.5)) : (isMedium ? 3.0 : 1.8);
      const renderColor = isMajor ? '#38bdf8' : (isMedium ? '#60a5fa' : '#475569');

      viewer.entities.add({
        polyline: {
          positions: Cartesian3.fromDegreesArray(flatPositions),
          width: renderWidth,
          material: isMajor
            ? new PolylineGlowMaterialProperty({
                glowPower: 0.2,
                color: Color.fromCssColorString('#38bdf8'),
              })
            : Color.fromCssColorString(renderColor),
          clampToGround: true,
        },
      });
    });
  }
}
