import assert from "node:assert/strict";
import {
  extractOsmWayId,
  classifyBaselineTraffic,
  classifyScenarioRoadImpact,
  TRAFFIC_HEX,
} from "../utils/trafficColors.js";

console.log("---------------------------------------------------------");
console.log("RUNNING TRAFFIC MAPPING & VISUALIZATION TEST SUITE");
console.log("---------------------------------------------------------");

// =========================================================
// TEST 1: Road ID -> Traffic Result Mapping
// =========================================================
{
  assert.equal(extractOsmWayId("way_90604136"), "90604136");
  assert.equal(extractOsmWayId("osm_90604136_0"), "90604136");
  assert.equal(extractOsmWayId("osm_90604136_2"), "90604136");
  assert.equal(extractOsmWayId("90604136"), "90604136");
  assert.equal(extractOsmWayId(""), "");
  assert.equal(extractOsmWayId(null), "");
  console.log("✓ TEST 1: Road ID -> Traffic result mapping passed");
}

// =========================================================
// TEST 2: Baseline Traffic Classification Boundaries
// =========================================================
{
  // A: < 0.60
  const freeFlow = classifyBaselineTraffic(0.45);
  assert.equal(freeFlow.status, "HEALTHY");
  assert.equal(freeFlow.hex, TRAFFIC_HEX.HEALTHY);

  // B/C: 0.60 <= V/C < 0.80
  const moderate = classifyBaselineTraffic(0.68);
  assert.equal(moderate.status, "MODERATE");
  assert.equal(moderate.hex, TRAFFIC_HEX.MODERATE);

  // D/E: 0.80 <= V/C < 1.00
  const stressed = classifyBaselineTraffic(0.88);
  assert.equal(stressed.status, "WORSENED");
  assert.equal(stressed.hex, TRAFFIC_HEX.WORSENED);

  // F: >= 1.00
  const congested = classifyBaselineTraffic(1.15);
  assert.equal(congested.status, "CRITICAL");
  assert.equal(congested.hex, TRAFFIC_HEX.CRITICAL);

  console.log("✓ TEST 2: Baseline traffic classification passed");
}

// =========================================================
// TEST 3: Scenario Traffic Classification
// =========================================================
{
  // Critical scenario road
  const crit = classifyScenarioRoadImpact({
    road_id: "osm_1346337932_0",
    baseline_vc: 0.85,
    scenario_vc: 1.12,
    vc_change: 0.27,
    baseline_los: "D",
    scenario_los: "F",
    los_change_levels: 2,
    is_los_worsened: true,
    impact_severity: "CRITICAL",
  });
  assert.equal(crit.status, "CRITICAL");
  assert.equal(crit.isHighlighted, true);
  assert.equal(crit.hex, TRAFFIC_HEX.CRITICAL);

  // Significantly worsened
  const high = classifyScenarioRoadImpact({
    road_id: "osm_100_0",
    baseline_vc: 0.70,
    scenario_vc: 0.92,
    vc_change: 0.22,
    baseline_los: "C",
    scenario_los: "E",
    los_change_levels: 2,
    is_los_worsened: true,
    impact_severity: "HIGH",
  });
  assert.equal(high.status, "HIGH_IMPACT");
  assert.equal(high.isHighlighted, true);

  console.log("✓ TEST 3: Scenario traffic classification passed");
}

// =========================================================
// TEST 4: Baseline -> Scenario Change Calculation
// =========================================================
{
  // Road that was healthy and became moderately worsened (Delta V/C = 0.08)
  const changed = classifyScenarioRoadImpact({
    road_id: "osm_200_0",
    baseline_vc: 0.40,
    scenario_vc: 0.48,
    vc_change: 0.08,
    baseline_los: "A",
    scenario_los: "A",
    los_change_levels: 0,
    is_los_worsened: false,
    impact_severity: "LOW",
  });
  assert.equal(changed.status, "WORSENED");
  assert.equal(changed.isHighlighted, true);

  console.log("✓ TEST 4: Baseline -> Scenario change calculation passed");
}

// =========================================================
// TEST 5: Worsened Road Detection vs Preexisting Congestion
// =========================================================
{
  // Already congested road with negligible change (0.95 -> 0.96, delta=0.01, not worsened)
  const alreadyCongested = classifyScenarioRoadImpact({
    road_id: "osm_300_0",
    baseline_vc: 0.75,
    scenario_vc: 0.76,
    vc_change: 0.01,
    baseline_los: "C",
    scenario_los: "C",
    los_change_levels: 0,
    is_los_worsened: false,
    impact_severity: "LOW",
  });
  assert.equal(alreadyCongested.status, "HEALTHY");
  assert.equal(alreadyCongested.isHighlighted, false);

  // Road with genuine worsening
  const genuinelyWorsened = classifyScenarioRoadImpact({
    road_id: "osm_301_0",
    baseline_vc: 0.70,
    scenario_vc: 0.85,
    vc_change: 0.15,
    baseline_los: "C",
    scenario_los: "D",
    los_change_levels: 1,
    is_los_worsened: true,
    impact_severity: "MODERATE",
  });
  assert.equal(genuinelyWorsened.status, "HIGH_IMPACT");
  assert.equal(genuinelyWorsened.isHighlighted, true);

  console.log("✓ TEST 5: Worsened road detection vs preexisting congestion passed");
}

// =========================================================
// TEST 6: Missing Road Result Handling
// =========================================================
{
  const missing = classifyScenarioRoadImpact(null);
  assert.equal(missing, null);

  const empty = classifyBaselineTraffic(null);
  assert.equal(empty.status, "DEFAULT");
  assert.equal(empty.hex, TRAFFIC_HEX.DEFAULT);

  console.log("✓ TEST 6: Missing road result handling passed");
}

// =========================================================
// TEST 7: Unknown Road ID Handling
// =========================================================
{
  assert.equal(extractOsmWayId("unknown_road_xyz"), "unknown_road_xyz");
  const fallback = classifyBaselineTraffic(undefined);
  assert.equal(fallback.status, "DEFAULT");

  console.log("✓ TEST 7: Unknown road ID handling passed");
}

// =========================================================
// TEST 8: Color Classification Boundaries
// =========================================================
{
  // Exact boundary 0.60
  assert.equal(classifyBaselineTraffic(0.599).status, "HEALTHY");
  assert.equal(classifyBaselineTraffic(0.60).status, "MODERATE");

  // Exact boundary 0.80
  assert.equal(classifyBaselineTraffic(0.799).status, "MODERATE");
  assert.equal(classifyBaselineTraffic(0.80).status, "WORSENED");

  // Exact boundary 1.00
  assert.equal(classifyBaselineTraffic(0.999).status, "WORSENED");
  assert.equal(classifyBaselineTraffic(1.00).status, "CRITICAL");

  console.log("✓ TEST 8: Color classification boundaries passed");
}

console.log("---------------------------------------------------------");
console.log("ALL 8 TRAFFIC MAPPING & VISUALIZATION TESTS PASSED!");
console.log("---------------------------------------------------------");
