// Cesium 3D physical development renderer.
// Renders realistic procedural 3D buildings, rooftops, landscaped courtyards,
// paved plazas, sports tracks, water features, internal roads, parking, and plot perimeters.

import {
  Cartesian2,
  Cartesian3,
  Color,
  ColorMaterialProperty,
  HeightReference,
  HorizontalOrigin,
  VerticalOrigin,
} from "cesium";
import { polyToGeoCoords } from "./developmentGeometry.js";
import { generateDevelopmentLayout } from "./developmentLayouts.js";
import { SPATIAL_FEATURES } from "../../../config/mapConfig.js";

function makeCesiumPositions(geoCoords) {
  return geoCoords.map(([lat, lon]) => Cartesian3.fromDegrees(lon, lat, 0));
}

// Convert CSS hex color string to Cesium Color with optional alpha
function parseColor(hex, alpha = 1.0) {
  try {
    const c = Color.fromCssColorString(hex);
    return alpha < 1.0 ? c.withAlpha(alpha) : c;
  } catch {
    return Color.WHITE;
  }
}

/**
 * Clean human-readable display name for developments with clean fallbacks
 */
export function getDevelopmentDisplayName(dev, isProposed = false) {
  const rawName = dev?.name;
  if (
    rawName &&
    typeof rawName === "string" &&
    rawName.trim() !== "" &&
    !rawName.startsWith("dev_") &&
    !rawName.startsWith("dev-")
  ) {
    return isProposed && !rawName.toLowerCase().includes("proposed")
      ? `${rawName} (Proposed)`
      : rawName;
  }

  const type = (dev?.development_type || dev?.type || "").toLowerCase();
  const typeNames = {
    residential_compound: "Residential Compound",
    hospital: "Hospital",
    school: "School",
    mall: "Shopping Mall",
    office: "Office Park",
    mixed_use: "Mixed-Use Complex",
  };
  const typeTitle = typeNames[type] || "Urban Development";
  return isProposed ? `Proposed ${typeTitle}` : typeTitle;
}

/**
 * Computes geographic centroid of the actual placed 3D complex
 */
function computeComplexCentroid(layout, anchorLat, anchorLon) {
  const points = [];
  if (layout.buildings && layout.buildings.length > 0) {
    layout.buildings.forEach((bldg) => {
      if (bldg.footprint) {
        const geo = polyToGeoCoords(bldg.footprint, anchorLat, anchorLon);
        points.push(...geo);
      }
    });
  }
  if (points.length === 0 && layout.plotPolygon && layout.plotPolygon.length > 0) {
    const geo = polyToGeoCoords(layout.plotPolygon, anchorLat, anchorLon);
    points.push(...geo);
  }
  if (points.length === 0) {
    return { centerLat: anchorLat, centerLon: anchorLon };
  }
  const avgLat = points.reduce((sum, p) => sum + p[0], 0) / points.length;
  const avgLon = points.reduce((sum, p) => sum + p[1], 0) / points.length;
  return { centerLat: avgLat, centerLon: avgLon };
}

/**
 * Renders a full physical 3D development complex into a Cesium DataSource / EntityCollection.
 *
 * @param {Object} dev - Development record from store/API
 * @param {CustomDataSource|EntityCollection} targetGroup - Target Cesium data source
 * @param {boolean} isProposed - Whether this is the newly proposed scenario development
 * @param {Object} spatialData - Spatial features dataset
 */
export function render3DDevelopmentComplex(dev, targetGroup, isProposed = true, spatialData = SPATIAL_FEATURES) {
  if (!dev || dev.latitude == null || dev.longitude == null) return;

  const lat = Number(dev.latitude);
  const lon = Number(dev.longitude);
  const devId = dev.development_id || dev.id || `dev_${Date.now()}`;
  const entities = targetGroup.entities || targetGroup;

  // Generate procedural layout
  const layout = generateDevelopmentLayout(dev, lat, lon, spatialData);
  const theme = layout.theme;
  const displayName = getDevelopmentDisplayName(dev, isProposed);

  // 1. Subtle Site Plot Perimeter & Boundary (Ground polygon)
  if (layout.plotPolygon && layout.plotPolygon.length >= 3) {
    const plotGeo = polyToGeoCoords(layout.plotPolygon, lat, lon);
    const plotPositions = makeCesiumPositions(plotGeo);

    entities.add({
      id: `dev_${devId}_plot`,
      name: `${displayName} - Development Boundary`,
      properties: {
        development_id: devId,
        semantic_type: "boundary",
        semantic_category: "Development Boundary",
      },
      polygon: {
        hierarchy: plotPositions,
        height: 0,
        heightReference: HeightReference.CLAMP_TO_GROUND,
        material: new ColorMaterialProperty(
          isProposed
            ? parseColor(theme.boundaryColor, 0.08)
            : parseColor("#eda43a", 0.05)
        ),
        outline: true,
        outlineColor: isProposed
          ? parseColor(theme.boundaryColor, 0.9)
          : parseColor("#eda43a", 0.65),
        outlineWidth: isProposed ? 2 : 1,
      },
    });
  }

  // 2. Explicit Semantic Ground Elements (Landscaping, Internal Roads, Parking, Plazas, Water, Sports)
  layout.landscaping.forEach((item, idx) => {
    if (!item.footprint || item.footprint.length < 3) return;
    const geo = polyToGeoCoords(item.footprint, lat, lon);
    const positions = makeCesiumPositions(geo);

    let outlineColor;
    if (item.type === "internal_road") {
      outlineColor = parseColor("#1b222a", 0.9);
    } else if (item.type === "parking") {
      outlineColor = parseColor("#333d4f", 0.85);
    } else if (item.type === "water") {
      outlineColor = parseColor("#0369a1", 0.95);
    } else if (item.type === "pedestrian_plaza") {
      outlineColor = parseColor("#596473", 0.8);
    } else if (item.type === "sports_field") {
      outlineColor = parseColor("#8c3a21", 0.9);
    } else {
      // Landscaping green
      outlineColor = parseColor("#1b4e24", 0.85);
    }

    entities.add({
      id: `dev_${devId}_land_${idx}`,
      name: `${displayName} - ${item.name || "Site Element"}`,
      properties: {
        development_id: devId,
        semantic_type: item.type,
        semantic_category: item.semanticCategory || item.type,
      },
      polygon: {
        hierarchy: positions,
        height: 0,
        heightReference: HeightReference.CLAMP_TO_GROUND,
        material: new ColorMaterialProperty(parseColor(item.color, 0.95)),
        outline: true,
        outlineColor,
      },
    });
  });

  // 3. Physical 3D Solid Architectural Buildings
  let maxBuildingHeight = 18;

  layout.buildings.forEach((bldg, bIdx) => {
    if (!bldg.footprint || bldg.footprint.length < 3) return;
    const geo = polyToGeoCoords(bldg.footprint, lat, lon);
    const positions = makeCesiumPositions(geo);
    const bldgHeight = bldg.height || 18;
    if (bldgHeight > maxBuildingHeight) maxBuildingHeight = bldgHeight;

    const wallColor = isProposed
      ? parseColor(bldg.color || theme.wallColor)
      : parseColor("#d4c9bd");
    const outlineColor = parseColor(bldg.outlineColor || theme.wallOutline);

    // Main 3D building mass
    entities.add({
      id: `dev_${devId}_bldg_${bIdx}`,
      name: `${displayName} - ${bldg.name}`,
      properties: {
        development_id: devId,
        development_type: dev.development_type || dev.type,
        floors: dev.floors,
        building_name: bldg.name,
        semantic_type: "building",
        semantic_category: "Development Buildings",
      },
      polygon: {
        hierarchy: positions,
        height: 0,
        extrudedHeight: bldgHeight,
        heightReference: HeightReference.CLAMP_TO_GROUND,
        material: new ColorMaterialProperty(wallColor),
        outline: true,
        outlineColor,
      },
    });

    // Rooftop mechanical structures / penthouses
    (bldg.rooftops || []).forEach((roof, rIdx) => {
      if (!roof.footprint || roof.footprint.length < 3) return;
      const roofGeo = polyToGeoCoords(roof.footprint, lat, lon);
      const roofPositions = makeCesiumPositions(roofGeo);
      const roofTopHeight = roof.height || bldgHeight + 2.5;
      if (roofTopHeight > maxBuildingHeight) maxBuildingHeight = roofTopHeight;

      entities.add({
        id: `dev_${devId}_bldg_${bIdx}_roof_${rIdx}`,
        name: `${bldg.name} Rooftop Structure`,
        properties: {
          development_id: devId,
          semantic_type: "rooftop",
          semantic_category: "Rooftop Structure",
        },
        polygon: {
          hierarchy: roofPositions,
          height: 0,
          extrudedHeight: roofTopHeight,
          heightReference: HeightReference.CLAMP_TO_GROUND,
          material: new ColorMaterialProperty(parseColor(roof.color || theme.roofColor)),
          outline: true,
          outlineColor: parseColor(theme.wallOutline).withAlpha(0.6),
        },
      });
    });
  });

  // 4. Central Development Name Label & Anchor Pin (Anchored to actual complex center)
  const { centerLat, centerLon } = computeComplexCentroid(layout, lat, lon);
  const labelHeight = maxBuildingHeight + 8;
  const labelBg = isProposed ? "#0f172a" : "#1e293b";
  const badgeColor = isProposed ? parseColor("#38bdf8") : parseColor("#eda43a");

  entities.add({
    id: `dev_${devId}_label`,
    name: displayName,
    properties: {
      development_id: devId,
      semantic_type: "label",
    },
    position: Cartesian3.fromDegrees(centerLon, centerLat, labelHeight),
    point: {
      pixelSize: isProposed ? 10 : 8,
      color: badgeColor,
      outlineColor: Color.WHITE,
      outlineWidth: 2,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
    label: {
      text: displayName,
      font: "bold 13px Inter, sans-serif",
      fillColor: Color.WHITE,
      style: 0,
      showBackground: true,
      backgroundColor: parseColor(labelBg, 0.92),
      backgroundPadding: new Cartesian2(8, 6),
      horizontalOrigin: HorizontalOrigin.CENTER,
      verticalOrigin: VerticalOrigin.BOTTOM,
      pixelOffset: new Cartesian2(0, -12),
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  });
}
