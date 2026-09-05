// Coordinate projection, vector math, and spatial geometric primitives
// for development placement in CesiumJS Digital Twin.

export const METERS_PER_DEG_LAT = 111320;

export function metersPerDegLon(latDeg) {
  const rad = (latDeg * Math.PI) / 180;
  return METERS_PER_DEG_LAT * Math.cos(rad);
}

export function geoToLocal(lat, lon, anchorLat, anchorLon) {
  const dy = (lat - anchorLat) * METERS_PER_DEG_LAT;
  const dx = (lon - anchorLon) * metersPerDegLon(anchorLat);
  return { x: dx, y: dy };
}

export function localToGeo(x, y, anchorLat, anchorLon) {
  const lat = anchorLat + y / METERS_PER_DEG_LAT;
  const lon = anchorLon + x / metersPerDegLon(anchorLat);
  return { lat, lon };
}

export function rotatePoint(pt, angleRad) {
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  return {
    x: pt.x * cos - pt.y * sin,
    y: pt.x * sin + pt.y * cos,
  };
}

export function translateAndRotatePoly(poly, offsetX, offsetY, angleRad = 0) {
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  return poly.map((pt) => ({
    x: offsetX + (pt.x * cos - pt.y * sin),
    y: offsetY + (pt.x * sin + pt.y * cos),
  }));
}

export function polyToGeoCoords(localPoly, anchorLat, anchorLon) {
  return localPoly.map((pt) => {
    const geo = localToGeo(pt.x, pt.y, anchorLat, anchorLon);
    return [geo.lat, geo.lon];
  });
}

export function geoCoordsToLocalPoly(geoCoords, anchorLat, anchorLon) {
  return geoCoords.map(([lat, lon]) => geoToLocal(lat, lon, anchorLat, anchorLon));
}

export function polygonBoundingBox(poly) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (let i = 0; i < poly.length; i++) {
    const pt = poly[i];
    if (pt.x < minX) minX = pt.x;
    if (pt.x > maxX) maxX = pt.x;
    if (pt.y < minY) minY = pt.y;
    if (pt.y > maxY) maxY = pt.y;
  }

  return { minX, maxX, minY, maxY };
}

export function boxesOverlap(b1, b2, padding = 0) {
  return !(
    b1.maxX + padding < b2.minX ||
    b1.minX - padding > b2.maxX ||
    b1.maxY + padding < b2.minY ||
    b1.minY - padding > b2.maxY
  );
}

// Distance from point P to line segment AB (in local meters)
export function pointToSegmentDistance(px, py, ax, ay, bx, by) {
  const abx = bx - ax;
  const aby = by - ay;
  const apx = px - ax;
  const apy = py - ay;

  const ab2 = abx * abx + aby * aby;
  if (ab2 === 0) {
    const dx = px - ax;
    const dy = py - ay;
    return Math.sqrt(dx * dx + dy * dy);
  }

  let t = (apx * abx + apy * aby) / ab2;
  t = Math.max(0, Math.min(1, t));

  const closestX = ax + t * abx;
  const closestY = ay + t * aby;
  const dx = px - closestX;
  const dy = py - closestY;
  return Math.sqrt(dx * dx + dy * dy);
}

// Distance from line segment P1-P2 to line segment Q1-Q2 (in local meters)
export function segmentToSegmentDistance(p1x, p1y, p2x, p2y, q1x, q1y, q2x, q2y) {
  if (segmentsIntersect(p1x, p1y, p2x, p2y, q1x, q1y, q2x, q2y)) {
    return 0;
  }
  const d1 = pointToSegmentDistance(p1x, p1y, q1x, q1y, q2x, q2y);
  const d2 = pointToSegmentDistance(p2x, p2y, q1x, q1y, q2x, q2y);
  const d3 = pointToSegmentDistance(q1x, q1y, p1x, p1y, p2x, p2y);
  const d4 = pointToSegmentDistance(q2x, q2y, p1x, p1y, p2x, p2y);
  return Math.min(d1, d2, d3, d4);
}

// Check if two 2D line segments intersect
export function segmentsIntersect(p1x, p1y, p2x, p2y, q1x, q1y, q2x, q2y) {
  function ccw(ax, ay, bx, by, cx, cy) {
    return (cy - ay) * (bx - ax) > (by - ay) * (cx - ax);
  }
  return (
    ccw(p1x, p1y, q1x, q1y, q2x, q2y) !== ccw(p2x, p2y, q1x, q1y, q2x, q2y) &&
    ccw(p1x, p1y, p2x, p2y, q1x, q1y) !== ccw(p1x, p1y, p2x, p2y, q2x, q2y)
  );
}

// Point in polygon (Ray-casting algorithm)
export function pointInPolygon(px, py, poly) {
  let inside = false;
  const n = poly.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = poly[i].x;
    const yi = poly[i].y;
    const xj = poly[j].x;
    const yj = poly[j].y;

    const intersect =
      yi > py !== yj > py &&
      px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

// Check if polygon intersects another polygon (or one is fully inside the other)
export function polygonsIntersect(polyA, polyB) {
  if (polyA.length < 3 || polyB.length < 3) return false;

  const bA = polygonBoundingBox(polyA);
  const bB = polygonBoundingBox(polyB);
  if (!boxesOverlap(bA, bB)) return false;

  // 1. Check if any edge of A intersects any edge of B
  const nA = polyA.length;
  const nB = polyB.length;
  for (let i = 0; i < nA; i++) {
    const a1 = polyA[i];
    const a2 = polyA[(i + 1) % nA];
    for (let j = 0; j < nB; j++) {
      const b1 = polyB[j];
      const b2 = polyB[(j + 1) % nB];
      if (segmentsIntersect(a1.x, a1.y, a2.x, a2.y, b1.x, b1.y, b2.x, b2.y)) {
        return true;
      }
    }
  }

  // 2. Check if polyA is inside polyB
  if (pointInPolygon(polyA[0].x, polyA[0].y, polyB)) return true;

  // 3. Check if polyB is inside polyA
  if (pointInPolygon(polyB[0].x, polyB[0].y, polyA)) return true;

  return false;
}

// Minimum distance from a polygon to a line segment
export function polygonToSegmentDistance(poly, ax, ay, bx, by) {
  const n = poly.length;
  let minDist = Infinity;

  // Check distance from all polygon vertices to segment
  for (let i = 0; i < n; i++) {
    const d = pointToSegmentDistance(poly[i].x, poly[i].y, ax, ay, bx, by);
    if (d < minDist) minDist = d;
  }

  // Check distance from all segment endpoints to polygon edges
  for (let i = 0; i < n; i++) {
    const p1 = poly[i];
    const p2 = poly[(i + 1) % n];
    const d1 = pointToSegmentDistance(ax, ay, p1.x, p1.y, p2.x, p2.y);
    const d2 = pointToSegmentDistance(bx, by, p1.x, p1.y, p2.x, p2.y);
    if (d1 < minDist) minDist = d1;
    if (d2 < minDist) minDist = d2;

    if (segmentsIntersect(p1.x, p1.y, p2.x, p2.y, ax, ay, bx, by)) {
      return 0;
    }
  }

  if (pointInPolygon(ax, ay, poly) || pointInPolygon(bx, by, poly)) {
    return 0;
  }

  return minDist;
}

// Find dominant angle of the nearest road to align development grid
export function findDominantRoadAngle(roads, anchorLat, anchorLon, searchRadiusMeters = 150) {
  let closestDist = Infinity;
  let dominantAngle = 0;

  for (let r = 0; r < roads.length; r++) {
    const road = roads[r];
    const coords = road.coordinates;
    if (!coords || coords.length < 2) continue;

    for (let i = 0; i < coords.length - 1; i++) {
      const p1 = geoToLocal(coords[i][0], coords[i][1], anchorLat, anchorLon);
      const p2 = geoToLocal(coords[i + 1][0], coords[i + 1][1], anchorLat, anchorLon);

      const d = pointToSegmentDistance(0, 0, p1.x, p1.y, p2.x, p2.y);
      if (d < searchRadiusMeters && d < closestDist) {
        closestDist = d;
        const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
        // Normalize angle to [-PI/4, PI/4] for grid alignment
        let normAngle = angle;
        while (normAngle > Math.PI / 4) normAngle -= Math.PI / 2;
        while (normAngle < -Math.PI / 4) normAngle += Math.PI / 2;
        dominantAngle = normAngle;
      }
    }
  }

  return dominantAngle;
}
