import { formatNumber } from "./format.js";

/**
 * Generates an executive, human-readable summary explanation based on dynamic traffic metrics.
 *
 * @param {Object} st4 - Stage 4 impact assessment metrics
 * @returns {string} Human-readable executive summary sentence
 */
export function generateExecutiveExplanation(st4) {
  if (!st4 || Object.keys(st4).length === 0) {
    return "Simulation completed. Impact metrics are being computed.";
  }

  const trips = formatNumber(st4.total_development_trips ?? 0, 0);
  const scenarioVc = Number(st4.average_scenario_vc ?? st4.baseline_average_vc ?? 0);
  const criticalCount = Number(st4.roads_reaching_vc_1_or_more_count ?? 0);
  const worsenedCount = Number(st4.roads_worsened_count ?? 0);

  let utilText = "remains low";
  if (scenarioVc >= 1.00) {
    utilText = "operates near or above network capacity";
  } else if (scenarioVc >= 0.85) {
    utilText = "is high";
  } else if (scenarioVc >= 0.70) {
    utilText = "is moderate";
  }

  if (criticalCount > 0) {
    const roadPlural = criticalCount === 1 ? "road segment reaches" : "road segments reach";
    return `${trips} new trips/hour are added to the network. Overall network utilization ${utilText}, but ${criticalCount} ${roadPlural} or exceed capacity.`;
  }

  if (worsenedCount > 0) {
    const roadPlural = worsenedCount === 1 ? "road segment experiences" : "road segments experience";
    return `${trips} new trips/hour are added to the network. Overall network utilization ${utilText}, with ${worsenedCount} ${roadPlural} localized service deterioration.`;
  }

  return `${trips} new trips/hour are added to the network. Overall network utilization ${utilText}, and all evaluated road segments operate smoothly within capacity.`;
}

/**
 * Generates dynamic bullet statements for the "What This Means" section.
 *
 * @param {Object} st4 - Stage 4 impact assessment metrics
 * @returns {Array<{type: 'success'|'warning'|'critical'|'neutral', text: string}>}
 */
export function generateWhatThisMeansStatements(st4) {
  if (!st4 || Object.keys(st4).length === 0) {
    return [
      {
        type: "neutral",
        text: "Simulation results are being processed.",
      },
    ];
  }

  const statements = [];
  const netCondition = (st4.network_condition || "GOOD").toUpperCase();
  const scenarioVc = Number(st4.average_scenario_vc ?? 0);
  const criticalCount = Number(st4.roads_reaching_vc_1_or_more_count ?? 0);
  const worsenedCount = Number(st4.roads_worsened_count ?? 0);
  const maxDelta = Number(st4.max_vc_change ?? 0);
  const unassigned = Number(st4.unassigned_internal_trips ?? 0);

  // 1. Overall network condition statement
  if (netCondition === "GOOD" || scenarioVc < 0.70) {
    statements.push({
      type: "success",
      text: "The overall road network remains in good condition.",
    });
  } else if (netCondition === "MODERATE" || scenarioVc < 0.85) {
    statements.push({
      type: "warning",
      text: "The overall road network experiences moderate general loading.",
    });
  } else {
    statements.push({
      type: "critical",
      text: "The overall road network experiences heavy system-wide utilization.",
    });
  }

  // 2. Individual / localized roads impact statement
  if (maxDelta >= 0.15 || worsenedCount > 0) {
    statements.push({
      type: "warning",
      text: worsenedCount > 0
        ? `${worsenedCount} individual road ${worsenedCount === 1 ? "segment experiences" : "segments experience"} a deterioration in Level of Service.`
        : "Some individual roads are significantly affected by concentrated development traffic.",
    });
  } else {
    statements.push({
      type: "success",
      text: "No individual roads experience severe service deterioration.",
    });
  }

  // 3. Capacity threshold statement
  if (criticalCount > 0) {
    statements.push({
      type: "critical",
      text: `${criticalCount} road${criticalCount === 1 ? " is" : "s are"} operating at or above capacity (V/C ≥ 1.0).`,
    });
  } else {
    statements.push({
      type: "success",
      text: "All evaluated corridors operate within designated capacity thresholds.",
    });
  }

  // 4. Trip assignment statement
  if (unassigned <= 1.0) {
    statements.push({
      type: "success",
      text: "All generated traffic is successfully assigned to the network.",
    });
  } else {
    statements.push({
      type: "neutral",
      text: `${formatNumber(unassigned, 1)} trips/h remain internal within the development site.`,
    });
  }

  return statements;
}

/**
 * Returns network-wide change classification label.
 */
export function getNetworkWideChangeLabel(st4) {
  const avgDelta = Math.abs(Number(st4?.avg_vc_change ?? 0));
  if (avgDelta >= 0.15) return "HIGH CHANGE";
  if (avgDelta >= 0.05) return "MODERATE CHANGE";
  return "LOW CHANGE";
}

/**
 * Returns localized impact classification label.
 */
export function getLocalizedImpactLabel(st4) {
  const criticalCount = Number(st4?.roads_reaching_vc_1_or_more_count ?? 0);
  const maxDelta = Number(st4?.max_vc_change ?? 0);
  if (criticalCount > 0 || maxDelta >= 0.20) return "SIGNIFICANT IMPACT";
  if (maxDelta >= 0.10) return "MODERATE IMPACT";
  return "MINIMAL IMPACT";
}
