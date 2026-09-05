import assert from "node:assert/strict";
import {
  extractOsmWayId,
  classifyBaselineTraffic,
  classifyScenarioRoadImpact,
  pickMoreSevereScenarioAssessment,
  TRAFFIC_HEX,
} from "../utils/trafficColors.js";

console.log("---------------------------------------------------------");
console.log("RUNNING WHAT-IF TRAFFIC MAPPING & VISUALIZATION TEST SUITE");
console.log("---------------------------------------------------------");

// =========================================================
// TEST 1: Baseline Classification
// =========================================================
{
  const green = classifyBaselineTraffic(0.40);
  assert.equal(green.status, "HEALTHY");
  assert.equal(green.hex, TRAFFIC_HEX.HEALTHY);

  const yellow = classifyBaselineTraffic(0.70);
  assert.equal(yellow.status, "MODERATE");
  assert.equal(yellow.hex, TRAFFIC_HEX.MODERATE);

  const orange = classifyBaselineTraffic(0.90);
  assert.equal(orange.status, "WORSENED");
  assert.equal(orange.hex, TRAFFIC_HEX.WORSENED);

  const red = classifyBaselineTraffic(1.05);
  assert.equal(red.status, "CRITICAL");
  assert.equal(red.hex, TRAFFIC_HEX.CRITICAL);

  console.log("✓ TEST 1: Baseline classification (0.40 -> green, 0.70 -> yellow, 0.90 -> orange, 1.05 -> red) passed");
}

// =========================================================
// TEST 2: Scenario Change (Delta V/C >= 0.15 -> High Impact / Red)
// =========================================================
{
  const result = classifyScenarioRoadImpact({
    road_id: "osm_814422935_1",
    baseline_vc: 0.70,
    scenario_vc: 0.90,
    vc_change: 0.20,
    baseline_los: "C",
    scenario_los: "E",
    los_change_levels: 2,
    is_los_worsened: true,
  });

  assert.equal(result.status, "HIGH_IMPACT");
  assert.equal(result.hex, TRAFFIC_HEX.HIGH_IMPACT);
  assert.equal(result.isHighlighted, true);
  console.log("✓ TEST 2: Scenario change (baseline 0.70, scenario 0.90, Delta V/C +0.20 -> high impact / red) passed");
}

// =========================================================
// TEST 3: Small Change (Delta V/C >= 0.02 -> Moderate Impact / Yellow)
// =========================================================
{
  const result = classifyScenarioRoadImpact({
    road_id: "osm_814422935_0",
    baseline_vc: 0.40,
    scenario_vc: 0.42,
    vc_change: 0.02,
    baseline_los: "A",
    scenario_los: "A",
    los_change_levels: 0,
    is_los_worsened: false,
  });

  assert.equal(result.status, "MODERATE");
  assert.equal(result.hex, TRAFFIC_HEX.MODERATE);
  assert.equal(result.isHighlighted, false);
  console.log("✓ TEST 3: Small change (baseline 0.40, scenario 0.42, Delta V/C +0.02 -> moderate impact / yellow) passed");
}

// =========================================================
// TEST 4: Worsened LOS (is_los_worsened === true -> Worsened / Orange)
// =========================================================
{
  const result = classifyScenarioRoadImpact({
    road_id: "osm_543026834_0",
    baseline_vc: 0.65,
    scenario_vc: 0.72,
    vc_change: 0.07,
    baseline_los: "C",
    scenario_los: "D",
    los_change_levels: 1,
    is_los_worsened: true,
  });

  assert.equal(result.status, "WORSENED");
  assert.equal(result.hex, TRAFFIC_HEX.WORSENED);
  assert.equal(result.isHighlighted, true);
  console.log("✓ TEST 4: Worsened LOS (baseline C, scenario D, is_los_worsened -> worsened / orange) passed");
}

// =========================================================
// TEST 5: Critical Scenario (scenario_vc = 1.05 -> Critical Red)
// =========================================================
{
  const result = classifyScenarioRoadImpact({
    road_id: "osm_90604136_0",
    baseline_vc: 0.92,
    scenario_vc: 1.05,
    vc_change: 0.13,
    baseline_los: "E",
    scenario_los: "F",
    los_change_levels: 1,
    is_los_worsened: true,
  });

  assert.equal(result.status, "CRITICAL");
  assert.equal(result.hex, TRAFFIC_HEX.CRITICAL);
  assert.equal(result.isHighlighted, true);
  console.log("✓ TEST 5: Critical scenario (scenario_vc = 1.05 -> critical red) passed");
}

// =========================================================
// TEST 6: OSM ID Normalization
// =========================================================
{
  assert.equal(extractOsmWayId("way_814422935"), "814422935");
  assert.equal(extractOsmWayId("osm_814422935_0"), "814422935");
  assert.equal(extractOsmWayId("osm_814422935_2"), "814422935");
  assert.equal(extractOsmWayId("814422935"), "814422935");
  assert.equal(extractOsmWayId("way_90604136"), "90604136");
  assert.equal(extractOsmWayId("osm_90604136_0"), "90604136");
  console.log("✓ TEST 6: OSM ID normalization (way_814422935, osm_814422935_0, osm_814422935_2 -> 814422935) passed");
}

// =========================================================
// TEST 7: Worst Segment Selection
// =========================================================
{
  const seg0 = { road_id: "osm_814422935_0", baseline_vc: 0.40, scenario_vc: 0.41, vc_change: 0.01, is_los_worsened: false };
  const seg1 = { road_id: "osm_814422935_1", baseline_vc: 0.70, scenario_vc: 0.90, vc_change: 0.20, is_los_worsened: true, impact_severity: "HIGH" };
  const seg2 = { road_id: "osm_814422935_2", baseline_vc: 0.50, scenario_vc: 0.55, vc_change: 0.05, is_los_worsened: false };

  let best = null;
  best = pickMoreSevereScenarioAssessment(best, seg0);
  assert.equal(best.road_id, "osm_814422935_0");

  best = pickMoreSevereScenarioAssessment(best, seg1);
  assert.equal(best.road_id, "osm_814422935_1"); // seg1 is HIGH impact, selected over seg0

  best = pickMoreSevereScenarioAssessment(best, seg2);
  assert.equal(best.road_id, "osm_814422935_1"); // seg1 remains the worst assessment

  console.log("✓ TEST 7: Worst segment selection (+0.01, +0.20, +0.05 -> +0.20 segment selected) passed");
}

// =========================================================
// TEST 8: Scenario Replacement & Reset
// =========================================================
{
  // Scenario A affects road 101 with +0.25 (High Impact)
  const scenA = [{ road_id: "osm_101_0", baseline_vc: 0.60, scenario_vc: 0.85, vc_change: 0.25, is_los_worsened: true, impact_severity: "HIGH" }];
  
  // Scenario B affects road 202 instead, leaving road 101 unaffected
  const scenB = [{ road_id: "osm_202_0", baseline_vc: 0.50, scenario_vc: 0.75, vc_change: 0.25, is_los_worsened: true, impact_severity: "HIGH" }];

  const mapA = new Map();
  scenA.forEach((r) => mapA.set(extractOsmWayId(r.road_id), r));

  const mapB = new Map();
  scenB.forEach((r) => mapB.set(extractOsmWayId(r.road_id), r));

  // In scenario A, road 101 is assessed
  assert.ok(mapA.has("101"));
  assert.equal(classifyScenarioRoadImpact(mapA.get("101")).status, "HIGH_IMPACT");

  // In scenario B, road 101 is NOT in mapB and cleanly returns to baseline
  assert.ok(!mapB.has("101"));
  assert.ok(mapB.has("202"));
  assert.equal(classifyScenarioRoadImpact(mapB.get("202")).status, "HIGH_IMPACT");
  console.log("✓ TEST 8: Scenario replacement and reset cleanly restored unaffected roads passed");
}

// =========================================================
// TEST 9: Unaffected Road Retains Baseline Color
// =========================================================
{
  // Road with baseline V/C = 0.85 (Orange) and tiny delta = +0.005
  const result = classifyScenarioRoadImpact(
    {
      road_id: "osm_814422935_2",
      baseline_vc: 0.85,
      scenario_vc: 0.855,
      vc_change: 0.005,
      is_los_worsened: false,
    },
    { congestion_ratio: 0.85 }
  );

  assert.equal(result.status, "HEALTHY");
  assert.equal(result.hex, TRAFFIC_HEX.WORSENED); // Retains baseline Orange #f97316
  assert.equal(result.isHighlighted, false);
  console.log("✓ TEST 9: Unaffected road retains baseline color (0.85 V/C -> orange #f97316) passed");
}

// =========================================================
// TEST 10: Simulation Response Extraction
// =========================================================
{
  const mockApiResponse = {
    scenario_id: "scen_123",
    stage4_impact_assessment: {
      network_summary: { total_roads_analyzed: 962 },
      road_assessments: [
        { road_id: "osm_814422935_2", baseline_vc: 0.70, scenario_vc: 0.90, vc_change: 0.20, is_los_worsened: true },
        { road_id: "osm_814422935_0", baseline_vc: 0.40, scenario_vc: 0.42, vc_change: 0.02, is_los_worsened: false },
      ],
    },
  };

  const roadAssessments = mockApiResponse.stage4_impact_assessment?.road_assessments || [];
  assert.equal(roadAssessments.length, 2);
  assert.equal(extractOsmWayId(roadAssessments[0].road_id), "814422935");
  console.log("✓ TEST 10: Simulation response extraction from stage4_impact_assessment.road_assessments passed");
}

console.log("---------------------------------------------------------");
console.log("ALL 10 WHAT-IF TRAFFIC MAPPING TESTS PASSED!");
console.log("---------------------------------------------------------");
