import {
  Cartesian2,
  Cartesian3,
  Cartographic,
  Math as CesiumMath,
} from 'cesium';

import { resolveNearestZone } from './zoneResolver.js';

/**
 * Default origin reference point (Cairo / NAC study area center).
 */
export const DEFAULT_ORIGIN = { latitude: 30.015, longitude: 31.735 };

/**
 * Converts a WGS84 (latitude, longitude) coordinate to a local Tangent Plane ENU
 * metric coordinate system (x=East in meters, y=North in meters) centered at origin.
 */
export function wgs84ToLocalENU(latitude, longitude, originLat = DEFAULT_ORIGIN.latitude, originLon = DEFAULT_ORIGIN.longitude) {
  const rLat = (originLat * Math.PI) / 180.0;
  const dLat = ((latitude - originLat) * Math.PI) / 180.0;
  const dLon = ((longitude - originLon) * Math.PI) / 180.0;

  const R = 6371000.0;
  const x = dLon * R * Math.cos(rLat);
  const y = dLat * R;

  return { x, y };
}

/**
 * Converts a local Tangent Plane ENU metric coordinate (x=East meters, y=North meters)
 * back to WGS84 (latitude, longitude) centered at origin.
 */
export function localENUToWgs84(x, y, originLat = DEFAULT_ORIGIN.latitude, originLon = DEFAULT_ORIGIN.longitude) {
  const rLat = (originLat * Math.PI) / 180.0;
  const R = 6371000.0;

  const dLat = y / R;
  const dLon = x / (R * Math.cos(rLat));

  const latitude = originLat + (dLat * 180.0) / Math.PI;
  const longitude = originLon + (dLon * 180.0) / Math.PI;

  return { latitude, longitude };
}

/**
 * Rotates a 2D metric point (x, y) around origin (0, 0) by heading angle thetaDegrees (in degrees).
 */
export function rotateMetricPoint(x, y, thetaDegrees = 0) {
  if (!thetaDegrees) return { x, y };
  const rad = (thetaDegrees * Math.PI) / 180.0;
  const cosT = Math.cos(rad);
  const sinT = Math.sin(rad);

  return {
    x: x * cosT - y * sinT,
    y: x * sinT + y * cosT,
  };
}

/**
 * Converts a Cesium Cartesian3 3D position to Geographic { longitude, latitude, height } (in degrees & meters).
 */
export function cartesianToLonLat(cartesian) {
  if (!cartesian) return null;
  let cartographic = null;
  try {
    cartographic = Cartographic.fromCartesian(cartesian);
  } catch (e) {
    return null;
  }
  if (!cartographic) return null;

  const lon = CesiumMath.toDegrees(cartographic.longitude);
  const lat = CesiumMath.toDegrees(cartographic.latitude);
  const h = (typeof cartographic.height === 'number' && !Number.isNaN(cartographic.height)) ? cartographic.height : 0.0;

  if (Number.isNaN(lat) || Number.isNaN(lon)) return null;

  return { longitude: lon, latitude: lat, terrainHeight: h, height: h };
}

/**
 * Converts Geographic { longitude, latitude, height } (in degrees & meters) to a Cesium Cartesian3 3D position.
 */
export function lonLatToCartesian(longitude, latitude, height = 0.0) {
  if (typeof longitude !== 'number' || typeof latitude !== 'number' || Number.isNaN(longitude) || Number.isNaN(latitude)) return null;
  const h = (typeof height === 'number' && !Number.isNaN(height)) ? height : 0.0;
  return Cartesian3.fromDegrees(longitude, latitude, h);
}

/**
 * Haversine distance in meters between two (lat, lon) points.
 */
export function haversineDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000.0;
  const dLat = ((lat2 - lat1) * Math.PI) / 180.0;
  const dLon = ((lon2 - lon1) * Math.PI) / 180.0;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180.0) *
      Math.cos((lat2 * Math.PI) / 180.0) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function distanceBetweenCoordinates(lat1, lon1, lat2, lon2) {
  return haversineDistanceMeters(lat1, lon1, lat2, lon2);
}

/**
 * Perpendicular distance in meters from point P(pLat, pLon) to line segment A(aLat, aLon) -> B(bLat, bLon).
 */
export function pointToSegmentDistanceMeters(pLat, pLon, aLat, aLon, bLat, bLon) {
  const dAB = haversineDistanceMeters(aLat, aLon, bLat, bLon);
  if (dAB < 1e-6) return haversineDistanceMeters(pLat, pLon, aLat, aLon);

  const dAP = haversineDistanceMeters(aLat, aLon, pLat, pLon);
  const dBP = haversineDistanceMeters(bLat, bLon, pLat, pLon);

  const t = Math.max(0, Math.min(1, (dAP * dAP - dBP * dBP + dAB * dAB) / (2 * dAB * dAB)));

  const projLat = aLat + t * (bLat - aLat);
  const projLon = aLon + t * (bLon - aLon);

  return haversineDistanceMeters(pLat, pLon, projLat, projLon);
}

/**
 * Distance in meters from point P(px, py) to line segment A(ax, ay) -> B(bx, by) in 2D metric space.
 */
export function metricPointToSegmentDistance(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;

  if (lenSq < 1e-6) {
    return Math.hypot(px - ax, py - ay);
  }

  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  const projX = ax + t * dx;
  const projY = ay + t * dy;

  return Math.hypot(px - projX, py - projY);
}

/**
 * Unified building Cartesian position generator.
 * Absolute WGS84 ECEF position calculated at terrainHeight + (buildingHeight / 2)
 * so the base of the building volume rests precisely on the terrain surface
 * with HeightReference.NONE (preventing camera movement from shifting the entity).
 */
export function getBuildingPositionCartesian(longitude, latitude, terrainHeight = 0.0, buildingHeight = 0.0) {
  if (
    typeof longitude !== 'number' ||
    typeof latitude !== 'number' ||
    Number.isNaN(longitude) ||
    Number.isNaN(latitude)
  ) {
    return null;
  }
  const groundElevation = (typeof terrainHeight === 'number' && !Number.isNaN(terrainHeight)) ? terrainHeight : 0.0;
  const bldgH = (typeof buildingHeight === 'number' && !Number.isNaN(buildingHeight) && buildingHeight > 0)
    ? buildingHeight
    : 0.0;

  // Center elevation at groundElevation + (bldgH / 2) meters in absolute WGS84 ECEF space
  return Cartesian3.fromDegrees(longitude, latitude, groundElevation + (bldgH / 2.0));
}

/**
 * Calculates 4 corner points in WGS84 [longitude, latitude] degrees for a footprint centered
 * at (latitude, longitude) with specified width (meters), length (meters), and orientation (degrees).
 */
export function getDevelopmentFootprintPolygonWGS84(latitude, longitude, widthMeters, lengthMeters, orientationDegrees = 0) {
  if (
    typeof latitude !== 'number' ||
    typeof longitude !== 'number' ||
    Number.isNaN(latitude) ||
    Number.isNaN(longitude)
  ) {
    return [];
  }

  const centerENU = wgs84ToLocalENU(latitude, longitude);
  const hw = (widthMeters || 50) / 2.0;
  const hl = (lengthMeters || 50) / 2.0;

  const localCorners = [
    { x: -hw, y: hl },   // Top-Left (0)
    { x: hw, y: hl },    // Top-Right (1)
    { x: hw, y: -hl },   // Bottom-Right (2)
    { x: -hw, y: -hl },  // Bottom-Left (3)
  ];

  return localCorners.map((pt) => {
    const rot = rotateMetricPoint(pt.x, pt.y, orientationDegrees);
    const worldENU = { x: centerENU.x + rot.x, y: centerENU.y + rot.y };
    const wgs = localENUToWgs84(worldENU.x, worldENU.y);
    return [wgs.longitude, wgs.latitude];
  });
}

/**
 * Geographic 3D Position Picker anchored strictly to terrain ground surface:
 * 1. viewer.scene.globe.pick(ray, scene)  (Raycast terrain surface)
 * 2. viewer.camera.pickEllipsoid(windowPosition, ellipsoid) (Ellipsoid fallback)
 * 3. viewer.scene.pickPosition(windowPosition) (3D Tiles / Scene fallback)
 *
 * Pure function: Window coordinates -> WGS84 coordinates. Never mutates scene/entity state.
 */
export function pickGeographicLocation(viewer, clientX, clientY) {
  if (!viewer || !viewer.scene) return null;

  const canvas = viewer.scene.canvas;
  if (!canvas) return null;

  const rect = canvas.getBoundingClientRect();

  // Defensive check: Pointer must be strictly inside canvas bounds
  if (
    typeof clientX !== 'number' ||
    typeof clientY !== 'number' ||
    Number.isNaN(clientX) ||
    Number.isNaN(clientY) ||
    clientX < rect.left ||
    clientX > rect.right ||
    clientY < rect.top ||
    clientY > rect.bottom
  ) {
    return null;
  }

  const windowPosition = new Cartesian2(clientX - rect.left, clientY - rect.top);

  let cartesian = null;

  try {
    // 1. Raycast against ground terrain surface (primary ground picker)
    if (viewer.scene.globe && viewer.camera) {
      const ray = viewer.camera.getPickRay(windowPosition);
      if (ray) {
        cartesian = viewer.scene.globe.pick(ray, viewer.scene);
      }
    }

    // 2. Ellipsoid fallback
    if (!cartesian && viewer.scene.globe && viewer.camera) {
      cartesian = viewer.camera.pickEllipsoid(windowPosition, viewer.scene.globe.ellipsoid);
    }

    // 3. Scene pickPosition fallback for 3D tilesets when globe pick is unavailable
    if (!cartesian && viewer.scene.pickPositionSupported) {
      cartesian = viewer.scene.pickPosition(windowPosition);
    }
  } catch (e) {
    cartesian = null;
  }

  if (!cartesian) return null;

  const lonLat = cartesianToLonLat(cartesian);
  if (!lonLat) return null;

  const groundHeight = Number.isFinite(lonLat.terrainHeight) ? lonLat.terrainHeight : (lonLat.height || 0.0);
  const resolved = resolveNearestZone(lonLat.latitude, lonLat.longitude);

  return {
    latitude: lonLat.latitude,
    longitude: lonLat.longitude,
    height: groundHeight,
    terrainHeight: groundHeight,
    zone_id: resolved.zone_id,
    distance_km: resolved.distance_km,
    cartesian,
  };
}

/**
 * Checks if two 2D line segments (p1->p2) and (p3->p4) intersect.
 */
export function doLineSegmentsIntersect(p1, p2, p3, p4) {
  function ccw(A, B, C) {
    return (C.y - A.y) * (B.x - A.x) > (B.y - A.y) * (C.x - A.x);
  }
  return (
    ccw(p1, p3, p4) !== ccw(p2, p3, p4) &&
    ccw(p1, p2, p3) !== ccw(p1, p2, p4)
  );
}

/**
 * Tests if a 2D point {x, y} lies strictly inside a polygon [{x, y}, ...].
 * Ray-casting algorithm.
 */
export function isPointInPolygon(pt, polygon) {
  if (!Array.isArray(polygon) || polygon.length < 3) return false;
  let inside = false;
  const numPts = polygon.length;
  for (let i = 0, j = numPts - 1; i < numPts; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;

    const intersect =
      yi > pt.y !== yj > pt.y &&
      pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Computes area in m² of a 2D polygon [{x, y}, ...].
 */
export function computePolygonArea(polygon) {
  if (!Array.isArray(polygon) || polygon.length < 3) return 0.0;
  const n = polygon.length;
  let area = 0.0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += polygon[i].x * polygon[j].y - polygon[j].x * polygon[i].y;
  }
  return Math.abs(area) / 2.0;
}

/**
 * Checks if two 2D polygons intersect (edge cross OR containment).
 */
export function doPolygonsIntersect(polyA, polyB) {
  if (!Array.isArray(polyA) || !Array.isArray(polyB) || polyA.length < 3 || polyB.length < 3) return false;

  // 1. Edge-edge intersection test
  for (let i = 0; i < polyA.length; i++) {
    const a1 = polyA[i];
    const a2 = polyA[(i + 1) % polyA.length];
    for (let j = 0; j < polyB.length; j++) {
      const b1 = polyB[j];
      const b2 = polyB[(j + 1) % polyB.length];
      if (doLineSegmentsIntersect(a1, a2, b1, b2)) {
        return true;
      }
    }
  }

  // 2. PolyA inside PolyB test
  if (isPointInPolygon(polyA[0], polyB)) return true;

  // 3. PolyB inside PolyA test
  if (isPointInPolygon(polyB[0], polyA)) return true;

  return false;
}

/**
 * Minimum distance between a 2D polygon and a 2D line segment (ax, ay -> bx, by).
 */
export function polygonToSegmentDistance(polyPoints, ax, ay, bx, by) {
  let minDistance = Infinity;

  for (const pt of polyPoints) {
    const d = metricPointToSegmentDistance(pt.x, pt.y, ax, ay, bx, by);
    if (d < minDistance) minDistance = d;
  }

  for (let i = 0; i < polyPoints.length; i++) {
    const p1 = polyPoints[i];
    const p2 = polyPoints[(i + 1) % polyPoints.length];

    const midX = (p1.x + p2.x) / 2.0;
    const midY = (p1.y + p2.y) / 2.0;
    const dMid = metricPointToSegmentDistance(midX, midY, ax, ay, bx, by);
    if (dMid < minDistance) minDistance = dMid;
  }

  return minDistance;
}

/**
 * Tests if innerPoly lies ENTIRELY inside outerPoly (all vertices inside + no edge intersections).
 */
export function isPolygonInsidePolygon(innerPoly, outerPoly) {
  if (!Array.isArray(innerPoly) || !Array.isArray(outerPoly)) return false;
  for (const pt of innerPoly) {
    if (!isPointInPolygon(pt, outerPoly)) return false;
  }

  for (let i = 0; i < innerPoly.length; i++) {
    const i1 = innerPoly[i];
    const i2 = innerPoly[(i + 1) % innerPoly.length];
    for (let j = 0; j < outerPoly.length; j++) {
      const o1 = outerPoly[j];
      const o2 = outerPoly[(j + 1) % outerPoly.length];
      if (doLineSegmentsIntersect(i1, i2, o1, o2)) return false;
    }
  }

  return true;
}
