import { Color } from "cesium";

/**
 * Authoritative traffic classification and color system.
 * Based on models/traffic-model/config/impact_thresholds.json:
 *
 * Baseline LOS Thresholds:
 *   A: V/C < 0.60           -> Emerald Green (Free Flow)
 *   B/C: 0.60 <= V/C < 0.80 -> Yellow / Gold (Normal Flow)
 *   D/E: 0.80 <= V/C < 1.00 -> Vibrant Orange (Approaching Capacity)
 *   F: V/C >= 1.00          -> Red / Crimson (Congested / Over Capacity)
 *
 * Scenario Impact Rules:
 *   CRITICAL: V/C >= 1.00 OR LOS becomes F OR severity === 'CRITICAL' -> Crimson Red (#b91c1c, width * 1.6)
 *   HIGH: severity === 'HIGH' OR LOS drop >= 2 OR Delta V/C >= 0.15 -> Red (#ef4444, width * 1.6)
 *   MODERATE / WORSENED: is_los_worsened OR Delta V/C >= 0.05 -> Orange (#f97316, width * 1.6)
 *   MODERATE CHANGE: Delta V/C >= 0.02 -> Yellow-Gold (#eab308, width base)
 *   UNAFFECTED / HEALTHY: Delta V/C < 0.02 and V/C < 0.80 -> Emerald Green (#10b981, width base)
 */

export const TRAFFIC_HEX = {
  HEALTHY: "#10b981",     // Emerald
  MODERATE: "#eab308",    // Yellow / Gold
  WORSENED: "#f97316",    // Vibrant Orange
  HIGH_IMPACT: "#ef4444", // Red
  CRITICAL: "#b91c1c",    // Crimson / Dark Red
  DEFAULT: "#6a7686",     // Neutral Slate
};

export const TRAFFIC_COLORS = {
  HEALTHY: Color.fromCssColorString(TRAFFIC_HEX.HEALTHY),
  MODERATE: Color.fromCssColorString(TRAFFIC_HEX.MODERATE),
  WORSENED: Color.fromCssColorString(TRAFFIC_HEX.WORSENED),
  HIGH_IMPACT: Color.fromCssColorString(TRAFFIC_HEX.HIGH_IMPACT),
  CRITICAL: Color.fromCssColorString(TRAFFIC_HEX.CRITICAL),
  DEFAULT: Color.fromCssColorString(TRAFFIC_HEX.DEFAULT),
};

/**
 * Classify baseline traffic condition from V/C ratio or congestion ratio.
 */
export function classifyBaselineTraffic(vcRatio) {
  if (vcRatio == null || Number.isNaN(Number(vcRatio))) {
    return { status: "DEFAULT", color: TRAFFIC_COLORS.DEFAULT, hex: TRAFFIC_HEX.DEFAULT, label: "Unknown" };
  }
  const vc = Number(vcRatio);
  if (vc < 0.60) {
    return { status: "HEALTHY", color: TRAFFIC_COLORS.HEALTHY, hex: TRAFFIC_HEX.HEALTHY, label: "Healthy (Free Flow)" };
  }
  if (vc < 0.80) {
    return { status: "MODERATE", color: TRAFFIC_COLORS.MODERATE, hex: TRAFFIC_HEX.MODERATE, label: "Moderate" };
  }
  if (vc < 1.00) {
    return { status: "WORSENED", color: TRAFFIC_COLORS.WORSENED, hex: TRAFFIC_HEX.WORSENED, label: "Stressed" };
  }
  return { status: "CRITICAL", color: TRAFFIC_COLORS.CRITICAL, hex: TRAFFIC_HEX.CRITICAL, label: "Congested" };
}

/**
/**
 * Classify scenario traffic condition and development impact.
 * Directly consumes the authoritative backend `impact_severity` when present,
 * or applies the exact same centralized decision rules:
 * - CRITICAL: severity === "CRITICAL" OR scenario_vc >= 1.00 OR scenario_los === "F" -> #b91c1c (width * 1.6)
 * - HIGH: severity === "HIGH" OR los_drop >= 2 OR (scenario_los === "E" AND (los_drop >= 1 OR vc_change >= 0.05)) -> #ef4444 (width * 1.6)
 * - WORSENED: severity === "WORSENED" OR severity === "MODERATE" OR is_los_worsened OR vc_change >= 0.05 -> #f97316 (width * 1.6)
 * - MODERATE CHANGE: vc_change >= 0.02 -> #eab308 (base width)
 * - UNAFFECTED: vc_change < 0.02 -> retain baseline road color (base width)
 */
export function classifyScenarioRoadImpact(assessment, baseRecord = null) {
  if (!assessment) return null;

  const scenVc = Number(assessment.scenario_vc ?? assessment.baseline_vc ?? 0);
  const vcChange = Number(assessment.vc_change ?? 0);
  const isWorsened = Boolean(assessment.is_los_worsened);
  const severity = (assessment.impact_severity || "").toUpperCase();
  const scenLos = assessment.scenario_los;
  const losDrop = Number(assessment.los_change_levels ?? 0);

  // 1. Critical Impact (V/C >= 1.0, LOS F, or backend CRITICAL)
  if (severity === "CRITICAL" || scenVc >= 1.00 || scenLos === "F") {
    return {
      status: "CRITICAL",
      severity: "critical",
      color: TRAFFIC_COLORS.CRITICAL,
      hex: TRAFFIC_HEX.CRITICAL,
      label: "Critical Impact",
      isHighlighted: true,
    };
  }

  // 2. High Impact (Significant LOS drop >= 2 or reaching LOS E with worsening)
  // Note: A -> A is NEVER High Impact even if delta V/C is large
  if (
    severity === "HIGH" ||
    losDrop >= 2 ||
    ((scenLos === "E" || scenVc >= 0.90) && (losDrop >= 1 || vcChange >= 0.05))
  ) {
    return {
      status: "HIGH_IMPACT",
      severity: "high",
      color: TRAFFIC_COLORS.HIGH_IMPACT,
      hex: TRAFFIC_HEX.HIGH_IMPACT,
      label: "High Impact",
      isHighlighted: true,
    };
  }

  // 3. Worsened (Minor LOS drop 1 level, OR material delta V/C >= 0.05 on unchanged LOS)
  if (
    severity === "WORSENED" ||
    severity === "MODERATE" ||
    isWorsened ||
    losDrop >= 1 ||
    vcChange >= 0.05
  ) {
    return {
      status: "WORSENED",
      severity: "worsened",
      color: TRAFFIC_COLORS.WORSENED,
      hex: TRAFFIC_HEX.WORSENED,
      label: "Worsened",
      isHighlighted: true,
    };
  }

  // 4. Minor / Moderate Change
  if (vcChange >= 0.02) {
    return {
      status: "MODERATE",
      severity: "low",
      color: TRAFFIC_COLORS.MODERATE,
      hex: TRAFFIC_HEX.MODERATE,
      label: "Moderate Impact",
      isHighlighted: false,
    };
  }

  // 5. Unaffected (vc_change < 0.02) -> retain baseline road color
  let baseColor = TRAFFIC_COLORS.HEALTHY;
  let baseHex = TRAFFIC_HEX.HEALTHY;
  let baseLabel = "Unaffected / Healthy";

  const baselineVc = Number(
    assessment.baseline_vc ??
    baseRecord?.congestion_ratio ??
    (baseRecord ? baseRecord.traffic_volume / Math.max(baseRecord.road_capacity_proxy, 1) : NaN)
  );

  if (!Number.isNaN(baselineVc)) {
    const baseTraffic = classifyBaselineTraffic(baselineVc);
    baseColor = baseTraffic.color;
    baseHex = baseTraffic.hex;
    baseLabel = `Unaffected (${baseTraffic.label})`;
  }

  return {
    status: "HEALTHY",
    severity: "low",
    color: baseColor,
    hex: baseHex,
    label: baseLabel,
    isHighlighted: false,
  };
}

/**
 * Returns numerical severity rank (1 to 5) for a scenario assessment record.
 */
export function getScenarioAssessmentSeverityRank(assessment) {
  if (!assessment) return 0;
  const severity = (assessment.impact_severity || "").toUpperCase();
  if (severity === "CRITICAL") return 5;
  if (severity === "HIGH") return 4;
  if (severity === "WORSENED" || severity === "MODERATE") return 3;

  const scenVc = Number(assessment.scenario_vc ?? assessment.baseline_vc ?? 0);
  const vcChange = Number(assessment.vc_change ?? 0);
  const scenLos = assessment.scenario_los;
  const losDrop = Number(assessment.los_change_levels ?? 0);

  if (scenVc >= 1.00 || scenLos === "F") return 5;
  if (losDrop >= 2 || ((scenLos === "E" || scenVc >= 0.90) && (losDrop >= 1 || vcChange >= 0.05))) return 4;
  if (losDrop >= 1 || vcChange >= 0.05) return 3;
  if (vcChange >= 0.02) return 2;
  return 1;
}

/**
 * Given two assessment segments for the same parent OSM way, selects the most severe one.
 */
export function pickMoreSevereScenarioAssessment(currentBest, candidate) {
  if (!currentBest) return candidate;
  if (!candidate) return currentBest;

  const rankBest = getScenarioAssessmentSeverityRank(currentBest);
  const rankCandidate = getScenarioAssessmentSeverityRank(candidate);

  if (rankCandidate > rankBest) return candidate;
  if (rankCandidate < rankBest) return currentBest;

  // Same rank: tie-break with delta V/C, then scenario V/C
  const deltaBest = Number(currentBest.vc_change ?? 0);
  const deltaCand = Number(candidate.vc_change ?? 0);
  if (deltaCand > deltaBest) return candidate;
  if (deltaCand < deltaBest) return currentBest;

  const vcBest = Number(currentBest.scenario_vc ?? currentBest.baseline_vc ?? 0);
  const vcCand = Number(candidate.scenario_vc ?? candidate.baseline_vc ?? 0);
  return vcCand >= vcBest ? candidate : currentBest;
}

/**
 * Extract clean numeric OSM way ID from any raw road ID format:
 * e.g. "way_90604136" -> "90604136"
 *      "osm_90604136_0" -> "90604136"
 *      "osm_814422935_2" -> "814422935"
 *      "90604136" -> "90604136".
 */
export function extractOsmWayId(rawId) {
  if (rawId == null) return "";
  const str = String(rawId).trim();
  const match = str.match(/(?:osm_|way_)?(\d+)(?:_\d+)?$/);
  if (match) return match[1];
  const fallback = str.match(/\d+/);
  return fallback ? fallback[0] : str;
}
