import spatialData from '../data/spatialFeatures.json';
import {
  wgs84ToLocalENU,
  localENUToWgs84,
  rotateMetricPoint,
  metricPointToSegmentDistance,
  haversineDistanceMeters,
} from './geoUtils.js';
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

/**
 * Diagnostics reporter for loaded GIS dataset.
 */
export function getDatasetDiagnostics(spatialDataset = spatialData) {
  const roads = spatialDataset?.roads || [];
  const buildings = spatialDataset?.buildings || [];

  const highwayCounts = {};
  roads.forEach((r) => {
    const hw = r.highway || 'unknown';
    highwayCounts[hw] = (highwayCounts[hw] || 0) + 1;
  });

  return {
    totalRoadsLoaded: roads.length,
    totalBuildingsLoaded: buildings.length,
    highwayCounts,
    extent: getCityExtent(spatialDataset),
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
    { x: -hw, y: hl },   // Top-Left corner
    { x: hw, y: hl },    // Top-Right corner
    { x: hw, y: -hl },   // Bottom-Right corner
    { x: -hw, y: -hl },  // Bottom-Left corner
    { x: 0, y: hl },     // Top-Edge midpoint
    { x: hw, y: 0 },     // Right-Edge midpoint
    { x: 0, y: -hl },    // Bottom-Edge midpoint
    { x: -hw, y: 0 },    // Left-Edge midpoint
    { x: 0, y: 0 },      // Center point
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
 * using Local Tangent Plane ENU metric geometry (1 unit = 1 meter).
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

  const resultCoords = { longitude: lon, latitude: lat, terrainHeight: model.z || 0.0 };
  const resultDims = { width: dims.width, length: dims.length, height: bldgHeight, buildingHeight: bldgHeight, orientation };
  const allowedTypes = Object.keys(SUPPORTED_DEV_TYPES);

  // 1. Dynamic City Extent Check
  const cityExtent = getCityExtent(spatialData);
  if (!cityExtent) {
    return {
      valid: false,
      reason: 'outside_city_bounds',
      conflictType: 'outside_city_bounds',
      coordinates: resultCoords,
      dimensions: resultDims,
      allowedTypes,
    };
  }

  if (lat < cityExtent.minLat || lat > cityExtent.maxLat || lon < cityExtent.minLon || lon > cityExtent.maxLon) {
    return {
      valid: false,
      reason: 'outside_city_bounds',
      conflictType: 'outside_city_bounds',
      coordinates: resultCoords,
      dimensions: resultDims,
      allowedTypes,
    };
  }

  // Convert proposed building center to Local ENU Metric Coordinates (meters)
  const centerENU = wgs84ToLocalENU(lat, lon);
  const pointsENU = getMetricFootprintPoints(centerENU, dims.width, dims.length, orientation);
  const proposedAABB = getMetricAABB(pointsENU, ROAD_CLEARANCE_METERS);

  // 2. Road Network Collision (Two-stage Metric ENU Clearance Math)
  const roads = spatialData?.roads || [];

  for (const roadFeature of roads) {
    const rawCoords = roadFeature.coordinates || roadFeature;
    if (!Array.isArray(rawCoords) || rawCoords.length < 2) continue;

    const hwType = roadFeature.highway || 'default';
    const roadWidth = ROAD_WIDTH_BY_TYPE[hwType] || ROAD_WIDTH_BY_TYPE.default;
    const clearanceThreshold = (roadWidth / 2.0) + ROAD_CLEARANCE_METERS;

    // Convert road points to local ENU meters
    const enuRoadPts = rawCoords.map((pt) => {
      const rLat = Array.isArray(pt) ? pt[0] : pt.latitude;
      const rLon = Array.isArray(pt) ? pt[1] : pt.longitude;
      return wgs84ToLocalENU(rLat, rLon);
    });

    // Stage 1: Fast Metric AABB Pre-filter
    let rMinX = Infinity, rMaxX = -Infinity, rMinY = Infinity, rMaxY = -Infinity;
    enuRoadPts.forEach((pt) => {
      if (pt.x < rMinX) rMinX = pt.x;
      if (pt.x > rMaxX) rMaxX = pt.x;
      if (pt.y < rMinY) rMinY = pt.y;
      if (pt.y > rMaxY) rMaxY = pt.y;
    });

    const roadAABB = {
      minX: rMinX - clearanceThreshold,
      maxX: rMaxX + clearanceThreshold,
      minY: rMinY - clearanceThreshold,
      maxY: rMaxY + clearanceThreshold,
    };

    if (!metricAABBsOverlap(proposedAABB, roadAABB)) {
      continue;
    }

    // Stage 2: Exact Metric Segment Clearance Check against footprint sample points
    for (let i = 0; i < enuRoadPts.length - 1; i++) {
      const a = enuRoadPts[i];
      const b = enuRoadPts[i + 1];

      for (const pt of pointsENU) {
        const ptDist = metricPointToSegmentDistance(pt.x, pt.y, a.x, a.y, b.x, b.y);
        if (ptDist < clearanceThreshold) {
          return {
            valid: false,
            reason: 'road_collision',
            conflictType: 'road_collision',
            coordinates: resultCoords,
            dimensions: resultDims,
            allowedTypes,
          };
        }
      }
    }
  }

  // 3. Existing Building Collision in Local ENU Metric Coordinates
  const buildings = spatialData?.buildings || [];

  for (const bldg of buildings) {
    if (!bldg.centroid) continue;
    const [bLat, bLon] = bldg.centroid;
    const bldgENU = wgs84ToLocalENU(bLat, bLon);
    const bldgRadius = bldg.radius || 12.0;

    for (const pt of pointsENU) {
      const distMeters = Math.hypot(pt.x - bldgENU.x, pt.y - bldgENU.y);
      if (distMeters < (bldgRadius + BUILDING_CLEARANCE_METERS)) {
        return {
          valid: false,
          reason: 'building_collision',
          conflictType: 'building_collision',
          coordinates: resultCoords,
          dimensions: resultDims,
          allowedTypes,
        };
      }
    }
  }

  // 4. Placed Proposed Developments Collision in Metric Coordinates
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

    const existingAABB = getMetricAABB(existingPoints, DEVELOPMENT_CLEARANCE_METERS);

    if (metricAABBsOverlap(proposedAABB, existingAABB)) {
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
