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
 * Geographic 3D Position Picker with safe fallback chain:
 * 1. scene.pickPosition(windowPosition)
 * 2. globe.pick(ray, scene)
 * 3. pickEllipsoid(windowPosition)
 */
export function pickGeographicLocation(viewer, clientX, clientY, previewEntity = null) {
  if (!viewer || !viewer.scene) return null;

  const canvas = viewer.scene.canvas;
  if (!canvas) return null;

  const rect = canvas.getBoundingClientRect();

  if (
    clientX < rect.left ||
    clientX > rect.right ||
    clientY < rect.top ||
    clientY > rect.bottom
  ) {
    return null;
  }

  const windowPosition = new Cartesian2(clientX - rect.left, clientY - rect.top);

  let wasPreviewVisible = false;
  if (previewEntity) {
    wasPreviewVisible = previewEntity.show;
    previewEntity.show = false;
  }

  let cartesian = null;

  try {
    cartesian = viewer.scene.pickPosition(windowPosition);

    if (!cartesian && viewer.scene.globe) {
      const ray = viewer.camera.getPickRay(windowPosition);
      if (ray) {
        cartesian = viewer.scene.globe.pick(ray, viewer.scene);
      }
    }

    if (!cartesian && viewer.scene.globe) {
      cartesian = viewer.camera.pickEllipsoid(windowPosition, viewer.scene.globe.ellipsoid);
    }
  } finally {
    if (previewEntity) {
      previewEntity.show = wasPreviewVisible;
    }
  }

  if (!cartesian) return null;

  const lonLat = cartesianToLonLat(cartesian);
  if (!lonLat) return null;

  const resolved = resolveNearestZone(lonLat.latitude, lonLat.longitude);

  return {
    latitude: lonLat.latitude,
    longitude: lonLat.longitude,
    height: lonLat.height,
    terrainHeight: lonLat.terrainHeight,
    zone_id: resolved.zone_id,
    distance_km: resolved.distance_km,
    cartesian,
  };
}
