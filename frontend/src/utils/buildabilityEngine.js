import spatialData from '../data/spatialFeatures.json';
import { haversineDistanceMeters, pointToSegmentDistanceMeters } from './geoUtils.js';
import { createDevelopmentModel, SUPPORTED_DEV_TYPES } from '../types/development.js';

// Configurable Real-World Setback Margins (in Meters)
export const ROAD_SAFETY_BUFFER_METERS = 4.0;
export const BUILDING_SAFETY_BUFFER_METERS = 5.0;

/**
 * Validates development placement against real geographic & building constraints.
 * Uses exact development footprint dimensions rather than an arbitrary generic circle.
 *
 * Returns { valid: boolean, reason: string, conflictType: string, dimensions: object, allowedTypes: string[] }
 */
export function validateBuildability(lat, lon, devType, existingDevs = [], properties = {}) {
  const model = createDevelopmentModel({ development_type: devType, latitude: lat, longitude: lon, properties });
  const dims = model.footprint;
  const height = model.height;

  // Real footprint half-diagonal offset
  const footprintHalfDiagonal = Math.hypot(dims.width / 2, dims.length / 2);

  // 1. Validate Coordinate Bounds (District R3 bounds in NAC study area)
  if (lat < 29.95 || lat > 30.15 || lon < 31.65 || lon > 31.88) {
    return {
      valid: false,
      reason: 'Outside allowed development area',
      conflictType: 'outside_allowed_area',
      dimensions: { width: dims.width, length: dims.length, height },
      allowedTypes: Object.keys(SUPPORTED_DEV_TYPES),
    };
  }

  // 2. Check Overlap with OSM Road Network (footprint radius + minimum road setback)
  const maxRoadCollisionDist = Math.max(dims.width, dims.length) / 2 + ROAD_SAFETY_BUFFER_METERS;

  if (spatialData && spatialData.roads) {
    for (const roadSegment of spatialData.roads) {
      for (let i = 0; i < roadSegment.length - 1; i++) {
        const [aLat, aLon] = roadSegment[i];
        const [bLat, bLon] = roadSegment[i + 1];

        const segDist = pointToSegmentDistanceMeters(lat, lon, aLat, aLon, bLat, bLon);
        if (segDist < maxRoadCollisionDist) {
          return {
            valid: false,
            reason: `Blocked — Overlaps existing OSM road corridor (${segDist.toFixed(1)}m from centerline)`,
            conflictType: 'road_collision',
            dimensions: { width: dims.width, length: dims.length, height },
            allowedTypes: Object.keys(SUPPORTED_DEV_TYPES),
          };
        }
      }
    }
  }

  // 3. Check Overlap with Existing Buildings (if building footprints present)
  const buildings = spatialData.buildings || [];
  const maxBuildingCollisionDist = footprintHalfDiagonal + BUILDING_SAFETY_BUFFER_METERS;

  for (const bldg of buildings) {
    if (!bldg.centroid) continue;
    const [bLat, bLon] = bldg.centroid;
    const dist = haversineDistanceMeters(lat, lon, bLat, bLon);
    if (dist < maxBuildingCollisionDist) {
      return {
        valid: false,
        reason: 'Blocked — Overlaps existing building footprint',
        conflictType: 'building_collision',
        dimensions: { width: dims.width, length: dims.length, height },
        allowedTypes: Object.keys(SUPPORTED_DEV_TYPES),
      };
    }
  }

  // 4. Check Overlap with Other Placed Proposed Developments
  for (const existing of existingDevs) {
    const dist = haversineDistanceMeters(lat, lon, existing.latitude, existing.longitude);
    const existingModel = createDevelopmentModel(existing);
    const existingRadius = Math.hypot(existingModel.footprint.width / 2, existingModel.footprint.length / 2);

    if (dist < (footprintHalfDiagonal + existingRadius + 5.0)) {
      return {
        valid: false,
        reason: `Blocked — Overlaps placed proposed ${existing.name || existing.id || existing.development_id}`,
        conflictType: 'development_collision',
        dimensions: { width: dims.width, length: dims.length, height },
        allowedTypes: Object.keys(SUPPORTED_DEV_TYPES),
      };
    }
  }

  return {
    valid: true,
    reason: 'Valid candidate placement location',
    conflictType: 'none',
    dimensions: { width: dims.width, length: dims.length, height },
    allowedTypes: Object.keys(SUPPORTED_DEV_TYPES),
  };
}
