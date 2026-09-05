import assert from "node:assert/strict";
import {
  generateExecutiveExplanation,
  generateWhatThisMeansStatements,
  getNetworkWideChangeLabel,
  getLocalizedImpactLabel,
} from "../utils/reportInterpretation.js";

console.log("▶ Running Report Dynamic Interpretation Test Suite...\n");

// Scenario 1: Current scenario (448 trips, average V/C = 0.44, Max delta = +0.22, 10 critical roads)
{
  const st4 = {
    development_impact: "HIGH",
    network_condition: "GOOD",
    total_development_trips: 448,
    baseline_average_vc: 0.44,
    average_scenario_vc: 0.44,
    max_vc_change: 0.22,
    roads_reaching_vc_1_or_more_count: 10,
    roads_worsened_count: 10,
    number_of_affected_roads: 962,
    unassigned_internal_trips: 0.1,
  };

  const explanation = generateExecutiveExplanation(st4);
  assert.ok(explanation.includes("448 new trips/hour are added to the network"), "Explanation includes trips");
  assert.ok(explanation.includes("Overall network utilization remains low"), "Explanation states low network utilization");
  assert.ok(explanation.includes("10 road segments reach or exceed capacity"), "Explanation states 10 critical roads");

  const statements = generateWhatThisMeansStatements(st4);
  assert.equal(statements.length, 4, "Generates 4 statements");
  assert.ok(statements[0].text.includes("overall road network remains in good condition"));
  assert.ok(statements[1].text.includes("10 individual road segments experience a deterioration"));
  assert.ok(statements[2].text.includes("10 roads are operating at or above capacity"));
  assert.ok(statements[3].text.includes("All generated traffic is successfully assigned"));

  const netLabel = getNetworkWideChangeLabel(st4);
  const locLabel = getLocalizedImpactLabel(st4);
  assert.equal(netLabel, "LOW CHANGE");
  assert.equal(locLabel, "SIGNIFICANT IMPACT");

  console.log("✔ Test 1 Passed: Scenario 1 (High Impact, Good Network, 10 Critical Roads) correctly interpreted");
}

// Scenario 2: Low Impact / Moderate Network Condition / 0 Critical Roads
{
  const st4 = {
    development_impact: "LOW",
    network_condition: "MODERATE",
    total_development_trips: 35,
    baseline_average_vc: 0.72,
    average_scenario_vc: 0.73,
    max_vc_change: 0.04,
    roads_reaching_vc_1_or_more_count: 0,
    roads_worsened_count: 0,
    number_of_affected_roads: 962,
    unassigned_internal_trips: 0,
  };

  const explanation = generateExecutiveExplanation(st4);
  assert.ok(explanation.includes("35 new trips/hour are added to the network"));
  assert.ok(explanation.includes("Overall network utilization is moderate"));
  assert.ok(explanation.includes("all evaluated road segments operate smoothly within capacity"));

  const statements = generateWhatThisMeansStatements(st4);
  assert.ok(statements[0].text.includes("moderate general loading"));
  assert.ok(statements[1].text.includes("No individual roads experience severe service deterioration"));
  assert.ok(statements[2].text.includes("All evaluated corridors operate within designated capacity thresholds"));

  const netLabel = getNetworkWideChangeLabel(st4);
  const locLabel = getLocalizedImpactLabel(st4);
  assert.equal(netLabel, "LOW CHANGE");
  assert.equal(locLabel, "MINIMAL IMPACT");

  console.log("✔ Test 2 Passed: Scenario 2 (Low Impact, Moderate Network, 0 Critical Roads) correctly interpreted");
}

// Scenario 3: Critical Network Condition / 25 Critical Roads
{
  const st4 = {
    development_impact: "HIGH",
    network_condition: "CRITICAL",
    total_development_trips: 850,
    baseline_average_vc: 0.92,
    average_scenario_vc: 1.05,
    avg_vc_change: 0.13,
    max_vc_change: 0.35,
    roads_reaching_vc_1_or_more_count: 25,
    roads_worsened_count: 30,
    number_of_affected_roads: 962,
    unassigned_internal_trips: 0.2,
  };

  const explanation = generateExecutiveExplanation(st4);
  assert.ok(explanation.includes("850 new trips/hour are added to the network"));
  assert.ok(explanation.includes("Overall network utilization operates near or above network capacity"));
  assert.ok(explanation.includes("25 road segments reach or exceed capacity"));

  const statements = generateWhatThisMeansStatements(st4);
  assert.ok(statements[0].text.includes("heavy system-wide utilization"));
  assert.ok(statements[1].text.includes("30 individual road segments experience a deterioration"));
  assert.ok(statements[2].text.includes("25 roads are operating at or above capacity"));

  const netLabel = getNetworkWideChangeLabel(st4);
  const locLabel = getLocalizedImpactLabel(st4);
  assert.equal(netLabel, "MODERATE CHANGE");
  assert.equal(locLabel, "SIGNIFICANT IMPACT");

  console.log("✔ Test 3 Passed: Scenario 3 (Critical Network Condition, 25 Critical Roads) correctly interpreted");
}

// Scenario 4: Edge case - Empty or null metrics
{
  const explanation = generateExecutiveExplanation({});
  assert.ok(explanation.length > 0);

  const statements = generateWhatThisMeansStatements(null);
  assert.ok(statements.length > 0);

  console.log("✔ Test 4 Passed: Empty/null metrics handled safely without errors");
}

console.log("\n All Report Dynamic Interpretation tests passed successfully (4/4)!");
