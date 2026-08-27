import spatialData from '../data/spatialFeatures.json';
import { haversineDistanceMeters, pointToSegmentDistanceMeters } from './geoUtils.js';
import { createDevelopmentModel, SUPPORTED_DEV_TYPES } from '../types/development.js';

// Configurable Real-World Setback Clearance (in Meters)
export const ROAD_CLEARANCE_METERS = 5.0;
export const BUILDING_CLEARANCE_METERS = 5.0;
export const DEVELOPMENT_CLEARANCE_METERS = 5.0;

/**
 * Computes dynamic geographic bounding box extent from currently loaded spatial dataset.
 * Returns null if dataset has no spatial geometry.
 */
export function getCityExtent(spatialDataset = spatialData) {
  if (!spatialDataset || !spatialDataset.roads || !Array.isArray(spatialDataset.roads) || spatialDataset.roads.length === 0) {
    return null;
  }

  let minLat = 90.0;
  let maxLat = -90.0;
  let minLon = 180.0;
  let maxLon = -180.0;

  for (const seg of spatialDataset.roads) {
    for (const [rLat, rLon] of seg) {
      if (rLat < minLat) minLat = rLat;
      if (rLat > maxLat) maxLat = rLat;
      if (rLon < minLon) minLon = rLon;
      if (rLon > maxLon) maxLon = rLon;
    }
  }

  // 500m (~0.0045 deg) study area buffer around spatial network
  const buf = 0.0045;
  return {
    minLat: minLat - buf,
    maxLat: maxLat + buf,
    minLon: minLon - buf,
    maxLon: maxLon + buf,
  };
}

/**
 * Calculates geographic corner coordinates of a rectangular footprint (W x L in meters)
 * centered at (lat, lon).
 */
export function getFootprintCorners(lat, lon, widthMeters, lengthMeters) {
  const latOffset = (lengthMeters / 2.0) / 111000.0;
  const lonOffset = (widthMeters / 2.0) / (111000.0 * Math.cos((lat * Math.PI) / 180.0));

  return [
    { lat: lat + latOffset, lon: lon - lonOffset }, // Top-Left
    { lat: lat + latOffset, lon: lon + lonOffset }, // Top-Right
    { lat: lat - latOffset, lon: lon + lonOffset }, // Bottom-Right
    { lat: lat - latOffset, lon: lon - lonOffset }, // Bottom-Left
  ];
}

/**
 * Calculates axis-aligned bounding box (AABB) in degrees for a development footprint.
 */
export function getFootprintAABB(lat, lon, widthMeters, lengthMeters, clearanceMeters = 0.0) {
  const totalLength = lengthMeters + clearanceMeters * 2.0;
  const totalWidth = widthMeters + clearanceMeters * 2.0;

  const latOffset = (totalLength / 2.0) / 111000.0;
  const lonOffset = (totalWidth / 2.0) / (111000.0 * Math.cos((lat * Math.PI) / 180.0));

  return {
    minLat: lat - latOffset,
    maxLat: lat + latOffset,
    minLon: lon - lonOffset,
    maxLon: lon + lonOffset,
  };
}

/**
 * Tests whether two footprint AABBs overlap.
 */
export function aabbsOverlap(boxA, boxB) {
  return !(
    boxA.maxLat < boxB.minLat ||
    boxA.minLat > boxB.maxLat ||
    boxA.maxLon < boxB.minLon ||
    boxA.minLon > boxB.maxLon
  );
}

/**
 * Validates development placement against dynamic city boundaries, road network,
 * existing building footprints, and placed developments using footprint geometry.
 *
 * Returns uniform validation structure:
 * {
 *   valid: boolean,
 *   reason: string | null,
 *   conflictType: "none" | "invalid_coordinates" | "outside_city_bounds" | "road_collision" | "building_collision" | "development_collision",
 *   coordinates: { longitude, latitude, terrainHeight },
 *   dimensions: { width, length, height, buildingHeight },
 *   allowedTypes: string[]
 * }
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
  const resultCoords = { longitude: lon, latitude: lat, terrainHeight: model.z || 0.0 };
  const resultDims = { width: dims.width, length: dims.length, height: bldgHeight, buildingHeight: bldgHeight };
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

  const proposedAABB = getFootprintAABB(lat, lon, dims.width, dims.length, ROAD_CLEARANCE_METERS);
  const corners = getFootprintCorners(lat, lon, dims.width, dims.length);

  // 2. Road Network Collision (Footprint AABB pre-check + corner/center segment clearance math)
  if (spatialData && spatialData.roads) {
    for (const roadSeg of spatialData.roads) {
      // Calculate road segment bounding box
      let rMinLat = 90, rMaxLat = -90, rMinLon = 180, rMaxLon = -180;
      for (const [rLat, rLon] of roadSeg) {
        if (rLat < rMinLat) rMinLat = rLat;
        if (rLat > rMaxLat) rMaxLat = rLat;
        if (rLon < rMinLon) rMinLon = rLon;
        if (rLon > rMaxLon) rMaxLon = rLon;
      }

      // Fast AABB pre-check
      if (!aabbsOverlap(proposedAABB, { minLat: rMinLat, maxLat: rMaxLat, minLon: rMinLon, maxLon: rMaxLon })) {
        continue;
      }

      for (let i = 0; i < roadSeg.length - 1; i++) {
        const [aLat, aLon] = roadSeg[i];
        const [bLat, bLon] = roadSeg[i + 1];

        // Check center clearance
        const centerDist = pointToSegmentDistanceMeters(lat, lon, aLat, aLon, bLat, bLon);
        const minCenterDist = Math.min(dims.width, dims.length) / 2.0 + ROAD_CLEARANCE_METERS;

        if (centerDist < minCenterDist) {
          return {
            valid: false,
            reason: 'road_collision',
            conflictType: 'road_collision',
            coordinates: resultCoords,
            dimensions: resultDims,
            allowedTypes,
          };
        }

        // Check corner clearances to road polyline
        for (const corner of corners) {
          const cornerDist = pointToSegmentDistanceMeters(corner.lat, corner.lon, aLat, aLon, bLat, bLon);
          if (cornerDist < ROAD_CLEARANCE_METERS) {
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
  }

  // 3. Existing Building Collision
  const buildings = spatialData.buildings || [];
  const footprintHalfDiag = Math.hypot(dims.width / 2, dims.length / 2);

  for (const bldg of buildings) {
    if (!bldg.centroid) continue;
    const [bLat, bLon] = bldg.centroid;
    const dist = haversineDistanceMeters(lat, lon, bLat, bLon);

    const bldgRadius = bldg.radius || 12.0;
    if (dist < (footprintHalfDiag + bldgRadius + BUILDING_CLEARANCE_METERS)) {
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

  // 4. Placed Proposed Developments Collision (using stored footprint dimensions)
  const devAABB = getFootprintAABB(lat, lon, dims.width, dims.length, DEVELOPMENT_CLEARANCE_METERS);

  for (const existing of existingDevs) {
    const existingLat = Number(existing.latitude);
    const existingLon = Number(existing.longitude);
    const existingModel = createDevelopmentModel(existing);

    const existingAABB = getFootprintAABB(
      existingLat,
      existingLon,
      existingModel.footprint.width,
      existingModel.footprint.length,
      DEVELOPMENT_CLEARANCE_METERS
    );

    if (aabbsOverlap(devAABB, existingAABB)) {
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

  // Placement candidate valid
  return {
    valid: true,
    reason: null,
    conflictType: 'none',
    coordinates: resultCoords,
    dimensions: resultDims,
    allowedTypes,
  };
}
