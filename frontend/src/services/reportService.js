/**
 * Report Storage, Query, and Versioning Service
 * Manages persistence, retrieval, querying, and invalidation of completed What-If
 * simulation reports associated with individual buildings/developments.
 */

export const REPORT_STORAGE_KEY = "urban_digital_twin_simulation_reports_v1";

/**
 * Safely loads all stored simulation reports from localStorage.
 * @returns {Array<Object>}
 */
export function loadStoredReports() {
  try {
    if (typeof window === "undefined" || !window.localStorage) {
      return [];
    }
    const raw = window.localStorage.getItem(REPORT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  } catch (err) {
    console.warn("Failed to load stored simulation reports:", err);
    return [];
  }
}

/**
 * Safely saves the list of simulation reports to localStorage.
 * @param {Array<Object>} reports
 */
export function saveStoredReports(reports) {
  try {
    if (typeof window === "undefined" || !window.localStorage) {
      return;
    }
    window.localStorage.setItem(REPORT_STORAGE_KEY, JSON.stringify(reports || []));
  } catch (err) {
    console.warn("Failed to persist simulation reports:", err);
  }
}

/**
 * Builds a normalized development snapshot for snapshotting at simulation time.
 * @param {Object} development
 * @param {Object} [simulationResult]
 * @returns {Object}
 */
export function buildDevelopmentSnapshot(development, simulationResult) {
  const devInput = simulationResult?.development_input || {};
  return {
    developmentId:
      development?.development_id ||
      development?.id ||
      simulationResult?.development_id ||
      devInput.development_id ||
      "",
    name: development?.name || devInput.name || "",
    developmentType:
      development?.development_type ||
      development?.type ||
      devInput.development_type ||
      "residential_compound",
    zoneId:
      simulationResult?.zone_id ||
      devInput.zone_id ||
      development?.zone_id ||
      "R3-Z01",
    floors: Number(development?.floors ?? devInput.floors ?? 1),
    latitude: Number(development?.latitude ?? devInput.latitude ?? 0),
    longitude: Number(development?.longitude ?? devInput.longitude ?? 0),
    properties: { ...(devInput.properties || {}), ...(development?.properties || {}) },
  };
}

/**
 * Builds a standardized report record from a development and simulation result.
 * @param {Object} params
 * @param {Object} params.development
 * @param {Object} params.simulationResult
 * @param {string} [params.scenarioName]
 * @returns {Object}
 */
export function createReportRecord({ development, simulationResult, scenarioName }) {
  const devInput = simulationResult?.development_input || {};
  const devId =
    development?.development_id ||
    development?.id ||
    simulationResult?.development_id ||
    devInput.development_id ||
    `dev_${Date.now()}`;

  const resolvedName =
    scenarioName ||
    development?.name ||
    devInput.name ||
    `${(development?.development_type || devInput.development_type || "Scenario").replace(/_/g, " ")} Assessment`;

  const resolvedType =
    development?.development_type ||
    development?.type ||
    devInput.development_type ||
    "residential_compound";

  const resolvedZone =
    simulationResult?.zone_id ||
    devInput.zone_id ||
    development?.zone_id ||
    "R3-Z01";

  const resolvedHour =
    simulationResult?.simulation_hour ??
    simulationResult?.hour ??
    devInput.simulation_hour ??
    8;

  const snapshot = buildDevelopmentSnapshot(development, simulationResult);

  return {
    id: `rep_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    developmentId: devId,
    createdAt: new Date().toISOString(),
    scenarioName: resolvedName,
    developmentType: resolvedType,
    zoneId: resolvedZone,
    hour: resolvedHour,
    developmentSnapshot: snapshot,
    result: simulationResult,
  };
}

/**
 * Checks if a report is current or outdated compared to the development's current configuration.
 * Compares simulation-relevant parameters (type, floors, coordinates, properties).
 * @param {Object} report
 * @param {Object} currentDevelopment
 * @returns {boolean} true if current, false if outdated
 */
export function isReportCurrentForDevelopment(report, currentDevelopment) {
  if (!report || !currentDevelopment) return false;
  const snap = report.developmentSnapshot;
  if (!snap) {
    // If report was created before snapshot feature, fallback to comparing root properties
    const reportType = report.developmentType || report.result?.development_input?.development_type;
    const currentType = currentDevelopment.development_type || currentDevelopment.type;
    return reportType === currentType;
  }

  const curType = currentDevelopment.development_type || currentDevelopment.type;
  if (snap.developmentType !== curType) return false;

  if (Number(snap.floors) !== Number(currentDevelopment.floors || 1)) return false;

  // Compare coordinates if present
  if (currentDevelopment.latitude != null && snap.latitude != null) {
    if (Math.abs(Number(snap.latitude) - Number(currentDevelopment.latitude)) > 0.0001) {
      return false;
    }
  }
  if (currentDevelopment.longitude != null && snap.longitude != null) {
    if (Math.abs(Number(snap.longitude) - Number(currentDevelopment.longitude)) > 0.0001) {
      return false;
    }
  }

  // Compare simulation-relevant property parameters
  const snapProps = snap.properties || {};
  const curProps = currentDevelopment.properties || {};

  const allPropKeys = Array.from(new Set([...Object.keys(snapProps), ...Object.keys(curProps)]));
  for (const key of allPropKeys) {
    const v1 = snapProps[key];
    const v2 = curProps[key];
    // Treat null/undefined/"" as equal
    const norm1 = v1 == null || v1 === "" ? null : String(v1);
    const norm2 = v2 == null || v2 === "" ? null : String(v2);
    if (norm1 !== norm2) {
      return false;
    }
  }

  return true;
}

/**
 * Returns "current" or "outdated" status string for a report.
 * @param {Object} report
 * @param {Object} currentDevelopment
 * @returns {"current"|"outdated"}
 */
export function getReportStatus(report, currentDevelopment) {
  return isReportCurrentForDevelopment(report, currentDevelopment) ? "current" : "outdated";
}

/**
 * Returns all reports associated with a specific development ID, sorted newest first.
 * @param {Array<Object>} reports
 * @param {string} developmentId
 * @returns {Array<Object>}
 */
export function getReportsForDevelopment(reports, developmentId) {
  if (!Array.isArray(reports) || !developmentId) return [];
  return reports
    .filter((r) => r.developmentId === developmentId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

/**
 * Returns the most recent completed report for a development, or null.
 * @param {Array<Object>} reports
 * @param {string} developmentId
 * @returns {Object|null}
 */
export function getLatestReportForDevelopment(reports, developmentId) {
  const devReports = getReportsForDevelopment(reports, developmentId);
  return devReports.length > 0 ? devReports[0] : null;
}

/**
 * Adds a new report to the collection and returns the updated array.
 * @param {Array<Object>} reports
 * @param {Object} newReport
 * @returns {Array<Object>}
 */
export function addReportToCollection(reports, newReport) {
  const current = Array.isArray(reports) ? reports : [];
  const updated = [newReport, ...current.filter((r) => r.id !== newReport.id)];
  saveStoredReports(updated);
  return updated;
}

/**
 * Removes all reports associated with a development ID.
 * @param {Array<Object>} reports
 * @param {string} developmentId
 * @returns {Array<Object>}
 */
export function removeReportsForDevelopment(reports, developmentId) {
  if (!Array.isArray(reports) || !developmentId) return reports || [];
  const updated = reports.filter((r) => r.developmentId !== developmentId);
  saveStoredReports(updated);
  return updated;
}
