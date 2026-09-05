import spatialFeatures from "../data/spatialFeatures.json" with { type: "json" };

export const SPATIAL_FEATURES = spatialFeatures;

// Extract feature bounds directly from the authoritative OSM spatial dataset
const rawBounds = spatialFeatures?.bounds || {};
const west = Number(rawBounds.west ?? 31.6780751);
const south = Number(rawBounds.south ?? 29.9654729);
const east = Number(rawBounds.east ?? 31.8465647);
const north = Number(rawBounds.north ?? 30.1020752);

export const OSM_BOUNDS = {
  west,
  south,
  east,
  north,
  min_lon: west,
  min_lat: south,
  max_lon: east,
  max_lat: north,
};

// Project geographic bounds derived directly from OSM geometry
export const CITY_BOUNDS = OSM_BOUNDS;

export const PROJECT_CENTER = {
  latitude: (south + north) / 2,
  longitude: (west + east) / 2,
};

/**
 * Normalizes bounds from either {west, south, east, north} or {min_lon, min_lat, max_lon, max_lat}
 * formats to guarantee consistent camera and geometry coordinate access.
 */
export function getProjectBounds(info) {
  const b = info?.bounds || CITY_BOUNDS;
  const w = Number(b.west ?? b.min_lon ?? west);
  const s = Number(b.south ?? b.min_lat ?? south);
  const e = Number(b.east ?? b.max_lon ?? east);
  const n = Number(b.north ?? b.max_lat ?? north);
  return {
    west: w,
    south: s,
    east: e,
    north: n,
    min_lon: w,
    min_lat: s,
    max_lon: e,
    max_lat: n,
  };
}
