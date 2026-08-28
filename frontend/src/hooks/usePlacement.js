import { ScreenSpaceEventHandler, ScreenSpaceEventType } from 'cesium';
import { pickGeographicLocation } from '../utils/geoUtils.js';
import { validateBuildability } from '../utils/buildabilityEngine.js';

export const PLACEMENT_STATES = {
  IDLE: 'IDLE',
  PLACEMENT_ACTIVE: 'PLACEMENT_ACTIVE',
  PREVIEWING: 'PREVIEWING',
  AWAITING_CONFIGURATION: 'AWAITING_CONFIGURATION',
  CONFIRMED: 'CONFIRMED',
  CANCELLED: 'CANCELLED',
  // Backward compatibility aliases
  PLACING: 'PLACEMENT_ACTIVE',
  CONFIGURING: 'AWAITING_CONFIGURATION',
};

export function createPlacementController(viewer, options = {}) {
  const {
    devStore,
    buildabilityOverlay,
    developmentRenderer,
    onOpenPropertiesModal,
    onStatusUpdate,
    debugElements = {},
  } = options;

  let placementState = PLACEMENT_STATES.IDLE;
  let activePlacementType = null;
  let isDraggingFromSidebar = false;
  let movingDevId = null;
  let pendingPlacementLocation = null;
  let screenHandler = null;

  function initScreenEvents() {
    if (!viewer) return;
    if (screenHandler) screenHandler.destroy();

    screenHandler = new ScreenSpaceEventHandler(viewer.scene.canvas);

    // Single Left Click handler: Repositioning, Click-to-place, or Entity Selection
    screenHandler.setInputAction((click) => {
      // If modal is currently open configuring properties, ignore map clicks
      if (
        placementState === PLACEMENT_STATES.AWAITING_CONFIGURATION ||
        pendingPlacementLocation
      ) {
        return;
      }

      // 1. Move/Repositioning mode confirmation
      if (movingDevId) {
        const devRecord = devStore.getDevelopment(movingDevId);
        if (!devRecord) {
          cancelPlacementMode();
          return;
        }

        const type = devRecord.development_type || activePlacementType || 'hospital';
        const picked = pickGeographicLocation(
          viewer,
          click.position.x,
          click.position.y,
          buildabilityOverlay.getPreviewEntity()
        );

        if (picked) {
          const existingDevs = devStore
            .getAllDevelopments()
            .filter((d) => d.id !== movingDevId && d.development_id !== movingDevId);

          const validation = validateBuildability(
            picked.latitude,
            picked.longitude,
            type,
            existingDevs,
            devRecord.properties,
            devRecord.height
          );

          if (validation.valid) {
            const updated = devStore.moveDevelopment(
              movingDevId,
              picked.latitude,
              picked.longitude,
              picked.zone_id
            );
            developmentRenderer.renderDevelopment(updated);
            if (onStatusUpdate) {
              onStatusUpdate(`Moved ${updated.id} to Zone ${picked.zone_id}`, true);
            }
            cancelPlacementMode();
          } else if (onStatusUpdate) {
            onStatusUpdate(`Cannot move building here: ${validation.reason}`);
          }
        }
        return;
      }

      // 2. Click-to-place mode (when active placement initiated via palette)
      if (
        activePlacementType &&
        (placementState === PLACEMENT_STATES.PLACEMENT_ACTIVE ||
          placementState === PLACEMENT_STATES.PREVIEWING)
      ) {
        const picked = pickGeographicLocation(
          viewer,
          click.position.x,
          click.position.y,
          buildabilityOverlay.getPreviewEntity()
        );

        if (picked) {
          const existingDevs = devStore.getAllDevelopments();
          const validation = validateBuildability(
            picked.latitude,
            picked.longitude,
            activePlacementType,
            existingDevs
          );

          if (validation.valid) {
            const tempId = devStore.generateId();
            pendingPlacementLocation = {
              id: tempId,
              development_id: tempId,
              development_type: activePlacementType,
              latitude: Number(picked.latitude),
              longitude: Number(picked.longitude),
              zone_id: picked.zone_id,
              isNew: true,
            };

            // Transition state to AWAITING_CONFIGURATION and freeze/clear preview
            placementState = PLACEMENT_STATES.AWAITING_CONFIGURATION;
            buildabilityOverlay.clearPreview();

            if (onOpenPropertiesModal) {
              onOpenPropertiesModal({ ...pendingPlacementLocation });
            }
          } else if (onStatusUpdate) {
            onStatusUpdate(`Invalid placement location: ${validation.reason}`);
          }
        }
        return;
      }

      // 3. Persistent 3D Entity Selection (only when idle)
      if (placementState === PLACEMENT_STATES.IDLE) {
        const pickedObject = viewer.scene.pick(click.position);
        if (pickedObject && pickedObject.id) {
          const entity = pickedObject.id;

          // NEVER select the temporary preview entity as a permanent development
          if (entity.id === 'placement-preview-entity' || (entity.properties && entity.properties.isPreview && entity.properties.isPreview.getValue())) {
            return;
          }

          const devId =
            (entity.properties && entity.properties.developmentId
              ? entity.properties.developmentId.getValue()
              : null) ||
            entity.devId ||
            entity.id;

          if (devId) {
            const devRecord = devStore.getDevelopment(devId);
            if (devRecord && onOpenPropertiesModal) {
              onOpenPropertiesModal({ ...devRecord, isNew: false });
            }
          }
        }
      }
    }, ScreenSpaceEventType.LEFT_CLICK);
  }

  function startPlacement(typeKey, spec, event) {
    // Teardown any lingering placement session first
    cancelPlacementMode();

    placementState = PLACEMENT_STATES.PLACEMENT_ACTIVE;
    activePlacementType = typeKey;
    isDraggingFromSidebar = true;
    if (onStatusUpdate) {
      onStatusUpdate(`PLACEMENT MODE ACTIVE — Move footprint over 3D map to place ${spec.label}`);
    }
  }

  function handlePointerMove(e) {
    // ONLY update preview when placement or repositioning is active.
    // NEVER mutate devStore or permanent entities during mouse move.
    if (
      (placementState !== PLACEMENT_STATES.PLACEMENT_ACTIVE &&
        placementState !== PLACEMENT_STATES.PREVIEWING) ||
      !activePlacementType ||
      pendingPlacementLocation
    ) {
      return;
    }

    const picked = pickGeographicLocation(
      viewer,
      e.clientX,
      e.clientY,
      buildabilityOverlay.getPreviewEntity()
    );

    if (picked) {
      placementState = PLACEMENT_STATES.PREVIEWING;

      const existingDevs = devStore
        .getAllDevelopments()
        .filter((d) => d.id !== movingDevId && d.development_id !== movingDevId);

      const devRecord = movingDevId ? devStore.getDevelopment(movingDevId) : null;
      const props = devRecord ? devRecord.properties : {};
      const heightOverride = devRecord ? devRecord.height : 0;

      picked.collision = validateBuildability(
        picked.latitude,
        picked.longitude,
        activePlacementType,
        existingDevs,
        props,
        heightOverride
      );

      // ONLY update the temporary preview entity
      buildabilityOverlay.updatePreview(picked, activePlacementType);

      // Update Debug Info Panel
      if (debugElements.panel) debugElements.panel.classList.remove('hidden');
      if (debugElements.devType) debugElements.devType.textContent = activePlacementType;
      if (debugElements.devId) debugElements.devId.textContent = movingDevId || 'PREVIEW';
      if (debugElements.lat) debugElements.lat.textContent = `${picked.latitude.toFixed(4)}° N`;
      if (debugElements.lon) debugElements.lon.textContent = `${picked.longitude.toFixed(4)}° E`;
      if (debugElements.zone) debugElements.zone.textContent = picked.zone_id;
      if (debugElements.status) {
        debugElements.status.textContent = picked.collision.valid
          ? 'VALID CANDIDATE'
          : `BLOCKED (${picked.collision.reason || picked.collision.conflictType})`;
      }
    }
  }

  function handlePointerUp(e) {
    if (!isDraggingFromSidebar) return;
    isDraggingFromSidebar = false;

    if (
      (placementState !== PLACEMENT_STATES.PLACEMENT_ACTIVE &&
        placementState !== PLACEMENT_STATES.PREVIEWING) ||
      !activePlacementType
    ) {
      return;
    }

    const releasePick = pickGeographicLocation(
      viewer,
      e.clientX,
      e.clientY,
      buildabilityOverlay.getPreviewEntity()
    );

    // If released over map canvas at a valid coordinate:
    if (releasePick) {
      const existingDevs = devStore
        .getAllDevelopments()
        .filter((d) => d.id !== movingDevId && d.development_id !== movingDevId);

      const validation = validateBuildability(
        releasePick.latitude,
        releasePick.longitude,
        activePlacementType,
        existingDevs
      );

      if (validation.valid) {
        if (movingDevId) {
          const updated = devStore.moveDevelopment(
            movingDevId,
            releasePick.latitude,
            releasePick.longitude,
            releasePick.zone_id
          );
          developmentRenderer.renderDevelopment(updated);
          if (onStatusUpdate) {
            onStatusUpdate(`Moved ${updated.id} to Zone ${releasePick.zone_id}`, true);
          }
          cancelPlacementMode();
        } else {
          const tempId = devStore.generateId();
          pendingPlacementLocation = {
            id: tempId,
            development_id: tempId,
            development_type: activePlacementType,
            latitude: Number(releasePick.latitude),
            longitude: Number(releasePick.longitude),
            zone_id: releasePick.zone_id,
            isNew: true,
          };

          placementState = PLACEMENT_STATES.AWAITING_CONFIGURATION;
          buildabilityOverlay.clearPreview();

          if (onOpenPropertiesModal) {
            onOpenPropertiesModal({ ...pendingPlacementLocation });
          }
        }
      } else {
        if (onStatusUpdate) onStatusUpdate(`Placement rejected: ${validation.reason}`);
      }
    }
    // If pointer released over sidebar, do NOT cancel placement mode so click-to-place remains active
  }

  function cancelPlacementMode() {
    console.log('[PLACEMENT STATE TRANSITION]', {
      from: placementState,
      to: PLACEMENT_STATES.IDLE,
      activePlacementType,
      movingDevId,
      pendingPlacementLocation,
    });

    placementState = PLACEMENT_STATES.IDLE;
    activePlacementType = null;
    isDraggingFromSidebar = false;
    movingDevId = null;
    pendingPlacementLocation = null;

    buildabilityOverlay.clearPreview();
    if (debugElements.panel) debugElements.panel.classList.add('hidden');
  }

  function destroy() {
    cancelPlacementMode();
    if (screenHandler) {
      screenHandler.destroy();
      screenHandler = null;
    }
  }

  function getPendingLocation() {
    return pendingPlacementLocation ? { ...pendingPlacementLocation } : null;
  }

  function getState() {
    return placementState;
  }

  function getActiveType() {
    return activePlacementType;
  }

  function getMovingDevId() {
    return movingDevId;
  }

  function setMovingId(id) {
    cancelPlacementMode();
    const devRecord = devStore.getDevelopment(id);
    if (!devRecord) return;

    movingDevId = id;
    activePlacementType = devRecord.development_type;
    placementState = PLACEMENT_STATES.PLACEMENT_ACTIVE;
    if (onStatusUpdate) {
      onStatusUpdate(`REPOSITIONING ${id} — Move cursor to select new location on 3D map`);
    }

    console.log('[PLACEMENT STATE TRANSITION: REPOSITIONING]', {
      movingDevId: id,
      activePlacementType,
      state: placementState,
      devRecordPosition: { lat: devRecord.latitude, lon: devRecord.longitude },
    });
  }

  return {
    initScreenEvents,
    startPlacement,
    handlePointerMove,
    handlePointerUp,
    cancelPlacementMode,
    destroy,
    getPendingLocation,
    getState,
    getActiveType,
    getMovingDevId,
    setMovingId,
  };
}

