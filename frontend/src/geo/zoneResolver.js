/**
 * Geographic Zone Resolver Module — AI Urban Digital Twin
 *
 * Resolves picking (longitude, latitude) coordinates to the nearest
 * OSM zone centroid from zone_osm_mapping_v2.csv using the Haversine formula.
 */

import { ZONE_DATASETS } from './zonesData.js';

const EARTH_RADIUS_KM = 6371.0;

/**
 * Calculates the Haversine distance in kilometers between two (lat, lon) points.
 */
export function haversineDistanceKm(lat1, lon1, lat2, lon2) {
  const dLat = (lat2 - lat1) * (Math.PI / 180.0);
  const dLon = (lon2 - lon1) * (Math.PI / 180.0);

  const rLat1 = lat1 * (Math.PI / 180.0);
  const rLat2 = lat2 * (Math.PI / 180.0);

  const a =
    Math.sin(dLat / 2.0) * Math.sin(dLat / 2.0) +
    Math.cos(rLat1) * Math.cos(rLat2) * Math.sin(dLon / 2.0) * Math.sin(dLon / 2.0);

  const c = 2.0 * Math.atan2(Math.sqrt(a), Math.sqrt(1.0 - a));
  return EARTH_RADIUS_KM * c;
}

/**
 * Resolves (latitude, longitude) to the nearest zone from the zone dataset.
 *
 * @param {number} latitude - WGS84 Latitude in degrees (-90 to 90)
 * @param {number} longitude - WGS84 Longitude in degrees (-180 to 180)
 * @param {Array} zones - Array of zone objects [{ zone_id, centroid_lat, centroid_lon }]
 * @returns {Object} { zone_id, distance_km, centroid_lat, centroid_lon }
 */
export function resolveNearestZone(latitude, longitude, zones = ZONE_DATASETS) {
  // Input validation
  if (
    typeof latitude !== 'number' ||
    typeof longitude !== 'number' ||
    Number.isNaN(latitude) ||
    Number.isNaN(longitude)
  ) {
    throw new TypeError('Invalid geographic coordinates: latitude and longitude must be numbers.');
  }

  if (latitude < -90.0 || latitude > 90.0 || longitude < -180.0 || longitude > 180.0) {
    throw new RangeError(
      `Geographic coordinates out of bounds: lat=${latitude}, lon=${longitude}. Must be within [-90, 90] and [-180, 180].`
    );
  }

  if (!Array.isArray(zones) || zones.length === 0) {
    throw new Error('Zone dataset is empty or invalid.');
  }

  let nearestZone = null;
  let minDistanceKm = Infinity;

  for (let i = 0; i < zones.length; i++) {
    const z = zones[i];
    const dist = haversineDistanceKm(latitude, longitude, z.centroid_lat, z.centroid_lon);
    if (dist < minDistanceKm) {
      minDistanceKm = dist;
      nearestZone = z;
    }
  }

  return {
    zone_id: nearestZone.zone_id,
    distance_km: Math.round(minDistanceKm * 1000.0) / 1000.0,
    centroid_lat: nearestZone.centroid_lat,
    centroid_lon: nearestZone.centroid_lon,
  };
}
