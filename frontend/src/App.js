import { Cartesian3 } from 'cesium';
import { createCesiumViewer } from './components/map/MapContainer.js';
import { BuildabilityOverlay } from './components/map/BuildabilityOverlay.js';
import { DevelopmentRenderer } from './components/map/DevelopmentRenderer.js';
import { DevelopmentStore, SUPPORTED_DEV_TYPES } from './state/devStore.js';
import { scenarioState } from './state/scenarioState.js';
import { renderPaletteCards } from './components/development/Palette.js';
import { renderDevelopmentList } from './components/development/DevelopmentList.js';
import { renderSimulationResults } from './components/simulation/SimulationResults.js';
import { createPlacementController } from './hooks/usePlacement.js';
import { runWhatIfSimulation } from './services/api/simulationApi.js';
import { validateBuildability } from './utils/buildabilityEngine.js';
import { createDevelopmentModel } from './types/development.js';

export function initializeApp() {
  const devStore = new DevelopmentStore();
  let viewer = null;
  let buildabilityOverlay = null;
  let developmentRenderer = null;
  let placementController = null;
  let editingDevId = null;

  // DOM Elements
  const statusEl = document.getElementById('status-message');
  const statusDot = document.querySelector('.status-dot');
  const sidebar = document.getElementById('sidebar-dashboard');
  const sidebarToggle = document.getElementById('sidebar-toggle');
  const devCardsContainer = document.querySelector('.dev-cards-grid');
  const devListItemsEl = document.getElementById('dev-list-items');
  const devCountEl = document.getElementById('dev-count');
  const btnSidebarRunSim = document.getElementById('btn-sidebar-run-sim');
  const sectionResults = document.getElementById('section-results');
  const compactResultContent = document.getElementById('compact-result-content');
  const placementBanner = document.getElementById('placement-banner');
  const bannerText = document.getElementById('banner-text');
  const btnCancelPlacement = document.getElementById('btn-cancel-placement');
  const dragGhost = document.getElementById('drag-ghost-preview');
  const ghostTitle = document.getElementById('ghost-title');
  const ghostSub = document.getElementById('ghost-sub');

  // Modal Elements
  const propertiesModal = document.getElementById('properties-modal');
  const modalTitle = document.getElementById('modal-title');
  const modalClose = document.getElementById('modal-close');
  const modalDevId = document.getElementById('modal-dev-id');
  const modalDevZone = document.getElementById('modal-dev-zone');
  const modalDevCoords = document.getElementById('modal-dev-coords');
  const propertiesForm = document.getElementById('properties-form');
  const devNameInput = document.getElementById('dev-name-input');
  const simulationHourSelect = document.getElementById('simulation-hour-select');
  const dynamicFieldsContainer = document.getElementById('dynamic-fields-container');
  const formErrorAlert = document.getElementById('form-error-alert');
  const btnCancelProperties = document.getElementById('btn-cancel-properties');
  const btnConfirmProperties = document.getElementById('btn-confirm-properties');

  // Debug Panel Elements
  const debugElements = {
    panel: document.getElementById('placement-debug-panel'),
    devType: document.getElementById('debug-dev-type'),
    devId: document.getElementById('debug-dev-id'),
    footprint: document.getElementById('debug-footprint'),
    lat: document.getElementById('debug-lat'),
    lon: document.getElementById('debug-lon'),
    zone: document.getElementById('debug-zone'),
    status: document.getElementById('debug-entity-status'),
  };

  function updateStatus(msg, isComplete = false) {
    if (statusEl) statusEl.textContent = msg;
    if (isComplete && statusDot) {
      statusDot.classList.remove('pulsing');
      statusDot.classList.add('success');
    }
  }

  function openModal(devRecord) {
    editingDevId = devRecord.isNew ? null : (devRecord.id || devRecord.development_id);
    const isNew = devRecord.isNew;
    const config = SUPPORTED_DEV_TYPES[devRecord.development_type] || SUPPORTED_DEV_TYPES.residential_compound;

    modalTitle.textContent = isNew ? `Configure ${config.label}` : `Edit ${devRecord.name}`;
    modalDevId.textContent = devRecord.id || devRecord.development_id;
    modalDevZone.textContent = `Zone: ${devRecord.zone_id || 'unresolved'}`;
    modalDevCoords.textContent = `${devRecord.latitude.toFixed(4)}° N, ${devRecord.longitude.toFixed(4)}° E`;

    devNameInput.value = devRecord.name || `${config.label} ${devRecord.id || devRecord.development_id}`;
    simulationHourSelect.value = devRecord.simulation_hour || '8';

    dynamicFieldsContainer.innerHTML = '';
    config.propertyFields.forEach((field) => {
      const val = devRecord.properties && devRecord.properties[field.key] !== undefined
        ? devRecord.properties[field.key]
        : field.default;

      const group = document.createElement('div');
      group.className = 'form-group';

      const label = document.createElement('label');
      label.textContent = field.label + (field.required ? ' *' : '');

      const input = document.createElement('input');
      input.type = field.type;
      input.name = field.key;
      input.className = 'form-input';
      input.value = val;
      input.min = '0';

      group.appendChild(label);
      group.appendChild(input);
      dynamicFieldsContainer.appendChild(group);
    });

    formErrorAlert.classList.add('hidden');
    formErrorAlert.textContent = '';
    propertiesModal.classList.remove('hidden');
  }

  function closeModal() {
    propertiesModal.classList.add('hidden');
    const pending = placementController ? placementController.getPendingLocation() : null;
    if (pending && pending.isNew && placementController) {
      placementController.cancelPlacementMode();
    }
    editingDevId = null;
  }

  function handleConfirmProperties() {
    const pending = placementController ? placementController.getPendingLocation() : null;
    if (!pending && !editingDevId) {
      propertiesModal.classList.add('hidden');
      return;
    }

    const targetDevId = pending ? (pending.id || pending.development_id) : editingDevId;
    const existingRecord = editingDevId ? devStore.getDevelopment(editingDevId) : null;
    const devType = pending ? pending.development_type : (existingRecord?.development_type || 'hospital');
    const targetLat = pending ? pending.latitude : existingRecord.latitude;
    const targetLon = pending ? pending.longitude : existingRecord.longitude;
    const targetZoneId = pending ? pending.zone_id : existingRecord.zone_id;
    const config = SUPPORTED_DEV_TYPES[devType];

    let nameVal = devNameInput.value ? devNameInput.value.trim() : '';
    if (!nameVal) {
      nameVal = pending ? `${config.label} ${targetDevId}` : `Proposed ${config.label}`;
    }

    const simHour = parseInt(simulationHourSelect.value || '8', 10);
    const inputs = dynamicFieldsContainer.querySelectorAll('.form-input');
    const properties = {};

    inputs.forEach((inp) => {
      const key = inp.name;
      const numVal = parseFloat(inp.value);
      properties[key] = Number.isNaN(numVal) ? (config.propertyFields.find(f => f.key === key)?.default || 0) : numVal;
    });

    const propValidation = devStore.validateProperties(devType, properties);
    if (!propValidation.valid) {
      formErrorAlert.textContent = propValidation.error;
      formErrorAlert.classList.remove('hidden');
      return;
    }

    // Perform final buildability re-validation using the FINAL properties and dimensions
    const existingDevs = devStore.getAllDevelopments().filter(d => d.id !== targetDevId && d.development_id !== targetDevId);
    const finalModel = createDevelopmentModel({
      id: targetDevId,
      development_type: devType,
      name: nameVal,
      latitude: targetLat,
      longitude: targetLon,
      zone_id: targetZoneId,
      properties,
      simulation_hour: simHour,
    });

    const finalBuildability = validateBuildability(
      finalModel.latitude,
      finalModel.longitude,
      devType,
      existingDevs,
      properties,
      finalModel.buildingHeight
    );

    if (!finalBuildability.valid) {
      formErrorAlert.textContent = `Cannot confirm placement: Building footprint overlaps an existing ${finalBuildability.reason || finalBuildability.conflictType}.`;
      formErrorAlert.classList.remove('hidden');
      return;
    }

    let record;
    if (pending && pending.isNew) {
      record = devStore.addDevelopment(finalModel);
    } else if (editingDevId) {
      record = devStore.updateDevelopment(editingDevId, finalModel);
    }

    if (record) {
      developmentRenderer.renderDevelopment(record);
      scenarioState.setSelectedDevForSim(record.id);
      refreshDevList();
      updateStatus(`Confirmed ${record.name} in Zone ${record.zone_id || 'unresolved'}`, true);
    }

    propertiesModal.classList.add('hidden');
    editingDevId = null;
    if (placementController) placementController.cancelPlacementMode();
  }

  function refreshDevList() {
    renderDevelopmentList(devListItemsEl, devStore, {
      devCountEl,
      btnRunSimEl: btnSidebarRunSim,
      onSelect: (dev) => {
        scenarioState.setSelectedDevForSim(dev.id);
        if (viewer) {
          viewer.camera.flyTo({
            destination: Cartesian3.fromDegrees(dev.longitude, dev.latitude, 850),
            duration: 1.2,
          });
        }
      },
      onEdit: (dev) => openModal({ ...dev, isNew: false }),
      onMove: (dev) => {
        if (placementController) placementController.setMovingId(dev.id);
        if (placementBanner) placementBanner.classList.remove('hidden');
        if (bannerText) bannerText.textContent = `Repositioning ${dev.id}... Click new location on 3D map`;
        updateStatus(`Moving ${dev.id} — Click new 3D location`);
      },
      onDelete: (dev) => {
        devStore.deleteDevelopment(dev.id);
        developmentRenderer.removeDevelopment(dev.id);
        if (scenarioState.getState().selectedDevIdForSim === dev.id) {
          scenarioState.setSelectedDevForSim(null);
        }
        refreshDevList();
        updateStatus(`Deleted ${dev.id}`);
      },
    });
  }

  async function handleTriggerSimulation(devRecord) {
    if (scenarioState.getState().isSimulationRunning) return;

    if (!devRecord.zone_id || devRecord.zone_id === 'unresolved') {
      updateStatus(`Simulation blocked: ${devRecord.name} is in an unresolved zone.`);
      return;
    }

    scenarioState.setSimulationRunning(true);
    updateStatus(`Running What-If simulation for ${devRecord.name}...`);
    btnSidebarRunSim.disabled = true;

    try {
      const result = await runWhatIfSimulation(devRecord, devRecord.simulation_hour || 8);
      scenarioState.setSimulationResult(result);
      renderSimulationResults(compactResultContent, result);
      if (sectionResults) sectionResults.classList.remove('hidden');
      updateStatus(`Simulation completed for ${devRecord.name}`, true);
    } catch (err) {
      updateStatus(`Simulation failed: ${err.message}`);
    } finally {
      scenarioState.setSimulationRunning(false);
      btnSidebarRunSim.disabled = false;
    }
  }

  // Initialize Cesium 3D Viewer & Controllers
  createCesiumViewer('cesiumContainer', updateStatus).then((v) => {
    viewer = v;
    window.cesiumViewer = viewer;

    buildabilityOverlay = new BuildabilityOverlay(viewer);
    developmentRenderer = new DevelopmentRenderer(viewer);

    placementController = createPlacementController(viewer, {
      devStore,
      buildabilityOverlay,
      developmentRenderer,
      onOpenPropertiesModal: openModal,
      onStatusUpdate: updateStatus,
      debugElements,
    });

    placementController.initScreenEvents();

    renderPaletteCards(devCardsContainer, (typeKey, spec, event) => {
      placementController.startPlacement(typeKey, spec, event);
      if (placementBanner) placementBanner.classList.remove('hidden');
      if (bannerText) bannerText.textContent = `Placing ${spec.label}: Click or move over 3D map to place`;
      if (dragGhost) {
        ghostTitle.textContent = spec.label;
        ghostSub.textContent = 'Move over 3D map';
        dragGhost.style.left = `${event.clientX}px`;
        dragGhost.style.top = `${event.clientY}px`;
        dragGhost.classList.remove('hidden');
      }
    });

    window.addEventListener('pointermove', (e) => {
      if (dragGhost && !dragGhost.classList.contains('hidden')) {
        dragGhost.style.left = `${e.clientX}px`;
        dragGhost.style.top = `${e.clientY}px`;
      }
      if (placementController) placementController.handlePointerMove(e);
    });

    window.addEventListener('pointerup', (e) => {
      if (dragGhost) dragGhost.classList.add('hidden');
      if (placementBanner) placementBanner.classList.add('hidden');
      if (placementController) placementController.handlePointerUp(e);
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && placementController) {
        placementController.cancelPlacementMode();
        if (placementBanner) placementBanner.classList.add('hidden');
        if (dragGhost) dragGhost.classList.add('hidden');
      }
    });

    if (sidebarToggle) {
      sidebarToggle.addEventListener('click', () => {
        if (sidebar) sidebar.classList.toggle('collapsed');
        setTimeout(() => viewer.resize(), 300);
      });
    }

    if (btnCancelPlacement) {
      btnCancelPlacement.addEventListener('click', () => {
        if (placementController) placementController.cancelPlacementMode();
      });
    }

    if (modalClose) modalClose.addEventListener('click', closeModal);
    if (btnCancelProperties) btnCancelProperties.addEventListener('click', closeModal);

    const triggerSubmit = (e) => {
      if (e) e.preventDefault();
      handleConfirmProperties();
    };

    if (propertiesForm) propertiesForm.addEventListener('submit', triggerSubmit);
    if (btnConfirmProperties) btnConfirmProperties.addEventListener('click', triggerSubmit);

    if (btnSidebarRunSim) {
      btnSidebarRunSim.addEventListener('click', () => {
        const simDevId = scenarioState.getState().selectedDevIdForSim;
        if (simDevId) {
          const record = devStore.getDevelopment(simDevId);
          if (record) handleTriggerSimulation(record);
        }
      });
    }

    devStore.subscribe(() => {
      developmentRenderer.syncAll(devStore.getAllDevelopments());
      refreshDevList();
    });

    refreshDevList();
  }).catch((err) => {
    console.error('[App Init Error]:', err);
    updateStatus('Failed to load 3D Digital Twin environment.');
  });
}
