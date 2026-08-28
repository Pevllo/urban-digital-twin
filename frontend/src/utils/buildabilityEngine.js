import spatialData from '../data/spatialFeatures.json';
import {
  wgs84ToLocalENU,
  localENUToWgs84,
  rotateMetricPoint,
  metricPointToSegmentDistance,
  haversineDistanceMeters,
  computePolygonArea,
  doPolygonsIntersect,
  polygonToSegmentDistance,
  isPolygonInsidePolygon,
  isPointInPolygon,
  getDevelopmentFootprintPolygonWGS84,
} from './geoUtils.js';

export { getDevelopmentFootprintPolygonWGS84 };
import { createDevelopmentModel, SUPPORTED_DEV_TYPES } from '../types/development.js';

/**
 * Road Widths by OSM Highway Classification (in Meters).
 */
export const ROAD_WIDTH_BY_TYPE = {
  motorway: 14.0,
  motorway_link: 10.0,
  trunk: 12.0,
  trunk_link: 9.0,
  primary: 10.0,
  primary_link: 8.0,
  secondary: 8.0,
  secondary_link: 7.0,
  tertiary: 7.0,
  tertiary_link: 6.0,
  residential: 6.0,
  unclassified: 5.0,
  service: 4.0,
  living_street: 4.0,
  construction: 6.0,
  default: 5.0,
};

export const ROAD_CLEARANCE_METERS = 5.0;
export const BUILDING_CLEARANCE_METERS = 5.0;
export const DEVELOPMENT_CLEARANCE_METERS = 5.0;

let cachedCanonicalLayers = null;

/**
 * Canonical Spatial Layer Store & Pre-Computation Cache.
 * Normalizes all spatial features into Local ENU Metric 2D Polygons with bounding boxes (AABBs).
 */
export function getCanonicalSpatialLayers(spatialDataset = spatialData) {
  if (cachedCanonicalLayers && spatialDataset === spatialData) {
    return cachedCanonicalLayers;
  }

  const rawBuildings = spatialDataset?.buildings || [];
  const rawRoads = spatialDataset?.roads || [];

  // 1. Canonical Building Footprint Layer
  const buildingFootprints = [];
  let totalBuildingAreaM2 = 0.0;

  for (const bldg of rawBuildings) {
    const coords = bldg.coordinates || [];
    if (!Array.isArray(coords) || coords.length < 3) continue;

    const enuPoints = coords.map((c) => wgs84ToLocalENU(c[0], c[1]));
    const aabb = getMetricAABB(enuPoints, 0.0);
    const area = computePolygonArea(enuPoints);
    totalBuildingAreaM2 += area;

    buildingFootprints.push({
      id: bldg.id,
      building: bldg.building || 'building',
      name: bldg.name || '',
      wgs84Coords: coords,
      enuPoints,
      aabb,
      area,
    });
  }

  // 2. Canonical Road Network Layer
  const roadNetwork = [];
  for (const r of rawRoads) {
    const coords = r.coordinates || r;
    if (!Array.isArray(coords) || coords.length < 2) continue;

    const hwType = r.highway || 'default';
    const roadWidth = ROAD_WIDTH_BY_TYPE[hwType] || ROAD_WIDTH_BY_TYPE.default;
    const clearanceThreshold = (roadWidth / 2.0) + ROAD_CLEARANCE_METERS;

    const enuPoints = coords.map((pt) => {
      const rLat = Array.isArray(pt) ? pt[0] : pt.latitude;
      const rLon = Array.isArray(pt) ? pt[1] : pt.longitude;
      return wgs84ToLocalENU(rLat, rLon);
    });

    const aabb = getMetricAABB(enuPoints, clearanceThreshold);

    roadNetwork.push({
      id: r.id,
      highway: hwType,
      name: r.name || '',
      roadWidth,
      clearanceThreshold,
      wgs84Coords: coords,
      enuPoints,
      aabb,
    });
  }

  // 3. Study Area Boundary Polygon
  const extent = getCityExtent(spatialDataset);
  let studyAreaPolygon = [];
  if (extent) {
    const sw = wgs84ToLocalENU(extent.minLat, extent.minLon);
    const se = wgs84ToLocalENU(extent.minLat, extent.maxLon);
    const ne = wgs84ToLocalENU(extent.maxLat, extent.maxLon);
    const nw = wgs84ToLocalENU(extent.maxLat, extent.minLon);
    studyAreaPolygon = [sw, se, ne, nw];
  }

  cachedCanonicalLayers = {
    buildingFootprints,
    roadNetwork,
    studyAreaPolygon,
    extent,
    totalBuildingAreaM2,
  };

  return cachedCanonicalLayers;
}

/**
 * Diagnostics reporter for loaded GIS dataset.
 */
export function getDatasetDiagnostics(spatialDataset = spatialData) {
  const canonical = getCanonicalSpatialLayers(spatialDataset);
  const roads = spatialDataset?.roads || [];

  const highwayCounts = {};
  roads.forEach((r) => {
    const hw = r.highway || 'unknown';
    highwayCounts[hw] = (highwayCounts[hw] || 0) + 1;
  });

  return {
    totalRoadsLoaded: canonical.roadNetwork.length,
    totalBuildingsLoaded: spatialDataset?.buildings?.length || 0,
    validBuildingPolygons: canonical.buildingFootprints.length,
    totalBuildingFootprintAreaM2: canonical.totalBuildingAreaM2,
    highwayCounts,
    extent: canonical.extent,
  };
}

/**
 * Computes dynamic geographic bounding box extent from currently loaded spatial dataset.
 */
export function getCityExtent(spatialDataset = spatialData) {
  const roads = spatialDataset?.roads || [];
  if (!Array.isArray(roads) || roads.length === 0) return null;

  let minLat = 90.0, maxLat = -90.0, minLon = 180.0, maxLon = -180.0;

  for (const road of roads) {
    const coords = road.coordinates || road;
    if (!Array.isArray(coords)) continue;
    for (const pt of coords) {
      const rLat = Array.isArray(pt) ? pt[0] : pt.latitude;
      const rLon = Array.isArray(pt) ? pt[1] : pt.longitude;
      if (rLat < minLat) minLat = rLat;
      if (rLat > maxLat) maxLat = rLat;
      if (rLon < minLon) minLon = rLon;
      if (rLon > maxLon) maxLon = rLon;
    }
  }

  // 500m (~0.0045 deg) study area buffer
  const buf = 0.0045;
  return {
    minLat: minLat - buf,
    maxLat: maxLat + buf,
    minLon: minLon - buf,
    maxLon: maxLon + buf,
  };
}

/**
 * Generates local ENU metric sample points (corners + edge midpoints in meters) for a rectangular footprint
 * centered at (centerENU.x, centerENU.y) with width, length, and rotation angle (degrees).
 */
export function getMetricFootprintPoints(centerENU, widthMeters, lengthMeters, orientationDegrees = 0) {
  const hw = widthMeters / 2.0;
  const hl = lengthMeters / 2.0;

  const samplePoints = [
    { x: -hw, y: hl },   // Top-Left corner (0)
    { x: hw, y: hl },    // Top-Right corner (1)
    { x: hw, y: -hl },   // Bottom-Right corner (2)
    { x: -hw, y: -hl },  // Bottom-Left corner (3)
    { x: 0, y: hl },     // Top-Edge midpoint (4)
    { x: hw, y: 0 },     // Right-Edge midpoint (5)
    { x: 0, y: -hl },    // Bottom-Edge midpoint (6)
    { x: -hw, y: 0 },    // Left-Edge midpoint (7)
    { x: 0, y: 0 },      // Center point (8)
  ];

  return samplePoints.map((pt) => {
    const rot = rotateMetricPoint(pt.x, pt.y, orientationDegrees);
    return {
      x: centerENU.x + rot.x,
      y: centerENU.y + rot.y,
    };
  });
}

/**
 * Calculates metric AABB bounding box (minX, maxX, minY, maxY in meters) for a footprint.
 */
export function getMetricAABB(pointsENU, clearanceMeters = 0.0) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const pt of pointsENU) {
    if (pt.x < minX) minX = pt.x;
    if (pt.x > maxX) maxX = pt.x;
    if (pt.y < minY) minY = pt.y;
    if (pt.y > maxY) maxY = pt.y;
  }
  return {
    minX: minX - clearanceMeters,
    maxX: maxX + clearanceMeters,
    minY: minY - clearanceMeters,
    maxY: maxY + clearanceMeters,
  };
}

/**
 * Checks whether two 2D metric AABBs overlap.
 */
export function metricAABBsOverlap(boxA, boxB) {
  return !(
    boxA.maxX < boxB.minX ||
    boxA.minX > boxB.maxX ||
    boxA.maxY < boxB.minY ||
    boxA.minY > boxB.maxY
  );
}

/**
 * Validates development placement against city extent, road network, buildings, and placed developments
 * using Local Tangent Plane ENU metric 2D Polygon geometry (1 unit = 1 meter).
 */
export function validateBuildability(lat, lon, devType, existingDevs = [], properties = {}, buildingHeightOverride = 0) {
  if (typeof lat !== 'number' || typeof lon !== 'number' || Number.isNaN(lat) || Number.isNaN(lon)) {
    return {
      valid: false,
      reason: 'invalid_coordinates',
      conflictType: 'invalid_coordinates',
      coordinates: { longitude: lon || 0, latitude: lat || 0, terrainHeight: 0 },
      dimensions: { width: 50, length: 50, height: 15, buildingHeight: 15 },
      allowedTypes: Object.keys(SUPPORTED_DEV_TYPES),
    };
  }

  const model = createDevelopmentModel({
    development_type: devType,
    latitude: lat,
    longitude: lon,
    properties,
    height: buildingHeightOverride,
  });

  const dims = model.footprint;
  const bldgHeight = model.buildingHeight || model.height || 15;
  const orientation = model.orientation || 0;

  const footprintWGS84 = getDevelopmentFootprintPolygonWGS84(lat, lon, dims.width, dims.length, orientation);

  const resultCoords = { longitude: lon, latitude: lat, terrainHeight: model.z || 0.0 };
  const resultDims = {
    width: dims.width,
    length: dims.length,
    height: bldgHeight,
    buildingHeight: bldgHeight,
    orientation,
    footprintWGS84,
  };
  const allowedTypes = Object.keys(SUPPORTED_DEV_TYPES);

  const { buildingFootprints, roadNetwork, studyAreaPolygon, extent } = getCanonicalSpatialLayers(spatialData);

  // 1. Dynamic City Extent Check
  if (!extent) {
    return {
      valid: false,
      reason: 'outside_city_bounds',
      conflictType: 'outside_city_bounds',
      coordinates: resultCoords,
      dimensions: resultDims,
      allowedTypes,
    };
  }

  if (lat < extent.minLat || lat > extent.maxLat || lon < extent.minLon || lon > extent.maxLon) {
    return {
      valid: false,
      reason: 'outside_study_area',
      conflictType: 'outside_study_area',
      coordinates: resultCoords,
      dimensions: resultDims,
      allowedTypes,
    };
  }

  // Convert proposed building center to Local ENU Metric Coordinates (meters)
  const centerENU = wgs84ToLocalENU(lat, lon);
  const pointsENU = getMetricFootprintPoints(centerENU, dims.width, dims.length, orientation);
  
  // 4-corner metric polygon for footprint geometry
  const footprintPolygon = [pointsENU[0], pointsENU[1], pointsENU[2], pointsENU[3]];

  // Test Study Area Containment (entire footprint must lie inside study area polygon)
  if (studyAreaPolygon.length >= 3 && !isPolygonInsidePolygon(footprintPolygon, studyAreaPolygon)) {
    return {
      valid: false,
      reason: 'outside_study_area',
      conflictType: 'outside_study_area',
      coordinates: resultCoords,
      dimensions: resultDims,
      allowedTypes,
    };
  }

  // 2. Existing Building Footprint Collision Test (Polygon vs Polygon)
  const bufferedBuildingAABB = getMetricAABB(pointsENU, BUILDING_CLEARANCE_METERS);
  for (const bldg of buildingFootprints) {
    if (!metricAABBsOverlap(bufferedBuildingAABB, bldg.aabb)) continue;

    if (doPolygonsIntersect(footprintPolygon, bldg.enuPoints)) {
      return {
        valid: false,
        reason: 'building_collision',
        conflictType: 'building_collision',
        nearestBuildingId: bldg.id,
        coordinates: resultCoords,
        dimensions: resultDims,
        allowedTypes,
      };
    }
  }

  // 3. Road Network Collision Test (Polygon vs Polyline + Road Clearance Buffer)
  for (const road of roadNetwork) {
    const roadAABB = getMetricAABB(pointsENU, road.clearanceThreshold);
    if (!metricAABBsOverlap(roadAABB, road.aabb)) continue;

    for (let i = 0; i < road.enuPoints.length - 1; i++) {
      const a = road.enuPoints[i];
      const b = road.enuPoints[i + 1];

      const dist = polygonToSegmentDistance(footprintPolygon, a.x, a.y, b.x, b.y);
      if (dist < road.clearanceThreshold) {
        return {
          valid: false,
          reason: 'road_collision',
          conflictType: 'road_collision',
          nearestRoadId: road.id,
          coordinates: resultCoords,
          dimensions: resultDims,
          allowedTypes,
        };
      }
    }
  }

  // 4. Placed Proposed Developments Collision (Polygon vs Polygon)
  const bufferedDevAABB = getMetricAABB(pointsENU, DEVELOPMENT_CLEARANCE_METERS);
  for (const existing of existingDevs) {
    const existingLat = Number(existing.latitude);
    const existingLon = Number(existing.longitude);
    const existingModel = createDevelopmentModel(existing);

    const existingENU = wgs84ToLocalENU(existingLat, existingLon);
    const existingPoints = getMetricFootprintPoints(
      existingENU,
      existingModel.footprint.width,
      existingModel.footprint.length,
      existingModel.orientation || 0
    );
    const existingPolygon = [existingPoints[0], existingPoints[1], existingPoints[2], existingPoints[3]];
    const existingAABB = getMetricAABB(existingPoints, DEVELOPMENT_CLEARANCE_METERS);

    if (metricAABBsOverlap(bufferedDevAABB, existingAABB)) {
      if (doPolygonsIntersect(footprintPolygon, existingPolygon)) {
        return {
          valid: false,
          reason: 'development_collision',
          conflictType: 'development_collision',
          coordinates: resultCoords,
          dimensions: resultDims,
          allowedTypes,
        };
      }
    }
  }

  // 5. Minimum Area Requirement
  const proposedArea = dims.width * dims.length;
  const spec = SUPPORTED_DEV_TYPES[devType];
  if (spec && spec.minArea && proposedArea < spec.minArea) {
    return {
      valid: false,
      reason: 'insufficient_buildable_area',
      conflictType: 'insufficient_buildable_area',
      coordinates: resultCoords,
      dimensions: resultDims,
      allowedTypes,
    };
  }

  // Candidate placement location valid
  return {
    valid: true,
    reason: null,
    conflictType: 'none',
    coordinates: resultCoords,
    dimensions: resultDims,
    allowedTypes,
  };
}
