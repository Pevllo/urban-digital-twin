import {
  Cartesian2,
  Cartesian3,
  Cartographic,
  Math as CesiumMath,
} from 'cesium';

import { resolveNearestZone } from './zoneResolver.js';

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
 * Geographic 3D Position Picker with safe fallback chain:
 * 1. scene.pickPosition(windowPosition)
 * 2. globe.pick(ray, scene)
 * 3. pickEllipsoid(windowPosition)
 *
 * Temporarily hides preview entity during pickPosition to prevent self-picking height jump.
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

  // Temporarily hide preview entity during pickPosition to prevent height jump
  let wasPreviewVisible = false;
  if (previewEntity) {
    wasPreviewVisible = previewEntity.show;
    previewEntity.show = false;
  }

  let cartesian = null;

  try {
    // 1. Pick 3D Building / Tileset surface
    cartesian = viewer.scene.pickPosition(windowPosition);

    // 2. Fallback: Globe terrain raycast
    if (!cartesian && viewer.scene.globe) {
      const ray = viewer.camera.getPickRay(windowPosition);
      if (ray) {
        cartesian = viewer.scene.globe.pick(ray, viewer.scene);
      }
    }

    // 3. Fallback: Ellipsoid surface picking
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
    zone_id: resolved.zone_id,
    distance_km: resolved.distance_km,
    cartesian,
  };
}
