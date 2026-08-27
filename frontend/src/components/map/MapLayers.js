import {
  Cartesian3,
  Color,
  Cesium3DTileStyle,
  PolylineGlowMaterialProperty,
  createOsmBuildingsAsync,
} from 'cesium';

import spatialData from '../../data/spatialFeatures.json';

export async function loadMapLayers(viewer) {
  if (!viewer) return;

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

  // 2. Render Road Network Polyline Glows
  if (spatialData && spatialData.roads) {
    spatialData.roads.forEach((roadSeg, idx) => {
      const flatPositions = [];
      roadSeg.forEach(([rLat, rLon]) => {
        flatPositions.push(rLon, rLat);
      });

      const isMajor = idx % 5 === 0;
      viewer.entities.add({
        polyline: {
          positions: Cartesian3.fromDegreesArray(flatPositions),
          width: isMajor ? 5 : 2.5,
          material: isMajor
            ? new PolylineGlowMaterialProperty({
                glowPower: 0.25,
                color: Color.fromCssColorString('#38bdf8'),
              })
            : Color.fromCssColorString('#475569'),
          clampToGround: true,
        },
      });
    });
  }
}
