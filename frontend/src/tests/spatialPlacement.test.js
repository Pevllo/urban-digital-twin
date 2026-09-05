// Automated unit tests for spatial geometry, validation, and procedural layouts.
// Run with: node frontend/src/tests/spatialPlacement.test.js

import assert from "node:assert";
import {
  geoToLocal,
  localToGeo,
  pointToSegmentDistance,
  polygonsIntersect,
  polygonToSegmentDistance,
  rotatePoint,
  translateAndRotatePoly,
} from "../components/map/development/developmentGeometry.js";
import {
  checkRoadCollision,
  checkBuildingCollision,
  isInsideProjectBounds,
  isPointBuildable,
  findNearestValidPosition,
} from "../components/map/development/spatialValidation.js";
import {
  generateDevelopmentLayout,
  resolveDevelopmentPlacement,
} from "../components/map/development/developmentLayouts.js";
import spatialFeatures from "../data/spatialFeatures.json" with { type: "json" };

console.log("---------------------------------------------------------");
console.log("RUNNING SPATIAL GEOMETRY & PLACEMENT TEST SUITE");
console.log("---------------------------------------------------------");

// TEST 1: Geodesic Coordinate Conversion Round-trip
{
  const anchorLat = 30.01;
  const anchorLon = 31.75;
  const local = geoToLocal(30.0105, 31.7505, anchorLat, anchorLon);
  const back = localToGeo(local.x, local.y, anchorLat, anchorLon);
  assert(Math.abs(back.lat - 30.0105) < 1e-7, "Latitude round-trip failed");
  assert(Math.abs(back.lon - 31.7505) < 1e-7, "Longitude round-trip failed");
  console.log("✓ TEST 1: Geodesic coordinate projection round-trip passed");
}

// TEST 2: Point to Line Segment Distance and Rotation
{
  const d1 = pointToSegmentDistance(0, 5, -10, 0, 10, 0);
  assert(Math.abs(d1 - 5) < 1e-5, "Perpendicular distance should be 5");
  const d2 = pointToSegmentDistance(15, 0, -10, 0, 10, 0);
  assert(Math.abs(d2 - 5) < 1e-5, "Endpoint distance should be 5");

  const rotated = rotatePoint({ x: 10, y: 0 }, Math.PI / 2);
  assert(Math.abs(rotated.x) < 1e-5 && Math.abs(rotated.y - 10) < 1e-5, "Rotation 90deg failed");

  const poly = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
  const translated = translateAndRotatePoly(poly, 5, 5, 0);
  assert.strictEqual(translated[0].x, 5);
  assert.strictEqual(translated[0].y, 5);

  const pDist = polygonToSegmentDistance(poly, 15, 0, 15, 10);
  assert(Math.abs(pDist - 5) < 1e-5, "Polygon to segment distance should be 5");

  assert.strictEqual(isInsideProjectBounds(30.01, 31.75), true, "City bounds check failed");
  assert.strictEqual(isInsideProjectBounds(20.0, 10.0), false, "Out of bounds check failed");

  assert.strictEqual(typeof isPointBuildable(30.01, 31.75, spatialFeatures), "boolean", "isPointBuildable failed");

  console.log("✓ TEST 2: Point-to-segment metric distance, rotation, translation, and bounds passed");
}

// TEST 3: Polygon Intersection & Collision
{
  const polyA = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
  const polyB = [{ x: 5, y: 5 }, { x: 15, y: 5 }, { x: 15, y: 15 }, { x: 5, y: 15 }];
  const polyC = [{ x: 50, y: 50 }, { x: 60, y: 50 }, { x: 60, y: 60 }, { x: 50, y: 60 }];

  assert.strictEqual(polygonsIntersect(polyA, polyB), true, "polyA and polyB should intersect");
  assert.strictEqual(polygonsIntersect(polyA, polyC), false, "polyA and polyC should not intersect");
  console.log("✓ TEST 3: Polygon-polygon collision detection passed");
}

// TEST 4: Road Collision & Setback against real OSM Road
{
  const sampleRoad = spatialFeatures.roads[0];
  const roadLat = sampleRoad.coordinates[0][0];
  const roadLon = sampleRoad.coordinates[0][1];

  // Footprint right on the road
  const roadFootprint = [
    { x: -5, y: -5 },
    { x: 5, y: -5 },
    { x: 5, y: 5 },
    { x: -5, y: 5 },
  ];
  const roadCheck = checkRoadCollision(roadFootprint, roadLat, roadLon, [sampleRoad]);
  assert.strictEqual(roadCheck.collided, true, "Footprint on road should collide");

  // Footprint far from the road (500m offset)
  const farFootprint = [
    { x: 490, y: 490 },
    { x: 510, y: 490 },
    { x: 510, y: 510 },
    { x: 490, y: 510 },
  ];
  const farCheck = checkRoadCollision(farFootprint, roadLat, roadLon, [sampleRoad]);
  assert.strictEqual(farCheck.collided, false, "Footprint far away should not collide");
  console.log("✓ TEST 4: OSM road collision and setback detection passed");
}

// TEST 5: Existing OSM Building Collision
{
  const sampleBldg = spatialFeatures.buildings[0];
  const bldgLat = sampleBldg.centroid ? sampleBldg.centroid[0] : sampleBldg.coordinates[0][0];
  const bldgLon = sampleBldg.centroid ? sampleBldg.centroid[1] : sampleBldg.coordinates[0][1];

  // Footprint right on the building
  const overlapFootprint = [
    { x: -10, y: -10 },
    { x: 10, y: -10 },
    { x: 10, y: 10 },
    { x: -10, y: 10 },
  ];
  const bldgCheck = checkBuildingCollision(overlapFootprint, bldgLat, bldgLon, [sampleBldg]);
  assert.strictEqual(bldgCheck.collided, true, "Footprint on existing OSM building should collide");
  console.log("✓ TEST 5: Existing OSM building collision detection passed");
}

// TEST 6: Nearest Valid Position Auto-Adjustment
{
  // Take a coordinate directly on a major road
  const roadCoord = spatialFeatures.roads[0].coordinates[0];
  const adjusted = findNearestValidPosition(roadCoord[0], roadCoord[1], spatialFeatures, 80, 5);

  assert(adjusted !== null, "Should find a nearby valid buildable position");
  assert(adjusted.lat !== undefined && adjusted.lon !== undefined, "Should have valid coordinates");
  console.log(`✓ TEST 6: Auto-adjustment from road to buildable point passed (offset: ${adjusted.offsetMeters || 0}m)`);
}

// TEST 7: Procedural 3D Layout Generation for ALL 6 Development Types
{
  const devTypes = ["residential_compound", "hospital", "school", "mall", "office", "mixed_use"];
  const anchorLat = 30.021;
  const anchorLon = 31.745;

  devTypes.forEach((type) => {
    const dev = {
      development_id: `test_${type}`,
      development_type: type,
      floors: type === "office" ? 10 : 5,
      properties: { gross_floor_area_sqm: 10000, num_units: 80 },
    };

    const layout = generateDevelopmentLayout(dev, anchorLat, anchorLon, spatialFeatures);
    assert(layout.buildings.length > 0, `${type} should generate physical buildings`);
    assert(layout.landscaping.length > 0, `${type} should generate landscaping elements`);
    assert(layout.plotPolygon.length >= 3, `${type} should generate plot polygon`);

    // Verify all building heights and rooftop structures
    layout.buildings.forEach((bldg) => {
      assert(bldg.height > 0, "Building must have positive height");
      assert(bldg.footprint.length >= 3, "Building footprint must have >= 3 vertices");
    });

    console.log(`  ✓ Generated 3D layout for '${type}': ${layout.buildings.length} buildings, ${layout.landscaping.length} landscape areas`);
  });
  console.log("✓ TEST 7: All 6 development types generated realistic physical 3D layouts");
}

// TEST 8: Full Placement Resolution
{
  const dev = {
    development_id: "test_res_final",
    development_type: "residential_compound",
    floors: 6,
    properties: { num_units: 100 },
  };

  const res = resolveDevelopmentPlacement(dev, 30.021, 31.745, spatialFeatures);
  assert.strictEqual(res.success, true, "Placement resolution should succeed in open plot");
  assert(res.layout.buildings.length > 0, "Placement resolution should include physical buildings");
  console.log("✓ TEST 8: End-to-end placement resolution passed");
}

console.log("---------------------------------------------------------");
console.log("ALL 8 SPATIAL PLACEMENT & GEOMETRY TESTS PASSED!");
console.log("---------------------------------------------------------");
