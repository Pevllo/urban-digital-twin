// Spatial validation engine for 3D developments against real OSM geometry.
// Source of truth: spatialFeatures.json (OSM roads, buildings, boundaries).

import {
  geoToLocal,
  polygonBoundingBox,
  boxesOverlap,
  polygonToSegmentDistance,
  polygonsIntersect,
  pointInPolygon,
  pointToSegmentDistance,
  localToGeo,
} from "./developmentGeometry.js";
import { SPATIAL_FEATURES, CITY_BOUNDS } from "../../../config/mapConfig.js";

// Safety setback buffers in meters by highway type
export const ROAD_SAFETY_SETBACKS = {
  motorway: 16.0,
  motorway_link: 14.0,
  trunk: 15.0,
  trunk_link: 13.0,
  primary: 13.0,
  primary_link: 11.0,
  secondary: 10.0,
  secondary_link: 9.0,
  tertiary: 8.0,
  tertiary_link: 7.0,
  residential: 6.0,
  unclassified: 6.0,
  service: 5.0,
  construction: 6.0,
};

export const DEFAULT_ROAD_SETBACK = 6.0;
export const ROUNDABOUT_SAFETY_BUFFER = 15.0;
export const INTERSECTION_SAFETY_BUFFER = 12.0;
export const BUILDING_COLLISION_BUFFER = 2.0; // Extra clearance from existing OSM buildings in meters

export function getRoadSetback(highway) {
  return ROAD_SAFETY_SETBACKS[highway] || DEFAULT_ROAD_SETBACK;
}

// Check if a point (lat, lon) is inside project bounds
export function isInsideProjectBounds(lat, lon, bounds = CITY_BOUNDS) {
  const minLat = bounds.min_lat ?? bounds.south ?? 29.96;
  const maxLat = bounds.max_lat ?? bounds.north ?? 30.12;
  const minLon = bounds.min_lon ?? bounds.west ?? 31.65;
  const maxLon = bounds.max_lon ?? bounds.east ?? 31.86;

  return lat >= minLat && lat <= maxLat && lon >= minLon && lon <= maxLon;
}

// Filter OSM roads near an anchor point
export function getNearbyRoads(anchorLat, anchorLon, radiusMeters = 250, spatialData = SPATIAL_FEATURES) {
  const roads = spatialData?.roads || [];
  const nearby = [];

  for (let r = 0; r < roads.length; r++) {
    const road = roads[r];
    const coords = road.coordinates;
    if (!coords || coords.length < 2) continue;

    // Fast reject using bounding box
    let hasPointNear = false;
    for (let i = 0; i < coords.length; i++) {
      const loc = geoToLocal(coords[i][0], coords[i][1], anchorLat, anchorLon);
      if (Math.abs(loc.x) <= radiusMeters && Math.abs(loc.y) <= radiusMeters) {
        hasPointNear = true;
        break;
      }
    }

    if (hasPointNear) {
      nearby.push(road);
    }
  }

  return nearby;
}

// Filter OSM buildings near an anchor point
export function getNearbyBuildings(anchorLat, anchorLon, radiusMeters = 250, spatialData = SPATIAL_FEATURES) {
  const buildings = spatialData?.buildings || [];
  const nearby = [];

  for (let b = 0; b < buildings.length; b++) {
    const bldg = buildings[b];
    if (bldg.centroid) {
      const loc = geoToLocal(bldg.centroid[0], bldg.centroid[1], anchorLat, anchorLon);
      const bldgRadius = bldg.radius || 30;
      if (Math.hypot(loc.x, loc.y) <= radiusMeters + bldgRadius) {
        nearby.push(bldg);
        continue;
      }
    } else if (bldg.coordinates && bldg.coordinates.length > 0) {
      const first = bldg.coordinates[0];
      const loc = geoToLocal(first[0], first[1], anchorLat, anchorLon);
      if (Math.hypot(loc.x, loc.y) <= radiusMeters + 50) {
        nearby.push(bldg);
      }
    }
  }

  return nearby;
}

// Check if a local building polygon collides with any road or violates road setback
export function checkRoadCollision(buildingPoly, anchorLat, anchorLon, nearbyRoads) {
  const polyBox = polygonBoundingBox(buildingPoly);

  for (let r = 0; r < nearbyRoads.length; r++) {
    const road = nearbyRoads[r];
    const coords = road.coordinates;
    if (!coords || coords.length < 2) continue;

    let requiredSetback = getRoadSetback(road.highway);
    if (road.junction === "roundabout") {
      requiredSetback = Math.max(requiredSetback, ROUNDABOUT_SAFETY_BUFFER);
    }

    for (let i = 0; i < coords.length - 1; i++) {
      const p1 = geoToLocal(coords[i][0], coords[i][1], anchorLat, anchorLon);
      const p2 = geoToLocal(coords[i + 1][0], coords[i + 1][1], anchorLat, anchorLon);

      // Fast AABB check for segment
      const segMinX = Math.min(p1.x, p2.x) - requiredSetback;
      const segMaxX = Math.max(p1.x, p2.x) + requiredSetback;
      const segMinY = Math.min(p1.y, p2.y) - requiredSetback;
      const segMaxY = Math.max(p1.y, p2.y) + requiredSetback;

      if (
        polyBox.maxX < segMinX ||
        polyBox.minX > segMaxX ||
        polyBox.maxY < segMinY ||
        polyBox.minY > segMaxY
      ) {
        continue;
      }

      const dist = polygonToSegmentDistance(buildingPoly, p1.x, p1.y, p2.x, p2.y);
      if (dist < requiredSetback) {
        return {
          collided: true,
          roadId: road.id,
          highway: road.highway,
          distance: dist,
          requiredSetback,
        };
      }
    }
  }

  return { collided: false };
}

// Check if a local building polygon collides with any existing OSM building
export function checkBuildingCollision(buildingPoly, anchorLat, anchorLon, nearbyBuildings) {
  const polyBox = polygonBoundingBox(buildingPoly);

  for (let b = 0; b < nearbyBuildings.length; b++) {
    const bldg = nearbyBuildings[b];
    const coords = bldg.coordinates;
    if (!coords || coords.length < 3) continue;

    const osmLocalPoly = coords.map(([lat, lon]) =>
      geoToLocal(lat, lon, anchorLat, anchorLon)
    );

    const osmBox = polygonBoundingBox(osmLocalPoly);
    if (!boxesOverlap(polyBox, osmBox, BUILDING_COLLISION_BUFFER)) {
      continue;
    }

    if (polygonsIntersect(buildingPoly, osmLocalPoly)) {
      return {
        collided: true,
        buildingId: bldg.id,
      };
    }
  }

  return { collided: false };
}

// Validate an individual proposed building candidate footprint
export function validateBuildingCandidate(
  buildingPoly,
  anchorLat,
  anchorLon,
  nearbyRoads,
  nearbyBuildings,
  plotPoly = null,
  bounds = CITY_BOUNDS
) {
  // 1. Inside intended development plot boundary (if specified)
  if (plotPoly && plotPoly.length >= 3) {
    for (let i = 0; i < buildingPoly.length; i++) {
      if (!pointInPolygon(buildingPoly[i].x, buildingPoly[i].y, plotPoly)) {
        return { valid: false, reason: "outside_plot_boundary" };
      }
    }
  }

  // 2. Project bounds check for all vertices
  for (let i = 0; i < buildingPoly.length; i++) {
    const geo = localToGeo(buildingPoly[i].x, buildingPoly[i].y, anchorLat, anchorLon);
    if (!isInsideProjectBounds(geo.lat, geo.lon, bounds)) {
      return { valid: false, reason: "outside_project_bounds" };
    }
  }

  // 3. Road collision & setback violation check
  const roadCheck = checkRoadCollision(buildingPoly, anchorLat, anchorLon, nearbyRoads);
  if (roadCheck.collided) {
    return { valid: false, reason: "road_collision", details: roadCheck };
  }

  // 4. Existing OSM building collision check
  const bldgCheck = checkBuildingCollision(buildingPoly, anchorLat, anchorLon, nearbyBuildings);
  if (bldgCheck.collided) {
    return { valid: false, reason: "building_collision", details: bldgCheck };
  }

  return { valid: true };
}

// Fast check if a single lat/lon point is buildable (not on a road or existing building)
export function isPointBuildable(lat, lon, spatialData = SPATIAL_FEATURES, minRoadClearance = 8.0) {
  if (!isInsideProjectBounds(lat, lon)) {
    return false;
  }

  const nearbyRoads = getNearbyRoads(lat, lon, 100, spatialData);
  for (let r = 0; r < nearbyRoads.length; r++) {
    const road = nearbyRoads[r];
    const coords = road.coordinates;
    if (!coords || coords.length < 2) continue;

    const clearance = Math.max(minRoadClearance, getRoadSetback(road.highway));
    for (let i = 0; i < coords.length - 1; i++) {
      const p1 = geoToLocal(coords[i][0], coords[i][1], lat, lon);
      const p2 = geoToLocal(coords[i + 1][0], coords[i + 1][1], lat, lon);
      const dist = pointToSegmentDistance(0, 0, p1.x, p1.y, p2.x, p2.y);
      if (dist < clearance) {
        return false;
      }
    }
  }

  const nearbyBuildings = getNearbyBuildings(lat, lon, 100, spatialData);
  for (let b = 0; b < nearbyBuildings.length; b++) {
    const bldg = nearbyBuildings[b];
    const coords = bldg.coordinates;
    if (!coords || coords.length < 3) continue;

    const poly = coords.map(([bLat, bLon]) => geoToLocal(bLat, bLon, lat, lon));
    if (pointInPolygon(0, 0, poly)) {
      return false;
    }
  }

  return true;
}

// If the clicked location is on a road or invalid area, find the nearest genuinely valid buildable location
export function findNearestValidPosition(
  targetLat,
  targetLon,
  spatialData = SPATIAL_FEATURES,
  maxSearchRadius = 75,
  stepMeters = 8
) {
  if (isPointBuildable(targetLat, targetLon, spatialData, 10.0)) {
    return { lat: targetLat, lon: targetLon, adjusted: false };
  }

  // Search in expanding concentric rings
  for (let radius = stepMeters; radius <= maxSearchRadius; radius += stepMeters) {
    const samples = Math.max(8, Math.round((2 * Math.PI * radius) / stepMeters));
    for (let s = 0; s < samples; s++) {
      const angle = (2 * Math.PI * s) / samples;
      const dx = radius * Math.cos(angle);
      const dy = radius * Math.sin(angle);
      const cand = localToGeo(dx, dy, targetLat, targetLon);

      if (isPointBuildable(cand.lat, cand.lon, spatialData, 10.0)) {
        return {
          lat: cand.lat,
          lon: cand.lon,
          adjusted: true,
          offsetMeters: radius,
        };
      }
    }
  }

  // If no valid spot found within max radius, return null
  return null;
}
