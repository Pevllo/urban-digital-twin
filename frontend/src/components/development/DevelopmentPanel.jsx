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
} from "lucide-react";
import { useApp } from "../../store/AppContext.jsx";
import { Panel } from "../common/Panel.jsx";
import { ErrorMessage } from "../common/ErrorMessage.jsx";
import { DevelopmentTypeSelector } from "./DevelopmentTypeSelector.jsx";
import { DevelopmentForm } from "./DevelopmentForm.jsx";
import { DeleteConfirmModal } from "./DeleteConfirmModal.jsx";
import {
  placeDevelopment,
  buildDevelopmentPayload,
  removeDevelopment,
} from "../../services/developmentService.js";
import { resolveDevelopmentPlacement } from "../map/development/developmentLayouts.js";
import { SPATIAL_FEATURES } from "../../config/mapConfig.js";
import { ApiError } from "../../api/client.js";
import { formatLat, formatLon } from "../../utils/format.js";
import { PROPERTY_FIELDS } from "../../config/developmentForm.js";

export function DevelopmentPanel() {
  const { state, dispatch } = useApp();
  const dev = state.development;
  const selectedDev = state.developments.selected;
  const location = state.map.selectedLocation;
  const deletingId = state.developments.deletingId;
  const deleteError = state.developments.deleteError;

  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [devPendingDelete, setDevPendingDelete] = useState(null);

  // Active development to display if selected or placed
  const activeDev = selectedDev || dev.placed;
  const isSelectedView = Boolean(selectedDev);
  const isPlacedView = Boolean(dev.placed && !selectedDev);

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
    const devId = devPendingDelete.development_id || devPendingDelete.id;
    if (!devId) return;

    dispatch({ type: "DEVELOPMENT_DELETING", developmentId: devId });

    try {
      await removeDevelopment(devId);
      dispatch({ type: "DEVELOPMENT_DELETED", developmentId: devId });
      dispatch({ type: "DEVELOPMENTS_RELOAD" });
      setConfirmModalOpen(false);
      setDevPendingDelete(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        // Already deleted on backend -> sync state
        dispatch({ type: "DEVELOPMENT_DELETED", developmentId: devId });
        dispatch({ type: "DEVELOPMENTS_RELOAD" });
        setConfirmModalOpen(false);
        setDevPendingDelete(null);
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
    dispatch({ type: "SET_NEW_SCENARIO" });
  }

  function handleDeselect() {
    dispatch({ type: "DEVELOPMENT_DESELECTED" });
  }

  return (
    <>
      <Panel
        title={
          isSelectedView
            ? "Development Details"
            : isPlacedView
            ? "Placed Development"
            : "New Development"
        }
        icon={isSelectedView ? <Layers size={14} /> : <Building2 size={14} />}
        className="development-panel"
      >
        {activeDev ? (
          <div className="dev-complete">
            <div className="dev-complete-icon">
              {isPlacedView ? <CheckCircle2 size={22} /> : <Building2 size={22} />}
            </div>
            <div className="dev-complete-title">
              {isPlacedView ? "Development Placed" : "Development Selected"}
            </div>
            <div className="dev-complete-type">{activeDev.development_type}</div>
            {activeDev.name && (
              <div className="dev-complete-name">{activeDev.name}</div>
            )}

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

            {deleteError && <ErrorMessage message={deleteError} compact />}

            <div className="dev-action-stack">
              {isPlacedView && (
                <button
                  className="btn secondary full"
                  onClick={handleNewScenario}
                  type="button"
                >
                  <RefreshCw size={14} />
                  Start New Scenario
                </button>
              )}

              {isSelectedView && (
                <button
                  className="btn secondary full"
                  onClick={handleDeselect}
                  type="button"
                >
                  <ArrowLeft size={14} />
                  Back to New Development
                </button>
              )}

              <button
                className="btn danger full"
                onClick={() => handleOpenDeleteModal(activeDev)}
                disabled={Boolean(deletingId)}
                type="button"
              >
                <Trash2 size={14} />
                DELETE DEVELOPMENT
              </button>
            </div>
          </div>
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
