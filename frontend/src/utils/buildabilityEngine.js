import spatialData from '../data/spatialFeatures.json';
import { haversineDistanceMeters, pointToSegmentDistanceMeters } from './geoUtils.js';
import { createDevelopmentModel, SUPPORTED_DEV_TYPES } from '../types/development.js';

// Configurable Real-World Setback Clearance (in Meters)
export const ROAD_CLEARANCE_METERS = 5.0;
export const BUILDING_CLEARANCE_METERS = 6.0;
export const DEVELOPMENT_CLEARANCE_METERS = 5.0;

/**
 * Computes dynamic geographic bounding box extent from currently loaded spatial features.
 * Adapts automatically if city dataset changes.
 */
export function getCityExtent(spatialDataset = spatialData) {
  if (!spatialDataset || !spatialDataset.roads || spatialDataset.roads.length === 0) {
    // Fallback bounds
    return { minLat: 29.80, maxLat: 30.20, minLon: 31.50, maxLon: 31.95 };
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

  // Add 500m (~0.0045 degree) boundary buffer around study area
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
 * Validates development placement against city boundaries, road network, building footprints,
 * and existing placed developments using exact footprint geometry.
 *
 * Returns uniform validation structure:
 * {
 *   valid: boolean,
 *   reason: string | null,
 *   conflictType: "none" | "invalid_coordinates" | "outside_city_bounds" | "road_collision" | "building_collision" | "development_collision",
 *   coordinates: { longitude, latitude, height },
 *   dimensions: { width, length, height },
 *   allowedTypes: string[]
 * }
 */
export function validateBuildability(lat, lon, devType, existingDevs = [], properties = {}, height = 0) {
  if (typeof lat !== 'number' || typeof lon !== 'number' || Number.isNaN(lat) || Number.isNaN(lon)) {
    return {
      valid: false,
      reason: 'invalid_coordinates',
      conflictType: 'invalid_coordinates',
      coordinates: { longitude: lon || 0, latitude: lat || 0, height },
      dimensions: { width: 50, length: 50, height: 15 },
      allowedTypes: Object.keys(SUPPORTED_DEV_TYPES),
    };
  }

  const model = createDevelopmentModel({ development_type: devType, latitude: lat, longitude: lon, properties, height });
  const dims = model.footprint;
  const devHeight = model.height;

  const resultCoords = { longitude: lon, latitude: lat, height: devHeight };
  const resultDims = { width: dims.width, length: dims.length, height: devHeight };
  const allowedTypes = Object.keys(SUPPORTED_DEV_TYPES);

  // 1. Dynamic City Extent Check
  const cityExtent = getCityExtent(spatialData);
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

  // Calculate 4 corners of proposed development footprint box
  const corners = getFootprintCorners(lat, lon, dims.width, dims.length);

  // 2. Road Network Collision (test footprint box corners & center against road segment clearance)
  if (spatialData && spatialData.roads) {
    for (const roadSeg of spatialData.roads) {
      for (let i = 0; i < roadSeg.length - 1; i++) {
        const [aLat, aLon] = roadSeg[i];
        const [bLat, bLon] = roadSeg[i + 1];

        // Check center distance
        const centerDist = pointToSegmentDistanceMeters(lat, lon, aLat, aLon, bLat, bLon);
        const centerThreshold = Math.min(dims.width, dims.length) / 2.0 + ROAD_CLEARANCE_METERS;

        if (centerDist < centerThreshold) {
          return {
            valid: false,
            reason: 'road_collision',
            conflictType: 'road_collision',
            coordinates: resultCoords,
            dimensions: resultDims,
            allowedTypes,
          };
        }

        // Check each footprint corner distance to road line segment
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

  // 3. Existing Building Footprint Collision
  const buildings = spatialData.buildings || [];
  const footprintHalfDiag = Math.hypot(dims.width / 2, dims.length / 2);

  for (const bldg of buildings) {
    if (!bldg.centroid) continue;
    const [bLat, bLon] = bldg.centroid;
    const dist = haversineDistanceMeters(lat, lon, bLat, bLon);

    // If building size is known, use its radius; otherwise use default 12m
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

  // 4. Other Placed Proposed Developments Collision (using stored footprint dimensions)
  for (const existing of existingDevs) {
    const existingLat = Number(existing.latitude);
    const existingLon = Number(existing.longitude);
    const dist = haversineDistanceMeters(lat, lon, existingLat, existingLon);

    const existingModel = createDevelopmentModel(existing);
    const existingHalfDiag = Math.hypot(existingModel.footprint.width / 2, existingModel.footprint.length / 2);

    if (dist < (footprintHalfDiag + existingHalfDiag + DEVELOPMENT_CLEARANCE_METERS)) {
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

  // Candidate location valid
  return {
    valid: true,
    reason: null,
    conflictType: 'none',
    coordinates: resultCoords,
    dimensions: resultDims,
    allowedTypes,
  };
}
