import { Color } from "cesium";

/**
 * Authoritative traffic classification and color system.
 * Based on models/traffic-model/config/impact_thresholds.json:
 *
 * Baseline LOS Thresholds:
 *   A: V/C < 0.60       -> Emerald Green (Free Flow)
 *   B/C: 0.60 <= V/C < 0.80 -> Lime/Yellow (Normal Flow)
 *   D/E: 0.80 <= V/C < 1.00 -> Orange (Approaching Capacity)
 *   F: V/C >= 1.00      -> Red (Congested / Over Capacity)
 *
 * Scenario Impact Rules:
 *   CRITICAL: V/C >= 1.00 OR LOS becomes F OR severity === 'CRITICAL' -> Dark Red
 *   HIGH / SIGNIFICANTLY WORSENED: V/C >= 0.90 OR LOS drop >= 2 OR Delta V/C >= 0.15 -> Red
 *   MODERATE / WORSENED: V/C >= 0.80 OR LOS drop >= 1 OR Delta V/C >= 0.05 OR is_los_worsened -> Orange
 *   MODERATE IMPACT: Delta V/C >= 0.02 -> Yellow-Gold
 *   HEALTHY / UNAFFECTED: Delta V/C < 0.02 and V/C < 0.80 -> Emerald Green
 */

export const TRAFFIC_HEX = {
  HEALTHY: "#10b981",    // Emerald
  MODERATE: "#eab308",   // Yellow / Gold
  WORSENED: "#f97316",   // Vibrant Orange
  HIGH_IMPACT: "#ef4444",// Red
  CRITICAL: "#b91c1c",   // Crimson / Dark Red
  DEFAULT: "#6a7686",    // Neutral Slate
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
 * Classify scenario traffic condition and development impact.
 * Compares baseline vs scenario to emphasize changes introduced by the development.
 */
export function classifyScenarioRoadImpact(assessment) {
  if (!assessment) return null;

  const scenVc = Number(assessment.scenario_vc ?? assessment.baseline_vc ?? 0);
  const vcChange = Number(assessment.vc_change ?? 0);
  const isWorsened = Boolean(assessment.is_los_worsened);
  const severity = (assessment.impact_severity || "").toUpperCase();
  const scenLos = assessment.scenario_los;
  const losDrop = Number(assessment.los_change_levels ?? 0);

  // 1. Critical Impact
  if (severity === "CRITICAL" || scenVc >= 1.00 || scenLos === "F") {
    return {
      status: "CRITICAL",
      color: TRAFFIC_COLORS.CRITICAL,
      hex: TRAFFIC_HEX.CRITICAL,
      label: "Critical Impact",
      isHighlighted: true,
    };
  }

  // 2. High / Significantly Worsened
  if (severity === "HIGH" || losDrop >= 2 || vcChange >= 0.15 || (scenVc >= 0.90 && isWorsened)) {
    return {
      status: "HIGH_IMPACT",
      color: TRAFFIC_COLORS.HIGH_IMPACT,
      hex: TRAFFIC_HEX.HIGH_IMPACT,
      label: "Significantly Worsened",
      isHighlighted: true,
    };
  }

  // 3. Moderate / Worsened
  if (isWorsened || severity === "MODERATE" || losDrop >= 1 || vcChange >= 0.05) {
    return {
      status: "WORSENED",
      color: TRAFFIC_COLORS.WORSENED,
      hex: TRAFFIC_HEX.WORSENED,
      label: "Worsened",
      isHighlighted: true,
    };
  }

  // 4. Minor Impact
  if (vcChange >= 0.02) {
    return {
      status: "MODERATE",
      color: TRAFFIC_COLORS.MODERATE,
      hex: TRAFFIC_HEX.MODERATE,
      label: "Moderate Impact",
      isHighlighted: false,
    };
  }

  // 5. Unaffected / Healthy
  return {
    status: "HEALTHY",
    color: TRAFFIC_COLORS.HEALTHY,
    hex: TRAFFIC_HEX.HEALTHY,
    label: "Unaffected / Healthy",
    isHighlighted: false,
  };
}

/**
 * Extract clean OSM way ID from any raw road ID format:
 * e.g. "way_90604136" -> "90604136", "osm_90604136_0" -> "90604136", "90604136" -> "90604136".
 */
export function extractOsmWayId(rawId) {
  if (!rawId) return "";
  const str = String(rawId).trim();
  const match = str.match(/(?:osm_|way_)?(\d+)/);
  return match ? match[1] : str;
}
