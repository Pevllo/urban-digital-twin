import { ScreenSpaceEventHandler, ScreenSpaceEventType } from 'cesium';
import { pickGeographicLocation } from '../utils/geoUtils.js';
import { validateBuildability } from '../utils/buildabilityEngine.js';

export function createPlacementController(viewer, options = {}) {
  const {
    devStore,
    buildabilityOverlay,
    developmentRenderer,
    onOpenPropertiesModal,
    onStatusUpdate,
    debugElements = {},
  } = options;

  let activePlacementType = null;
  let isDraggingFromSidebar = false;
  let movingDevId = null;
  let pendingPlacementLocation = null;
  let screenHandler = null;

  function initScreenEvents() {
    if (!viewer) return;
    if (screenHandler) screenHandler.destroy();

    screenHandler = new ScreenSpaceEventHandler(viewer.scene.canvas);

    // Left Click handler: Move confirmation, click-to-place, or entity selection
    screenHandler.setInputAction((click) => {
      // 1. Move location mode
      if (movingDevId) {
        const devRecord = devStore.getDevelopment(movingDevId);
        const type = devRecord ? devRecord.development_type : 'hospital';
        const picked = pickGeographicLocation(viewer, click.position.x, click.position.y, buildabilityOverlay.getPreviewEntity());

        if (picked) {
          const existingDevs = devStore.getAllDevelopments().filter(d => d.id !== movingDevId && d.development_id !== movingDevId);
          const validation = validateBuildability(picked.latitude, picked.longitude, type, existingDevs);
          if (validation.valid) {
            const updated = devStore.moveDevelopment(movingDevId, picked.latitude, picked.longitude, picked.zone_id);
            developmentRenderer.renderDevelopment(updated);
            if (onStatusUpdate) onStatusUpdate(`Moved ${updated.id} to Zone ${picked.zone_id}`, true);
            cancelPlacementMode();
          } else if (onStatusUpdate) {
            onStatusUpdate(`Cannot move building here: ${validation.reason}`);
          }
        }
        return;
      }

      // 2. Click placement mode
      if (activePlacementType && !isDraggingFromSidebar) {
        const picked = pickGeographicLocation(viewer, click.position.x, click.position.y, buildabilityOverlay.getPreviewEntity());
        if (picked) {
          const existingDevs = devStore.getAllDevelopments();
          const validation = validateBuildability(picked.latitude, picked.longitude, activePlacementType, existingDevs);

          if (validation.valid) {
            const tempId = devStore.generateId();
            pendingPlacementLocation = {
              id: tempId,
              development_id: tempId,
              development_type: activePlacementType,
              latitude: picked.latitude,
              longitude: picked.longitude,
              zone_id: picked.zone_id,
              isNew: true,
            };
            if (onOpenPropertiesModal) onOpenPropertiesModal(pendingPlacementLocation);
            activePlacementType = null;
          } else if (onStatusUpdate) {
            onStatusUpdate(`Invalid location: ${validation.reason}`);
          }
        }
        return;
      }

      // 3. Entity Selection for editing/inspection
      const pickedObject = viewer.scene.pick(click.position);
      if (pickedObject && pickedObject.id && (pickedObject.id.devId || pickedObject.id.id)) {
        const clickedDevId = pickedObject.id.devId || pickedObject.id.id;
        const devRecord = devStore.getDevelopment(clickedDevId);
        if (devRecord && onOpenPropertiesModal) {
          onOpenPropertiesModal({ ...devRecord, isNew: false });
        }
      }
    }, ScreenSpaceEventType.LEFT_CLICK);
  }

  function startPlacement(typeKey, spec, event) {
    activePlacementType = typeKey;
    isDraggingFromSidebar = true;
    if (onStatusUpdate) onStatusUpdate(`PLACEMENT MODE — Move over 3D map to place ${spec.label}`);
  }

  function handlePointerMove(e) {
    if (!activePlacementType) return;

    const picked = pickGeographicLocation(viewer, e.clientX, e.clientY, buildabilityOverlay.getPreviewEntity());

    if (picked) {
      const existingDevs = devStore.getAllDevelopments().filter(d => d.id !== movingDevId && d.development_id !== movingDevId);
      picked.collision = validateBuildability(picked.latitude, picked.longitude, activePlacementType, existingDevs);
      buildabilityOverlay.updatePreview(picked, activePlacementType);

      // Update Debug Panel if provided
      if (debugElements.panel) debugElements.panel.classList.remove('hidden');
      if (debugElements.devType) debugElements.devType.textContent = activePlacementType;
      if (debugElements.devId) debugElements.devId.textContent = 'PREVIEW';
      if (debugElements.lat) debugElements.lat.textContent = `${picked.latitude.toFixed(4)}° N`;
      if (debugElements.lon) debugElements.lon.textContent = `${picked.longitude.toFixed(4)}° E`;
      if (debugElements.zone) debugElements.zone.textContent = picked.zone_id;
      if (debugElements.status) debugElements.status.textContent = picked.collision.valid ? 'VALID CANDIDATE' : `BLOCKED (${picked.collision.conflictType})`;
    }
  }

  function handlePointerUp(e) {
    if (!isDraggingFromSidebar || !activePlacementType) return;
    isDraggingFromSidebar = false;

    const releasePick = pickGeographicLocation(viewer, e.clientX, e.clientY, buildabilityOverlay.getPreviewEntity());

    if (releasePick) {
      const existingDevs = devStore.getAllDevelopments();
      const validation = validateBuildability(releasePick.latitude, releasePick.longitude, activePlacementType, existingDevs);

      if (validation.valid) {
        const tempId = devStore.generateId();
        pendingPlacementLocation = {
          id: tempId,
          development_id: tempId,
          development_type: activePlacementType,
          latitude: releasePick.latitude,
          longitude: releasePick.longitude,
          zone_id: releasePick.zone_id,
          isNew: true,
        };
        if (onOpenPropertiesModal) onOpenPropertiesModal(pendingPlacementLocation);
      } else {
        if (onStatusUpdate) onStatusUpdate(`Placement rejected: ${validation.reason}`);
        cancelPlacementMode();
      }
    } else {
      cancelPlacementMode();
    }
  }

  function cancelPlacementMode() {
    activePlacementType = null;
    isDraggingFromSidebar = false;
    movingDevId = null;
    pendingPlacementLocation = null;

    buildabilityOverlay.clearPreview();
    if (debugElements.panel) debugElements.panel.classList.add('hidden');
  }

  function getPendingLocation() {
    return pendingPlacementLocation;
  }

  function setMovingId(id) {
    movingDevId = id;
  }

  return {
    initScreenEvents,
    startPlacement,
    handlePointerMove,
    handlePointerUp,
    cancelPlacementMode,
    getPendingLocation,
    setMovingId,
  };
}
