import assert from "node:assert/strict";
import {
  createReportRecord,
  getReportsForDevelopment,
  getLatestReportForDevelopment,
  addReportToCollection,
  removeReportsForDevelopment,
  isReportCurrentForDevelopment,
  getReportStatus,
} from "../services/reportService.js";

// Mock localStorage for test runtime
const storageMap = new Map();
globalThis.window = {
  localStorage: {
    getItem(key) {
      return storageMap.get(key) || null;
    },
    setItem(key, value) {
      storageMap.set(key, String(value));
    },
    removeItem(key) {
      storageMap.delete(key);
    },
    clear() {
      storageMap.clear();
    },
  },
};

console.log("▶ Running Building What-If Reports & Edit Workflow Test Suite...\n");

// Test 1: Completed report associated with correct development ID
{
  const mockDev = {
    development_id: "dev-hospital-001",
    name: "General Hospital Extension",
    development_type: "healthcare",
    zone_id: "Z0096",
    floors: 5,
    properties: { number_of_beds: 300, gross_leasable_area_sqm: 9000 },
  };
  const mockResult = {
    simulation_id: "sim-101",
    development_id: "dev-hospital-001",
    simulation_hour: 8,
    stage4_impact_assessment: {
      overall_impact_level: "MODERATE",
      network_condition: "CRITICAL",
      total_development_trips: 45.5,
      baseline_average_vc: 0.44,
      average_scenario_vc: 0.44,
      roads_worsened_count: 4,
    },
  };

  const report = createReportRecord({
    development: mockDev,
    simulationResult: mockResult,
  });

  assert.equal(report.developmentId, "dev-hospital-001", "Report must associate with development ID");
  assert.equal(report.scenarioName, "General Hospital Extension");
  assert.equal(report.developmentType, "healthcare");
  assert.ok(report.developmentSnapshot, "Report must contain developmentSnapshot");
  assert.equal(report.developmentSnapshot.floors, 5);
  assert.equal(report.developmentSnapshot.properties.number_of_beds, 300);
  assert.equal(report.result.stage4_impact_assessment.overall_impact_level, "MODERATE");
  console.log("✔ Test 1 Passed: Completed report correctly associated with development ID & snapshot");
}

// Test 2 & 6: Multiple reports belong to the same development and do not overwrite
{
  let reports = [];
  const devId = "dev-hospital-001";

  const rep1 = createReportRecord({
    development: { id: devId, name: "Hospital Expansion 300 beds", type: "healthcare", floors: 3 },
    simulationResult: { simulation_id: "s1", hour: 8, stage4_impact_assessment: { total_development_trips: 30 } },
  });
  rep1.createdAt = new Date("2026-09-03T10:00:00Z").toISOString();
  reports = addReportToCollection(reports, rep1);

  const rep2 = createReportRecord({
    development: { id: devId, name: "Hospital Expansion 500 beds", type: "healthcare", floors: 5 },
    simulationResult: { simulation_id: "s2", hour: 8, stage4_impact_assessment: { total_development_trips: 50 } },
  });
  rep2.createdAt = new Date("2026-09-04T12:00:00Z").toISOString();
  reports = addReportToCollection(reports, rep2);

  const rep3 = createReportRecord({
    development: { id: devId, name: "Hospital Final Masterplan", type: "healthcare", floors: 7 },
    simulationResult: { simulation_id: "s3", hour: 8, stage4_impact_assessment: { total_development_trips: 75 } },
  });
  rep3.createdAt = new Date("2026-09-05T15:00:00Z").toISOString();
  reports = addReportToCollection(reports, rep3);

  const devReports = getReportsForDevelopment(reports, devId);
  assert.equal(devReports.length, 3, "Building must retain all 3 completed simulations without overwriting");
  assert.equal(devReports[0].scenarioName, "Hospital Final Masterplan", "Most recent report should be first");
  assert.equal(devReports[1].scenarioName, "Hospital Expansion 500 beds");
  assert.equal(devReports[2].scenarioName, "Hospital Expansion 300 beds");
  console.log("✔ Test 2 & 6 Passed: Multiple simulations retained per building without overwriting");
}

// Test 3: Newest report correctly identified
{
  const devId = "dev-commercial-002";
  let reports = [];

  const olderReport = createReportRecord({
    development: { development_id: devId, name: "Phase 1 Mall" },
    simulationResult: { simulation_id: "sim-old" },
  });
  olderReport.createdAt = new Date("2026-08-01T08:00:00Z").toISOString();
  reports = addReportToCollection(reports, olderReport);

  const newerReport = createReportRecord({
    development: { development_id: devId, name: "Phase 2 Mall Extension" },
    simulationResult: { simulation_id: "sim-new" },
  });
  newerReport.createdAt = new Date("2026-09-05T09:30:00Z").toISOString();
  reports = addReportToCollection(reports, newerReport);

  const latest = getLatestReportForDevelopment(reports, devId);
  assert.ok(latest, "Latest report must exist");
  assert.equal(latest.scenarioName, "Phase 2 Mall Extension", "Newest report must be identified");
  console.log("✔ Test 3 Passed: Newest report correctly identified by getLatestReportForDevelopment");
}

// Test 4: Historical report preserves full data structure for FullReportView
{
  const historicalReport = createReportRecord({
    development: { development_id: "dev-res-003", name: "Skyline Tower", development_type: "residential_highrise" },
    simulationResult: {
      simulation_id: "sim-skyline-99",
      stage4_impact_assessment: {
        overall_impact_level: "HIGH",
        network_condition: "CRITICAL",
        total_development_trips: 120.4,
        baseline_average_vc: 0.43,
        average_scenario_vc: 0.52,
        max_vc_change: 0.28,
        number_of_affected_roads: 954,
        roads_worsened_count: 12,
        roads_reaching_los_E_or_F_count: 3,
        roads_reaching_vc_1_or_more_count: 1,
        top_bottlenecks: [{ road_id: "osm_123", scenario_vc: 1.05 }],
      },
      stage5_electricity: { electricity_kwh: 4500 },
      stage6_water: { water_demand_m3_hour: 35.2 },
      stage7_waste: { waste_generation_kg_day: 420 },
      stage8_environment: { total_co2_kg: 2160 },
    },
  });

  const res = historicalReport.result;
  assert.equal(res.stage4_impact_assessment.overall_impact_level, "HIGH");
  assert.equal(res.stage4_impact_assessment.roads_worsened_count, 12);
  assert.equal(res.stage5_electricity.electricity_kwh, 4500);
  assert.equal(res.stage6_water.water_demand_m3_hour, 35.2);
  assert.equal(res.stage7_waste.waste_generation_kg_day, 420);
  assert.equal(res.stage8_environment.total_co2_kg, 2160);
  console.log("✔ Test 4 Passed: Historical report preserves all multi-domain outputs for FullReportView");
}

// Test 5: Empty state when building has no reports
{
  const reports = [];
  const devId = "dev-empty-building";

  const devReports = getReportsForDevelopment(reports, devId);
  const latest = getLatestReportForDevelopment(reports, devId);

  assert.equal(devReports.length, 0, "Empty reports list returned for fresh development");
  assert.equal(latest, null, "Latest report is null for building with no simulations");
  console.log("✔ Test 5 Passed: Empty state handled gracefully");
}

// Test 6: Report snapshot preservation & OUTDATED detection after Edit Development
{
  const devId = "dev-hospital-edit-test";
  const initialDev = {
    development_id: devId,
    name: "St. Jude Hospital",
    development_type: "healthcare",
    floors: 5,
    latitude: 30.02374,
    longitude: 31.75489,
    properties: { number_of_beds: 300, gross_leasable_area_sqm: 9000 },
  };

  const simResult1 = {
    simulation_id: "sim-v1",
    development_id: devId,
    stage4_impact_assessment: { overall_impact_level: "MODERATE", total_development_trips: 45 },
  };

  const reportV1 = createReportRecord({
    development: initialDev,
    simulationResult: simResult1,
    scenarioName: "Hospital 300 Beds",
  });

  // Check that reportV1 is CURRENT against initialDev
  assert.equal(isReportCurrentForDevelopment(reportV1, initialDev), true);
  assert.equal(getReportStatus(reportV1, initialDev), "current");

  // Now user edits the development: increases floors to 8 and beds to 500
  const editedDev = {
    ...initialDev,
    floors: 8,
    properties: { number_of_beds: 500, gross_leasable_area_sqm: 15000 },
  };

  // Check that reportV1 is now marked OUTDATED against editedDev
  assert.equal(isReportCurrentForDevelopment(reportV1, editedDev), false, "Old report must be marked outdated");
  assert.equal(getReportStatus(reportV1, editedDev), "outdated");

  // Old report snapshot must NOT have mutated
  assert.equal(reportV1.developmentSnapshot.floors, 5, "Snapshot floors must remain 5");
  assert.equal(reportV1.developmentSnapshot.properties.number_of_beds, 300, "Snapshot beds must remain 300");

  // Now user runs a new What-If simulation with editedDev
  const simResult2 = {
    simulation_id: "sim-v2",
    development_id: devId,
    stage4_impact_assessment: { overall_impact_level: "HIGH", total_development_trips: 80 },
  };

  const reportV2 = createReportRecord({
    development: editedDev,
    simulationResult: simResult2,
    scenarioName: "Hospital 500 Beds Expansion",
  });

  let reportHistory = [reportV1];
  reportHistory = addReportToCollection(reportHistory, reportV2);

  // reportV2 is CURRENT, reportV1 is OUTDATED
  assert.equal(isReportCurrentForDevelopment(reportV2, editedDev), true, "New report is CURRENT");
  assert.equal(isReportCurrentForDevelopment(reportV1, editedDev), false, "Old report remains OUTDATED");
  assert.equal(reportHistory.length, 2, "Both reports remain accessible in history");

  console.log("✔ Test 6 Passed: Snapshot preservation, OUTDATED comparison, and re-simulation verified");
}

// Test 7: Deleting development cleans up report records
{
  let reports = [];
  const targetDevId = "dev-to-delete-007";
  const otherDevId = "dev-keep-008";

  reports = addReportToCollection(
    reports,
    createReportRecord({
      development: { id: targetDevId, name: "Target Dev" },
      simulationResult: { simulation_id: "sim-t1" },
    })
  );
  reports = addReportToCollection(
    reports,
    createReportRecord({
      development: { id: otherDevId, name: "Other Dev" },
      simulationResult: { simulation_id: "sim-o1" },
    })
  );

  assert.equal(reports.length, 2, "2 reports initially");

  reports = removeReportsForDevelopment(reports, targetDevId);

  assert.equal(reports.length, 1, "Only 1 report remaining after deletion");
  assert.equal(getReportsForDevelopment(reports, targetDevId).length, 0, "No orphaned reports for deleted dev");
  assert.equal(getReportsForDevelopment(reports, otherDevId).length, 1, "Other development reports untouched");
  console.log("✔ Test 7 Passed: Deleting a development cleans up all its associated reports");
}

console.log("\n All Building What-If Reports & Edit Workflow tests passed successfully (7/7)!");
