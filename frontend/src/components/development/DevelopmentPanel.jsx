import { useState } from "react";
import {
  Building2,
  MapPin,
  CheckCircle2,
  RefreshCw,
  Loader2,
  Trash2,
  Layers,
  ArrowLeft,
  FileText,
  AlertTriangle,
  Clock,
  Edit3,
  Save,
  X,
} from "lucide-react";
import { useApp } from "../../store/AppContext.jsx";
import { Panel } from "../common/Panel.jsx";
import { ErrorMessage } from "../common/ErrorMessage.jsx";
import { DevelopmentTypeSelector } from "./DevelopmentTypeSelector.jsx";
import { DevelopmentForm } from "./DevelopmentForm.jsx";
import { DeleteConfirmModal } from "./DeleteConfirmModal.jsx";
import { BuildingReportsList } from "./BuildingReportsList.jsx";
import {
  placeDevelopment,
  editDevelopment,
  buildDevelopmentPayload,
  removeDevelopment,
} from "../../services/developmentService.js";
import {
  getReportsForDevelopment,
  getLatestReportForDevelopment,
  isReportCurrentForDevelopment,
} from "../../services/reportService.js";
import { resolveDevelopmentPlacement } from "../map/development/developmentLayouts.js";
import { SPATIAL_FEATURES } from "../../config/mapConfig.js";
import { ApiError } from "../../api/client.js";
import { formatLat, formatLon, formatNumber } from "../../utils/format.js";
import { PROPERTY_FIELDS } from "../../config/developmentForm.js";

function formatDate(dateStr) {
  if (!dateStr) return "--";
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

export function DevelopmentPanel() {
  const { state, dispatch } = useApp();
  const dev = state.development;
  const selectedDev = state.developments.selected;
  const location = state.map.selectedLocation;
  const deletingId = state.developments.deletingId;
  const deleteError = state.developments.deleteError;

  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [devPendingDelete, setDevPendingDelete] = useState(null);
  const [showHistoryView, setShowHistoryView] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);

  // Active development to display if selected or placed
  const activeDev = selectedDev || dev.placed;
  const isSelectedView = Boolean(selectedDev);
  const isPlacedView = Boolean(dev.placed && !selectedDev);

  // Check if currently editing the active development
  const isEditing = Boolean(
    state.ui.editingDevelopmentId &&
      activeDev &&
      ((activeDev.development_id && activeDev.development_id === state.ui.editingDevelopmentId) ||
        (activeDev.id && activeDev.id === state.ui.editingDevelopmentId))
  );

  // Query reports for the active building
  const devId = activeDev?.development_id || activeDev?.id || null;
  const devReports = devId ? getReportsForDevelopment(state.reports, devId) : [];
  const latestReport = devId ? getLatestReportForDevelopment(state.reports, devId) : null;
  const isLatestCurrent = latestReport && activeDev ? isReportCurrentForDevelopment(latestReport, activeDev) : false;
  const hasOutdatedReports = devReports.length > 0 && !isLatestCurrent;

  async function handlePlace() {
    if (!location) {
      dispatch({
        type: "DEVELOPMENT_PLACE_ERROR",
        error: "Select a location on the map before placing the development.",
      });
      return;
    }

    // Spatially validate placement candidate
    const resolution = resolveDevelopmentPlacement(
      { development_type: dev.type, floors: dev.floors, properties: dev.properties },
      location.latitude,
      location.longitude,
      SPATIAL_FEATURES
    );

    if (!resolution.success) {
      dispatch({
        type: "DEVELOPMENT_PLACE_ERROR",
        error: resolution.error || "Selected location is not buildable. Please select a nearby open plot.",
      });
      return;
    }

    const finalLat = resolution.anchorLat;
    const finalLon = resolution.anchorLon;

    dispatch({ type: "DEVELOPMENT_PLACING" });
    const payload = buildDevelopmentPayload({
      type: dev.type,
      name: dev.name,
      latitude: finalLat,
      longitude: finalLon,
      floors: dev.floors,
      properties: dev.properties,
    });
    try {
      const created = await placeDevelopment(payload);
      dispatch({ type: "DEVELOPMENT_PLACED", dev: created });
      dispatch({ type: "MAP_LOCATION_CLEARED" });
      dispatch({ type: "DEVELOPMENTS_RELOAD" });
    } catch (err) {
      dispatch({
        type: "DEVELOPMENT_PLACE_ERROR",
        error: err instanceof ApiError ? err.message : "Failed to place development.",
      });
    }
  }

  function handleStartEdit() {
    if (!activeDev) return;
    dispatch({ type: "START_EDIT_DEVELOPMENT", dev: activeDev });
  }

  function handleCancelEdit() {
    dispatch({ type: "CANCEL_EDIT_DEVELOPMENT" });
  }

  async function handleSaveEdit() {
    if (!activeDev) return;
    const targetDevId = activeDev.development_id || activeDev.id;
    setSavingEdit(true);

    try {
      const payload = {
        development_id: targetDevId,
        development_type: dev.type,
        name: dev.name,
        latitude: activeDev.latitude,
        longitude: activeDev.longitude,
        floors: Number(dev.floors) || 1,
        status: activeDev.status || "proposed",
        properties: dev.properties || {},
      };
      const updated = await editDevelopment(targetDevId, payload);
      dispatch({ type: "DEVELOPMENT_UPDATED", dev: updated });
      dispatch({ type: "DEVELOPMENTS_RELOAD" });
      setSavingEdit(false);
    } catch (err) {
      setSavingEdit(false);
      dispatch({
        type: "DEVELOPMENT_PLACE_ERROR",
        error: err instanceof ApiError ? err.message : "Failed to update development.",
      });
    }
  }

  function handleOpenDeleteModal(targetDev) {
    setDevPendingDelete(targetDev);
    setConfirmModalOpen(true);
  }

  function handleCloseDeleteModal() {
    if (deletingId) return;
    setConfirmModalOpen(false);
    setDevPendingDelete(null);
  }

  async function handleConfirmDelete() {
    if (!devPendingDelete) return;
    const targetDevId = devPendingDelete.development_id || devPendingDelete.id;
    if (!targetDevId) return;

    dispatch({ type: "DEVELOPMENT_DELETING", developmentId: targetDevId });

    try {
      await removeDevelopment(targetDevId);
      dispatch({ type: "DEVELOPMENT_DELETED", developmentId: targetDevId });
      dispatch({ type: "DEVELOPMENTS_RELOAD" });
      setConfirmModalOpen(false);
      setDevPendingDelete(null);
      setShowHistoryView(false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        // Already deleted on backend -> sync state
        dispatch({ type: "DEVELOPMENT_DELETED", developmentId: targetDevId });
        dispatch({ type: "DEVELOPMENTS_RELOAD" });
        setConfirmModalOpen(false);
        setDevPendingDelete(null);
        setShowHistoryView(false);
        return;
      }
      const msg =
        err instanceof ApiError
          ? err.message
          : "Unable to delete development. Please try again.";
      dispatch({
        type: "DEVELOPMENT_DELETE_ERROR",
        error: msg,
      });
    }
  }

  function handleNewScenario() {
    setShowHistoryView(false);
    dispatch({ type: "SET_NEW_SCENARIO" });
  }

  function handleDeselect() {
    setShowHistoryView(false);
    dispatch({ type: "DEVELOPMENT_DESELECTED" });
  }

  function handleViewLatestReport() {
    if (latestReport) {
      dispatch({ type: "OPEN_FULL_REPORT", report: latestReport });
    }
  }

  return (
    <>
      <Panel
        title={
          isEditing
            ? "Edit Development"
            : showHistoryView
            ? "Report History"
            : isSelectedView
            ? "Building Details"
            : isPlacedView
            ? "Placed Development"
            : "New Development"
        }
        icon={
          isEditing ? (
            <Edit3 size={14} />
          ) : showHistoryView ? (
            <FileText size={14} />
          ) : isSelectedView ? (
            <Layers size={14} />
          ) : (
            <Building2 size={14} />
          )
        }
        className="development-panel"
      >
        {isEditing ? (
          <div className="dev-edit-form">
            <div className="dev-edit-header-badge">
              <Edit3 size={12} />
              <span>Editing: {activeDev.name || activeDev.development_type}</span>
            </div>
            <DevelopmentTypeSelector />
            <DevelopmentForm />
            <div className="dev-location-status">
              <MapPin size={13} />
              <span>
                {formatLat(activeDev.latitude)} · {formatLon(activeDev.longitude)} (Location Preserved)
              </span>
            </div>
            <ErrorMessage message={dev.error} compact />
            <div className="dev-action-stack" style={{ marginTop: 8 }}>
              <button
                className="btn primary full cta"
                onClick={handleSaveEdit}
                disabled={savingEdit}
                type="button"
              >
                {savingEdit ? (
                  <>
                    <Loader2 size={14} className="spin" />
                    Saving Changes…
                  </>
                ) : (
                  <>
                    <Save size={14} />
                    <span>SAVE CHANGES</span>
                  </>
                )}
              </button>
              <button
                className="btn secondary full"
                onClick={handleCancelEdit}
                disabled={savingEdit}
                type="button"
              >
                <X size={14} />
                <span>Cancel Edit</span>
              </button>
            </div>
          </div>
        ) : activeDev ? (
          showHistoryView ? (
            <BuildingReportsList
              reports={devReports}
              devName={activeDev.name || activeDev.development_type}
              currentDev={activeDev}
              onBack={() => setShowHistoryView(false)}
            />
          ) : (
            <div className="dev-complete">
              <div className="dev-complete-icon">
                {isPlacedView ? <CheckCircle2 size={22} /> : <Building2 size={22} />}
              </div>
              <div className="dev-complete-title">
                {isPlacedView ? "Development Placed" : "Building Selected"}
              </div>
              <div className="dev-complete-type">{activeDev.development_type}</div>
              {activeDev.name && (
                <div className="dev-complete-name">{activeDev.name}</div>
              )}

              {/* Building Attributes Grid */}
              <div className="dev-details-grid">
                <div className="dev-detail-row">
                  <span className="dev-detail-label">Status</span>
                  <span className="dev-detail-val">
                    {activeDev.status === "proposed" ? "Proposed Scenario" : "Existing"}
                  </span>
                </div>
                {activeDev.floors && (
                  <div className="dev-detail-row">
                    <span className="dev-detail-label">Floors</span>
                    <span className="dev-detail-val">{activeDev.floors}</span>
                  </div>
                )}
                {activeDev.latitude != null && activeDev.longitude != null && (
                  <div className="dev-detail-row">
                    <span className="dev-detail-label">Coordinates</span>
                    <span className="dev-detail-val">
                      {formatLat(activeDev.latitude)}, {formatLon(activeDev.longitude)}
                    </span>
                  </div>
                )}

                {/* Render property attributes if present */}
                {activeDev.properties &&
                  Object.entries(activeDev.properties).map(([key, val]) => {
                    if (val == null || val === "") return null;
                    const fieldDef = PROPERTY_FIELDS[key];
                    const label = fieldDef?.label || key.replace(/_/g, " ");
                    const unit = fieldDef?.unit ? ` ${fieldDef.unit}` : "";
                    return (
                      <div key={key} className="dev-detail-row">
                        <span className="dev-detail-label">{label}</span>
                        <span className="dev-detail-val">
                          {val}
                          {unit}
                        </span>
                      </div>
                    );
                  })}
              </div>

              {/* WHAT-IF REPORTS SECTION */}
              <div className="building-reports-section">
                <div className="building-reports-header">
                  <div className="br-title-row">
                    <FileText size={14} />
                    <span className="br-title">WHAT-IF REPORTS</span>
                  </div>
                  <span className="br-count-badge">
                    {devReports.length} completed {devReports.length === 1 ? "report" : "reports"}
                  </span>
                </div>

                {/* Configuration Changed Notice */}
                {hasOutdatedReports && (
                  <div className="outdated-warning-box">
                    <AlertTriangle size={14} className="warning-icon" />
                    <div className="outdated-warning-content">
                      <span className="outdated-title">CONFIGURATION CHANGED</span>
                      <span className="outdated-desc">
                        This building has been modified since the last What-If simulation.
                      </span>
                    </div>
                  </div>
                )}

                {latestReport ? (
                  <div className="latest-report-card">
                    <div className="lr-card-top">
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span className="lr-card-label">Latest Scenario:</span>
                        <span
                          className={`badge-pill ${isLatestCurrent ? "green" : "orange"}`}
                          style={{ fontSize: "8.5px" }}
                        >
                          {isLatestCurrent ? "CURRENT" : "OUTDATED"}
                        </span>
                      </div>
                      <span className="lr-card-name">{latestReport.scenarioName}</span>
                    </div>

                    {/* Impact & Network status tags */}
                    {latestReport.result?.stage4_impact_assessment && (
                      <div className="lr-tags-row">
                        <span
                          className={`rh-impact-badge ${(latestReport.result.stage4_impact_assessment.overall_impact_level || latestReport.result.stage4_impact_assessment.development_impact || "HEALTHY").toLowerCase()}`}
                        >
                          {(latestReport.result.stage4_impact_assessment.overall_impact_level || latestReport.result.stage4_impact_assessment.development_impact || "HEALTHY") === "CRITICAL" ||
                          (latestReport.result.stage4_impact_assessment.overall_impact_level || latestReport.result.stage4_impact_assessment.development_impact || "HEALTHY") === "HIGH" ? (
                            <AlertTriangle size={11} />
                          ) : (
                            <CheckCircle2 size={11} />
                          )}
                          Impact: {latestReport.result.stage4_impact_assessment.overall_impact_level || latestReport.result.stage4_impact_assessment.development_impact || "HEALTHY"}
                        </span>
                        <span className="rh-network-badge">
                          Network: {latestReport.result.stage4_impact_assessment.network_condition || "MODERATE"}
                        </span>
                      </div>
                    )}

                    <div className="lr-stats-row">
                      <div className="lr-stat">
                        <span className="lr-stat-lbl">Trips:</span>
                        <span className="lr-stat-val">
                          {formatNumber(latestReport.result?.stage4_impact_assessment?.total_development_trips ?? 0, 1)} veh/h
                        </span>
                      </div>
                      <div className="lr-stat">
                        <span className="lr-stat-lbl">Date:</span>
                        <span className="lr-stat-val font-mono">
                          {formatDate(latestReport.createdAt)}
                        </span>
                      </div>
                    </div>

                    <div className="lr-button-group">
                      <button
                        className="btn primary small full"
                        onClick={handleViewLatestReport}
                        type="button"
                      >
                        <FileText size={13} />
                        <span>VIEW LATEST REPORT</span>
                      </button>
                      <button
                        className="btn secondary small full"
                        onClick={() => setShowHistoryView(true)}
                        type="button"
                      >
                        <Clock size={13} />
                        <span>VIEW ALL REPORTS ({devReports.length})</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="no-reports-box">
                    <p className="no-reports-text">No completed simulations yet.</p>
                    <div className="no-reports-hint">
                      Run a simulation below to assess traffic, power, water, and waste impact.
                    </div>
                  </div>
                )}
              </div>

              {deleteError && <ErrorMessage message={deleteError} compact />}

              {/* Development Actions */}
              <div className="dev-action-stack">
                <button
                  className="btn secondary full"
                  onClick={handleStartEdit}
                  type="button"
                >
                  <Edit3 size={14} />
                  <span>EDIT DEVELOPMENT</span>
                </button>

                {isPlacedView && (
                  <button
                    className="btn secondary full"
                    onClick={handleNewScenario}
                    type="button"
                  >
                    <RefreshCw size={14} />
                    <span>Start New Scenario</span>
                  </button>
                )}

                {isSelectedView && (
                  <button
                    className="btn secondary full"
                    onClick={handleDeselect}
                    type="button"
                  >
                    <ArrowLeft size={14} />
                    <span>Back to New Development</span>
                  </button>
                )}

                <button
                  className="btn danger full"
                  onClick={() => handleOpenDeleteModal(activeDev)}
                  disabled={Boolean(deletingId)}
                  type="button"
                >
                  <Trash2 size={14} />
                  <span>DELETE DEVELOPMENT</span>
                </button>
              </div>
            </div>
          )
        ) : (
          <>
            <DevelopmentTypeSelector />
            <DevelopmentForm />
            <div className="dev-location-status">
              <MapPin size={13} />
              {location ? (
                <span>
                  {formatLat(location.latitude)} · {formatLon(location.longitude)}
                </span>
              ) : (
                <span className="muted">No location selected — click the map</span>
              )}
            </div>
            <ErrorMessage message={dev.error} compact />
            <button
              className="btn primary full"
              onClick={handlePlace}
              disabled={dev.placing}
              type="button"
            >
              {dev.placing ? (
                <>
                  <Loader2 size={14} className="spin" />
                  Placing Development…
                </>
              ) : (
                "PLACE DEVELOPMENT"
              )}
            </button>
          </>
        )}
      </Panel>

      <DeleteConfirmModal
        isOpen={confirmModalOpen}
        development={devPendingDelete}
        onConfirm={handleConfirmDelete}
        onCancel={handleCloseDeleteModal}
        isDeleting={Boolean(deletingId)}
        error={deleteError}
      />
    </>
  );
}
