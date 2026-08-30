import { ScreenSpaceEventHandler, ScreenSpaceEventType } from 'cesium';
import { pickGeographicLocation } from '../utils/geoUtils.js';
import { validateBuildability } from '../utils/buildabilityEngine.js';

export const PLACEMENT_INTERACTIONS = {
  NONE: 'NONE',
  CLICK_TO_PLACE: 'CLICK_TO_PLACE',
  DRAGGING_FROM_SIDEBAR: 'DRAGGING_FROM_SIDEBAR',
  MOVE_EXISTING: 'MOVE_EXISTING',
};

// Backward compatibility alias
export const INTERACTION_MODES = PLACEMENT_INTERACTIONS;

export const PLACEMENT_STATES = {
  IDLE: 'IDLE',
  PLACING: 'PLACING',
  CONFIGURING: 'CONFIGURING',
  PLACEMENT_ACTIVE: 'PLACING',
  PREVIEWING: 'PLACING',
  AWAITING_CONFIGURATION: 'CONFIGURING',
  CONFIRMED: 'CONFIRMED',
  CANCELLED: 'CANCELLED',
};

export function createPlacementController(viewer, options = {}) {
  const {
    devStore,
    buildabilityOverlay,
    developmentRenderer,
    onOpenPropertiesModal,
    onStatusUpdate,
    debugElements = {},
    infoCardElements = {},
    placementLegend = null,
    placementBanner = null,
    bannerText = null,
    SUPPORTED_DEV_TYPES = {},
  } = options;

  let placementState = PLACEMENT_STATES.IDLE;
  let placementInteraction = PLACEMENT_INTERACTIONS.NONE;
  let activePlacementType = null;
  let dragStarted = false;
  let movingDevId = null;
  let pendingPlacementLocation = null;
  let screenHandler = null;

  // Pointer drag threshold candidate tracking
  let dragStartX = 0;
  let dragStartY = 0;
  let dragCandidateType = null;
  let dragCandidateSpec = null;
  let capturedPointerId = null;
  let capturedElement = null;
  const DRAG_THRESHOLD = 5;

  function initScreenEvents() {
    if (!viewer) return;
    if (screenHandler) screenHandler.destroy();

    screenHandler = new ScreenSpaceEventHandler(viewer.scene.canvas);

    // Single Left Click handler: Repositioning, Click-to-place, or Entity Selection
    screenHandler.setInputAction((click) => {
      // If modal is currently open configuring properties, ignore map clicks
      if (
        placementState === PLACEMENT_STATES.CONFIGURING ||
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
          click.position.y
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

      // 2. Click-to-place mode confirmation on 3D map click
      if (
        activePlacementType &&
        placementState === PLACEMENT_STATES.PLACING &&
        placementInteraction === PLACEMENT_INTERACTIONS.CLICK_TO_PLACE
      ) {
        const picked = pickGeographicLocation(
          viewer,
          click.position.x,
          click.position.y
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
              terrainHeight: Number(picked.terrainHeight || picked.height || 0),
              zone_id: picked.zone_id,
              isNew: true,
            };

            console.log('[PLACEMENT STATE TRANSITION]', {
              from: placementState,
              to: PLACEMENT_STATES.CONFIGURING,
              type: activePlacementType,
              pendingId: pendingPlacementLocation.id,
            });

            placementState = PLACEMENT_STATES.CONFIGURING;
            buildabilityOverlay.clearPreview();

            if (infoCardElements.card) infoCardElements.card.classList.add('hidden');
            if (placementLegend) placementLegend.classList.add('hidden');

            if (onOpenPropertiesModal) {
              onOpenPropertiesModal({ ...pendingPlacementLocation });
            }
          } else if (onStatusUpdate) {
            onStatusUpdate(`Cannot place building here: ${validation.reason || validation.conflictType}`);
          }
        }
        return;
      }

      // 3. Persistent 3D Entity Selection (only when idle)
      if (placementState === PLACEMENT_STATES.IDLE) {
        const pickedObject = viewer.scene.pick(click.position);
        if (pickedObject && pickedObject.id) {
          const entity = pickedObject.id;

          if (
            entity.id === 'placement-preview-entity' ||
            (entity.properties && entity.properties.isPreview && entity.properties.isPreview.getValue())
          ) {
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

  function handleCardPointerDown(typeKey, spec, e) {
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    dragCandidateType = typeKey;
    dragCandidateSpec = spec;
    dragStarted = false;

    if (e.target && typeof e.target.setPointerCapture === 'function') {
      try {
        e.target.setPointerCapture(e.pointerId);
        capturedPointerId = e.pointerId;
        capturedElement = e.target;
      } catch (err) {
        capturedPointerId = null;
        capturedElement = null;
      }
    }
  }

  function handleCardClick(typeKey, spec) {
    if (!dragStarted) {
      startPlacement(typeKey, spec, PLACEMENT_INTERACTIONS.CLICK_TO_PLACE);
    }
  }

  function startPlacement(typeKey, spec, interaction = PLACEMENT_INTERACTIONS.CLICK_TO_PLACE) {
    cancelPlacementMode();

    const prevState = placementState;
    placementState = PLACEMENT_STATES.PLACING;
    activePlacementType = typeKey;
    placementInteraction = interaction;
    dragStarted = (interaction === PLACEMENT_INTERACTIONS.DRAGGING_FROM_SIDEBAR);

    console.log('[PLACEMENT STATE TRANSITION]', {
      from: prevState,
      to: placementState,
      type: activePlacementType,
      interaction: placementInteraction,
      dragStarted,
    });

    if (onStatusUpdate) {
      onStatusUpdate(`PLACEMENT MODE ACTIVE — Move footprint over 3D map to place ${spec.label}`);
    }
  }

  function handlePointerMove(e) {
    // 1. Check drag threshold if a card pointerdown candidate is active
    if (dragCandidateType && !dragStarted) {
      const dist = Math.hypot(e.clientX - dragStartX, e.clientY - dragStartY);
      if (dist >= DRAG_THRESHOLD) {
        dragStarted = true;
        const prevState = placementState;
        placementState = PLACEMENT_STATES.PLACING;
        placementInteraction = PLACEMENT_INTERACTIONS.DRAGGING_FROM_SIDEBAR;
        activePlacementType = dragCandidateType;

        console.log('[DRAG START]', {
          from: prevState,
          to: placementState,
          type: activePlacementType,
          interaction: placementInteraction,
          dist,
        });

        console.log('[DRAG PREVIEW START]', {
          type: activePlacementType,
          hasOverlay: !!buildabilityOverlay,
          hasViewer: !!viewer,
        });

        if (placementBanner) placementBanner.classList.remove('hidden');
        if (bannerText) {
          bannerText.textContent = `📍 DRAGGING ${dragCandidateSpec ? dragCandidateSpec.label.toUpperCase() : activePlacementType.toUpperCase()} — Drop on 3D map`;
        }
      }
    }

    // 2. ONLY update preview when PLACING state is active
    if (
      placementState !== PLACEMENT_STATES.PLACING ||
      !activePlacementType ||
      pendingPlacementLocation
    ) {
      return;
    }

    if (!buildabilityOverlay) {
      console.warn('[PLACEMENT PREVIEW ERROR]: buildabilityOverlay is null or uninitialized.');
      return;
    }

    const picked = pickGeographicLocation(
      viewer,
      e.clientX,
      e.clientY
    );

    if (picked) {
      console.log('[PREVIEW POSITION]', {
        latitude: picked.latitude,
        longitude: picked.longitude,
        cartesian: picked.cartesian,
      });

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

      buildabilityOverlay.updatePreview(picked, activePlacementType);

      const spec = SUPPORTED_DEV_TYPES[activePlacementType] || SUPPORTED_DEV_TYPES.residential_compound || { label: activePlacementType, defaultDimensions: { width: 10, length: 10, height: 3 } };
      const collision = picked.collision || { valid: true };
      const dims = collision.dimensions || spec.defaultDimensions;
      const width = dims.width || spec.defaultDimensions.width;
      const length = dims.length || spec.defaultDimensions.length;
      const height = dims.height || dims.buildingHeight || spec.defaultDimensions.height;
      const floors = dims.floors || Math.max(1, Math.round(height / 3));
      const areaSqm = width * length;

      // 1. Update Floating HTML Placement Information Card
      if (infoCardElements.card) {
        infoCardElements.card.classList.remove('hidden');
        if (infoCardElements.icon) infoCardElements.icon.textContent = spec.icon || '🏠';
        if (infoCardElements.title) infoCardElements.title.textContent = spec.label || activePlacementType;
        if (infoCardElements.footprint) infoCardElements.footprint.textContent = `${width}m × ${length}m`;
        if (infoCardElements.area) infoCardElements.area.textContent = `${areaSqm.toLocaleString()} m²`;
        if (infoCardElements.height) infoCardElements.height.textContent = `${height.toFixed(2)} m`;
        if (infoCardElements.storeys) infoCardElements.storeys.textContent = `${floors}`;

        if (collision.valid) {
          if (infoCardElements.badge) {
            infoCardElements.badge.className = 'info-card-badge valid';
            infoCardElements.badge.textContent = 'VALID';
          }
          if (infoCardElements.footer) {
            infoCardElements.footer.className = 'card-status-footer valid';
          }
          if (infoCardElements.statusIcon) infoCardElements.statusIcon.textContent = '✓';
          if (infoCardElements.statusText) infoCardElements.statusText.textContent = 'No conflicts detected';
        } else {
          if (infoCardElements.badge) {
            infoCardElements.badge.className = 'info-card-badge invalid';
            infoCardElements.badge.textContent = 'INVALID';
          }
          if (infoCardElements.footer) {
            infoCardElements.footer.className = 'card-status-footer invalid';
          }
          if (infoCardElements.statusIcon) infoCardElements.statusIcon.textContent = '⚠️';

          const reasonTextMap = {
            road_collision: 'Road collision detected',
            building_collision: 'Building collision detected',
            development_collision: 'Proposed development collision',
            outside_study_area: 'Outside study area bounds',
            outside_city_bounds: 'Outside city boundary',
          };
          const reasonMsg = reasonTextMap[collision.reason] || collision.reason || 'Placement area blocked';
          if (infoCardElements.statusText) infoCardElements.statusText.textContent = reasonMsg;
        }
      }

      // 2. Show Bottom Placement Legend & Banner
      if (placementLegend) placementLegend.classList.remove('hidden');
      if (placementBanner) placementBanner.classList.remove('hidden');
      if (bannerText && placementInteraction !== PLACEMENT_INTERACTIONS.DRAGGING_FROM_SIDEBAR) {
        bannerText.textContent = `PLACEMENT MODE ACTIVE — Move pointer over 3D map to place ${spec.label}`;
      }

      // 3. Update Bottom-Right Debug Info Panel
      if (debugElements.panel) debugElements.panel.classList.remove('hidden');
      if (debugElements.devType) debugElements.devType.textContent = activePlacementType;
      if (debugElements.devId) debugElements.devId.textContent = movingDevId || 'PREVIEW';
      if (debugElements.footprint) debugElements.footprint.textContent = `${width}m × ${length}m`;
      if (debugElements.lat) debugElements.lat.textContent = `${picked.latitude.toFixed(4)}° N`;
      if (debugElements.lon) debugElements.lon.textContent = `${picked.longitude.toFixed(4)}° E`;
      if (debugElements.zone) debugElements.zone.textContent = picked.zone_id;
      if (debugElements.status) {
        debugElements.status.className = collision.valid ? 'debug-badge green' : 'debug-badge red';
        debugElements.status.textContent = collision.valid
          ? 'VALID (no conflicts)'
          : `BLOCKED (${collision.reason || collision.conflictType})`;
      }
    }
  }

  function handlePointerUp(e) {
    if (capturedElement && capturedPointerId !== null) {
      try {
        capturedElement.releasePointerCapture(capturedPointerId);
      } catch (err) {}
      capturedPointerId = null;
      capturedElement = null;
    }

    // ONLY process pointerup as a drop if DRAGGING_FROM_SIDEBAR and dragStarted is true
    if (placementInteraction !== PLACEMENT_INTERACTIONS.DRAGGING_FROM_SIDEBAR && !dragStarted) {
      dragCandidateType = null;
      dragCandidateSpec = null;
      return;
    }

    dragStarted = false;
    const currentType = activePlacementType || dragCandidateType;
    dragCandidateType = null;
    dragCandidateSpec = null;

    if (!currentType) return;

    // Verify pointer release occurred inside map canvas bounds
    const canvas = viewer?.scene?.canvas;
    if (!canvas) {
      cancelPlacementMode();
      return;
    }

    const rect = canvas.getBoundingClientRect();
    if (
      e.clientX < rect.left ||
      e.clientX > rect.right ||
      e.clientY < rect.top ||
      e.clientY > rect.bottom
    ) {
      console.log('[DROP OUTSIDE MAP CANVAS] Drag cancelled cleanly.');
      cancelPlacementMode();
      return;
    }

    const releasePick = pickGeographicLocation(
      viewer,
      e.clientX,
      e.clientY
    );

    if (releasePick) {
      console.log('[DROP ON MAP]', {
        latitude: releasePick.latitude,
        longitude: releasePick.longitude,
        zone_id: releasePick.zone_id,
      });

      const existingDevs = devStore
        .getAllDevelopments()
        .filter((d) => d.id !== movingDevId && d.development_id !== movingDevId);

      const validation = validateBuildability(
        releasePick.latitude,
        releasePick.longitude,
        currentType,
        existingDevs
      );

      if (validation.valid) {
        const tempId = devStore.generateId();
        pendingPlacementLocation = {
          id: tempId,
          development_id: tempId,
          development_type: currentType,
          latitude: Number(releasePick.latitude),
          longitude: Number(releasePick.longitude),
          terrainHeight: Number(releasePick.terrainHeight || releasePick.height || 0),
          zone_id: releasePick.zone_id,
          isNew: true,
        };

        console.log('[PLACEMENT STATE TRANSITION]', {
          from: placementState,
          to: PLACEMENT_STATES.CONFIGURING,
          type: currentType,
          pendingId: pendingPlacementLocation.id,
        });

        placementState = PLACEMENT_STATES.CONFIGURING;
        buildabilityOverlay.clearPreview();

        if (infoCardElements.card) infoCardElements.card.classList.add('hidden');
        if (placementLegend) placementLegend.classList.add('hidden');

        if (onOpenPropertiesModal) {
          onOpenPropertiesModal({ ...pendingPlacementLocation });
        }
      } else {
        if (onStatusUpdate) onStatusUpdate(`Placement rejected: ${validation.reason || validation.conflictType}`);
        cancelPlacementMode();
      }
    } else {
      cancelPlacementMode();
    }
  }

  function setMovingId(devId) {
    cancelPlacementMode();
    const devRecord = devStore.getDevelopment(devId);
    if (!devRecord) return;

    placementState = PLACEMENT_STATES.PLACING;
    placementInteraction = PLACEMENT_INTERACTIONS.MOVE_EXISTING;
    activePlacementType = devRecord.development_type || 'hospital';
    movingDevId = devId;

    console.log('[PLACEMENT STATE TRANSITION]', {
      from: PLACEMENT_STATES.IDLE,
      to: PLACEMENT_STATES.PLACING,
      movingDevId,
      interaction: PLACEMENT_INTERACTIONS.MOVE_EXISTING,
    });
  }

  function cancelPlacementMode() {
    console.log('[PLACEMENT STATE TRANSITION]', {
      from: placementState,
      to: PLACEMENT_STATES.IDLE,
      type: activePlacementType,
      interaction: placementInteraction,
    });

    placementState = PLACEMENT_STATES.IDLE;
    placementInteraction = PLACEMENT_INTERACTIONS.NONE;
    activePlacementType = null;
    dragStarted = false;
    movingDevId = null;
    pendingPlacementLocation = null;

    dragCandidateType = null;
    dragCandidateSpec = null;
    if (capturedElement && capturedPointerId !== null) {
      try {
        capturedElement.releasePointerCapture(capturedPointerId);
      } catch (err) {}
      capturedPointerId = null;
      capturedElement = null;
    }

    buildabilityOverlay.clearPreview();
    if (debugElements.panel) debugElements.panel.classList.add('hidden');
    if (infoCardElements.card) infoCardElements.card.classList.add('hidden');
    if (placementLegend) placementLegend.classList.add('hidden');
    if (placementBanner) placementBanner.classList.add('hidden');
  }

  function destroy() {
    cancelPlacementMode();
    if (screenHandler) {
      screenHandler.destroy();
      screenHandler = null;
    }
  }

  return {
    initScreenEvents,
    startPlacement,
    handleCardPointerDown,
    handleCardClick,
    handlePointerMove,
    handlePointerUp,
    setMovingId,
    cancelPlacementMode,
    destroy,
    getPendingLocation: () => (pendingPlacementLocation ? { ...pendingPlacementLocation } : null),
    getState: () => placementState,
    getInteraction: () => placementInteraction,
    getActiveType: () => activePlacementType,
    getMovingDevId: () => movingDevId,
  };
}
