import {
  Cartesian2,
  Cartesian3,
  Cartographic,
  Math as CesiumMath,
} from 'cesium';

import { resolveNearestZone } from './zoneResolver.js';

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
 * Robust Geographic 3D Picking Helper.
 * Excludes preview entities temporarily during pickPosition to prevent height snapping bugs.
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

  // Temporarily hide preview entity during pickPosition to prevent self-picking height jump
  let wasPreviewVisible = false;
  if (previewEntity) {
    wasPreviewVisible = previewEntity.show;
    previewEntity.show = false;
  }

  let cartesian = null;

  try {
    // 1. Pick 3D Tileset / Building surface
    cartesian = viewer.scene.pickPosition(windowPosition);

    // 2. Fallback: Globe raycast picking
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

  const cartographic = Cartographic.fromCartesian(cartesian);
  if (!cartographic) return null;

  const lon = CesiumMath.toDegrees(cartographic.longitude);
  const lat = CesiumMath.toDegrees(cartographic.latitude);

  if (Number.isNaN(lat) || Number.isNaN(lon)) return null;

  const resolved = resolveNearestZone(lat, lon);

  return {
    latitude: lat,
    longitude: lon,
    zone_id: resolved.zone_id,
    distance_km: resolved.distance_km,
    cartesian,
  };
}
