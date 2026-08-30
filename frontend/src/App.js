import { Cartesian3 } from 'cesium';
import { createCesiumViewer } from './components/map/MapContainer.js';
import { BuildabilityOverlay } from './components/map/BuildabilityOverlay.js';
import { DevelopmentRenderer } from './components/map/DevelopmentRenderer.js';
import { setBuildingsVisible, setTrafficVisible } from './components/map/MapLayers.js';
import { DevelopmentStore, SUPPORTED_DEV_TYPES } from './state/devStore.js';
import { scenarioState } from './state/scenarioState.js';
import { renderPaletteCards } from './components/development/Palette.js';
import { renderDevelopmentList } from './components/development/DevelopmentList.js';
import { renderSimulationResults } from './components/simulation/SimulationResults.js';
import { createPlacementController } from './hooks/usePlacement.js';
import { runWhatIfSimulation } from './services/api/simulationApi.js';
import { validateBuildability } from './utils/buildabilityEngine.js';
import { createDevelopmentModel } from './types/development.js';
import { haversineDistanceMeters } from './utils/geoUtils.js';

/**
 * Dynamic City / Study Area Configuration
 */
export const CITY_CONFIG = {
  studyAreaName: 'District R3, New Administrative Capital',
  shortBadgeName: 'R3 • New Capital',
  referenceZoneId: 'Z0090',
  defaultCoordinatesText: '30.0154° N, 31.7366° E',
  centerLon: 31.7366,
  centerLat: 30.0154,
  cameraHeight: 1300,
};

export function initializeApp() {
  const devStore = new DevelopmentStore();
  let viewer = null;
  let buildabilityOverlay = null;
  let developmentRenderer = null;
  let placementController = null;
  let editingDevId = null;
  let currentView = 'map'; window.getScenarioState = () => scenarioState.getState();

  // DOM Elements — Header & Navigation
  const statusEl = document.getElementById('status-message');
  const statusDot = document.querySelector('.status-dot');
  const badgeAreaName = document.getElementById('badge-area-name');
  const btnHamburgerMenu = document.getElementById('btn-hamburger-menu');
  const hamburgerDropdown = document.getElementById('hamburger-dropdown');
  const menuResetCamera = document.getElementById('menu-reset-camera');
  const menuToggleDebug = document.getElementById('menu-toggle-debug');
  const menuToggleBuildable = document.getElementById('menu-toggle-buildable');
  const menuAbout = document.getElementById('menu-about');
  const menuToggleSidebar = document.getElementById('menu-toggle-sidebar');
  const sidebarToggle = document.getElementById('sidebar-toggle');
  const btnRestoreSidebar = document.getElementById('btn-restore-sidebar');

  function setSidebarCollapsed(collapsed) {
    const colLeft = document.querySelector('.sim-col-left');
    if (colLeft) {
      colLeft.classList.toggle('hidden', collapsed);
    }
    if (viewer) {
      setTimeout(() => viewer.resize(), 100);
    }
  }

  // DOM Elements — Left Column & Palette
  const btnAddDevTrigger = document.getElementById('btn-add-dev-trigger');
  const devPaletteContainer = document.getElementById('dev-palette-container');
  const btnClosePalette = document.getElementById('btn-close-palette');
  const devCardsContainer = document.querySelector('.dev-cards-grid');
  const devListItemsEl = document.getElementById('dev-list-items');
  const devCountEl = document.getElementById('dev-count');

  // Map Layers Checkboxes
  const layerBuildings = document.getElementById('layer-buildings');
  const layerTraffic = document.getElementById('layer-traffic');
  const layerDevAreas = document.getElementById('layer-dev-areas');
  const layerElectricity = document.getElementById('layer-electricity');

  // DOM Elements — Simulation & Results
  const simDevSelect = document.getElementById('sim-dev-select');
  const simulationHourSelectSim = document.getElementById('simulation-hour-select-sim');
  const btnRunSimulation = document.getElementById('btn-run-simulation');
  const btnSimText = document.getElementById('btn-sim-text');
  const simStatusBanner = document.getElementById('sim-status-banner');
  const compactResultContent = document.getElementById('compact-result-content');

  // Placement Pill Banner & Debug Panel
  const placementBanner = document.getElementById('placement-banner');
  const bannerText = document.getElementById('banner-text');
  const btnCancelPlacement = document.getElementById('btn-cancel-placement');

  // Modal Windows
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

  const aboutModal = document.getElementById('about-modal');
  const aboutModalClose = document.getElementById('about-modal-close');

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

  // Populate Dynamic City Configuration
  if (badgeAreaName) badgeAreaName.textContent = CITY_CONFIG.shortBadgeName;

  function updateStatus(msg, isComplete = false) {
    if (statusEl) statusEl.textContent = msg;
    if (isComplete && statusDot) {
      statusDot.classList.remove('pulsing');
    }
  }

  function switchView(viewName) {
    currentView = viewName;
    const navTabs = document.querySelectorAll('.nav-tab');
    navTabs.forEach((tab) => {
      if (tab.getAttribute('data-view') === viewName) {
        tab.classList.add('active');
      } else {
        tab.classList.remove('active');
      }
    });

    const colLeft = document.querySelector('.sim-col-left');
    const colRight = document.querySelector('.sim-col-right');

    if (viewName === 'map') {
      if (colLeft) colLeft.classList.add('hidden');
      if (colRight) colRight.classList.add('hidden');
      updateStatus('Switched to 3D Map View');
    } else {
      if (colLeft) colLeft.classList.remove('hidden');
      if (colRight) colRight.classList.remove('hidden');
      updateStatus(`Switched to ${viewName.toUpperCase()} View`);
    }

    if (viewer) {
      setTimeout(() => viewer.resize(), 100);
    }
  }

  function updateSimSelectDropdown() {
    if (!simDevSelect) return;
    const allDevs = devStore.getAllDevelopments();
    const currentSelectedId = scenarioState.getState().selectedDevIdForSim;

    simDevSelect.innerHTML = '<option value="">-- Select Placed Development --</option>';

    allDevs.forEach((dev) => {
      const opt = document.createElement('option');
      const dId = dev.id || dev.development_id;
      opt.value = dId;
      opt.textContent = `${dev.name || dId} (${dev.development_type.toUpperCase()}) — Zone ${dev.zone_id || CITY_CONFIG.referenceZoneId}`;
      if (opt.value === currentSelectedId) {
        opt.selected = true;
      }
      simDevSelect.appendChild(opt);
    });

    const hasSelection = !!(simDevSelect.value || scenarioState.getState().selectedDevIdForSim);
    if (btnRunSimulation) {
      btnRunSimulation.disabled = !hasSelection || scenarioState.getState().isSimulationRunning;
    }
  }

  function openModal(devRecord) {
    editingDevId = devRecord.isNew ? null : (devRecord.id || devRecord.development_id);
    const isNew = devRecord.isNew;
    const config = SUPPORTED_DEV_TYPES[devRecord.development_type] || SUPPORTED_DEV_TYPES.residential_compound;

    modalTitle.textContent = isNew ? `Configure ${config.label}` : `Edit ${devRecord.name}`;
    modalDevId.textContent = devRecord.id || devRecord.development_id;
    modalDevZone.textContent = `Zone: ${devRecord.zone_id || CITY_CONFIG.referenceZoneId}`;
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

  function refreshDevList() {
    renderDevelopmentList(devListItemsEl, devStore, {
      devCountEl,
      btnRunSimEl: btnRunSimulation,
      onSelect: (dev) => {
        const dId = dev.id || dev.development_id;
        scenarioState.setSelectedDevForSim(dId);
        updateSimSelectDropdown();
        if (viewer && typeof dev.longitude === 'number' && typeof dev.latitude === 'number' && !Number.isNaN(dev.longitude) && !Number.isNaN(dev.latitude)) {
          viewer.camera.flyTo({
            destination: Cartesian3.fromDegrees(dev.longitude, dev.latitude, 850),
            duration: 1.2,
          });
        }
      },
      onEdit: (dev) => openModal({ ...dev, isNew: false }),
      onMove: (dev) => {
        if (placementController) placementController.setMovingId(dev.id || dev.development_id);
        if (placementBanner) placementBanner.classList.remove('hidden');
        if (bannerText) bannerText.textContent = `REPOSITIONING ${dev.id || dev.development_id} — Click new location on 3D map`;
        updateStatus(`Moving ${dev.id || dev.development_id} — Click new 3D location`);
      },
      onDelete: (dev) => {
        const dId = dev.id || dev.development_id;
        devStore.deleteDevelopment(dId);
        developmentRenderer.removeDevelopment(dId);
        if (scenarioState.getState().selectedDevIdForSim === dId) {
          scenarioState.setSelectedDevForSim(null);
          scenarioState.setSimulationResult(null);
          renderSimulationResults(compactResultContent, null, devStore);
        }
        refreshDevList();
        updateStatus(`Deleted ${dev.name || dId}`);
      },
    });

    updateSimSelectDropdown();
  }

  async function handleTriggerSimulation(devRecord) {
    if (scenarioState.getState().isSimulationRunning) return;

    if (!devRecord.zone_id || devRecord.zone_id === 'unresolved') {
      updateStatus(`Simulation blocked: ${devRecord.name} is in an unresolved zone.`);
      return;
    }

    const devId = devRecord.id || devRecord.development_id;

    scenarioState.setSimulationRunning(true);
    if (btnRunSimulation) btnRunSimulation.disabled = true;
    if (btnSimText) btnSimText.textContent = 'RUNNING SIMULATION...';
    if (simStatusBanner) {
      simStatusBanner.className = 'sim-status-toast info';
      simStatusBanner.textContent = `Running What-If travel & electricity simulation for ${devRecord.name}...`;
      simStatusBanner.classList.remove('hidden');
    }

    updateStatus(`Running What-If simulation for ${devRecord.name}...`);

    try {
      const selectedHour = simulationHourSelectSim ? parseInt(simulationHourSelectSim.value || '8', 10) : 8;
      const result = await runWhatIfSimulation(devRecord, selectedHour);
      
      result.development_input = {
        ...result.development_input,
        development_id: devId,
        name: devRecord.name,
      };

      scenarioState.setSimulationResult(result);
      renderSimulationResults(compactResultContent, result, devStore);
      developmentRenderer.syncAll(devStore.getAllDevelopments());

      if (simStatusBanner) {
        simStatusBanner.className = 'sim-status-toast success';
        simStatusBanner.textContent = `✓ Simulation completed for ${devRecord.name}!`;
        setTimeout(() => simStatusBanner.classList.add('hidden'), 4000);
      }
      if (btnSimText) btnSimText.textContent = '✓ SIMULATION COMPLETE';

      updateStatus(`Simulation completed for ${devRecord.name}`, true);
    } catch (err) {
      if (simStatusBanner) {
        simStatusBanner.className = 'sim-status-toast error';
        simStatusBanner.textContent = `Simulation failed: ${err.message}`;
      }
      if (btnSimText) btnSimText.textContent = '⚡ RUN WHAT-IF SIMULATION';
      updateStatus(`Simulation failed: ${err.message}`);
    } finally {
      scenarioState.setSimulationRunning(false);
      if (btnRunSimulation) {
        btnRunSimulation.disabled = !scenarioState.getState().selectedDevIdForSim;
      }
    }
  }

  console.log('URBAN TWIN BUILD:', {
    branch: 'main',
    commit: '973b69f76bbd7cf5e4dcfd8c59263a1fc233f3ee',
    timestamp: new Date().toISOString(),
  });

  function handleConfirmProperties() {
    console.log('[CONFIRM CLICK]', {
      pendingPlacementLocation: placementController ? placementController.getPendingLocation() : null,
      editingDevId,
    });

    const pending = placementController ? placementController.getPendingLocation() : null;
    if (!pending && !editingDevId) {
      console.warn('[CONFIRM ABORTED]: Neither pending placement nor editingDevId found.');
      propertiesModal.classList.add('hidden');
      return;
    }

    const targetDevId = pending ? (pending.id || pending.development_id) : editingDevId;
    const existingRecord = editingDevId ? devStore.getDevelopment(editingDevId) : null;
    const devType = pending ? pending.development_type : (existingRecord?.development_type || 'hospital');
    const targetLat = pending ? pending.latitude : existingRecord.latitude;
    const targetLon = pending ? pending.longitude : existingRecord.longitude;
    const targetZoneId = pending ? pending.zone_id : existingRecord.zone_id;
    const targetTerrainHeight = pending ? (typeof pending.terrainHeight === 'number' ? pending.terrainHeight : 0) : (existingRecord ? (existingRecord.terrainHeight || 0) : 0);
    const config = SUPPORTED_DEV_TYPES[devType];

    let nameVal = devNameInput ? devNameInput.value.trim() : '';
    if (!nameVal) {
      nameVal = pending ? `${config.label} ${targetDevId}` : `Proposed ${config.label}`;
    }

    const simHour = parseInt((simulationHourSelect ? simulationHourSelect.value : '8') || '8', 10);
    const inputs = dynamicFieldsContainer ? dynamicFieldsContainer.querySelectorAll('.form-input') : [];
    const properties = {};

    inputs.forEach((inp) => {
      const key = inp.name;
      const numVal = parseFloat(inp.value);
      properties[key] = Number.isNaN(numVal) ? (config.propertyFields.find(f => f.key === key)?.default || 0) : numVal;
    });

    console.log('[CONFIRM INPUT]', {
      type: devType,
      latitude: targetLat,
      longitude: targetLon,
      terrainHeight: targetTerrainHeight,
      zone_id: targetZoneId,
      name: nameVal,
      properties,
    });

    const propValidation = devStore.validateProperties(devType, properties);
    if (!propValidation.valid) {
      console.warn('[CONFIRM FORM REJECTED]:', propValidation.error);
      if (formErrorAlert) {
        formErrorAlert.textContent = propValidation.error;
        formErrorAlert.classList.remove('hidden');
      }
      return;
    }

    let finalModel;
    try {
      finalModel = createDevelopmentModel({
        id: targetDevId,
        development_id: targetDevId,
        development_type: devType,
        name: nameVal,
        latitude: targetLat,
        longitude: targetLon,
        terrainHeight: targetTerrainHeight,
        zone_id: targetZoneId,
        properties,
        simulation_hour: simHour,
      });
    } catch (err) {
      console.error('[CONFIRM MODEL ERROR]', err);
      if (formErrorAlert) {
        formErrorAlert.textContent = `Model Creation Error: ${err.message}`;
        formErrorAlert.classList.remove('hidden');
      }
      return;
    }

    if (pending && pending.isNew) {
      const distErrorMeters = haversineDistanceMeters(pending.latitude, pending.longitude, finalModel.latitude, finalModel.longitude);
      console.log('[PLACEMENT LOCK]', {
        pickedLatitude: pending.latitude,
        pickedLongitude: pending.longitude,
        finalLatitude: finalModel.latitude,
        finalLongitude: finalModel.longitude,
        distErrorMeters,
      });

      if (distErrorMeters > 1.0) {
        const err = new Error(`PLACEMENT DISTANCE EXCEEDED LIMIT: ${distErrorMeters.toFixed(3)} meters`);
        console.error('[CONFIRM COORDINATE ERROR]', err);
        if (formErrorAlert) {
          formErrorAlert.textContent = err.message;
          formErrorAlert.classList.remove('hidden');
        }
        return;
      }
    }

    console.log('[FINAL MODEL]', {
      id: finalModel.id,
      development_type: finalModel.development_type,
      latitude: finalModel.latitude,
      longitude: finalModel.longitude,
      terrainHeight: finalModel.terrainHeight,
      zone_id: finalModel.zone_id,
      footprint: finalModel.footprint,
    });

    const existingDevs = devStore.getAllDevelopments().filter(d => d.id !== targetDevId && d.development_id !== targetDevId);
    const finalBuildability = validateBuildability(
      finalModel.latitude,
      finalModel.longitude,
      devType,
      existingDevs,
      properties,
      finalModel.buildingHeight
    );

    if (!finalBuildability.valid) {
      const msg = `Cannot confirm placement: Building footprint overlaps an existing ${finalBuildability.reason || finalBuildability.conflictType}.`;
      console.warn('[CONFIRM BUILDABILITY REJECTED]:', msg);
      if (formErrorAlert) {
        formErrorAlert.textContent = msg;
        formErrorAlert.classList.remove('hidden');
      }
      return;
    }

    const existsBeforeAdd = !!devStore.getDevelopment(targetDevId);
    console.log('[ID CHECK]', { id: targetDevId, existsBeforeAdd });

    let record;
    try {
      if (pending && pending.isNew) {
        record = devStore.addDevelopment(finalModel);
      } else if (editingDevId) {
        record = devStore.updateDevelopment(editingDevId, finalModel);
      }
    } catch (err) {
      console.error('[STORE ADD ERROR]', err);
      if (formErrorAlert) {
        formErrorAlert.textContent = `Store Error: ${err.message}`;
        formErrorAlert.classList.remove('hidden');
      }
      return;
    }

    const stored = devStore.getDevelopment(finalModel.id);
    console.log('[STORE VERIFY]', stored);

    if (!stored) {
      const err = new Error(`STORE CORRUPTION: ${finalModel.id} not found in devStore after commit.`);
      console.error('[STORE VERIFY ERROR]', err);
      if (formErrorAlert) {
        formErrorAlert.textContent = err.message;
        formErrorAlert.classList.remove('hidden');
      }
      return;
    }

    console.log('[STORE NOTIFY]', { devCount: devStore.getAllDevelopments().length });

    // 1. Render permanent entity
    developmentRenderer.syncAll(devStore.getAllDevelopments());

    const permanentEntity = viewer ? viewer.entities.getById(`development-${finalModel.id}`) : null;
    console.log('[PERMANENT ENTITY]', {
      id: `development-${finalModel.id}`,
      exists: !!permanentEntity,
      show: permanentEntity ? permanentEntity.show : false,
      position: permanentEntity && permanentEntity.position ? permanentEntity.position.getValue(viewer.clock.currentTime) : null,
    });

    scenarioState.setSelectedDevForSim(record.id);
    refreshDevList();
    updateStatus(`Confirmed ${record.name} in Zone ${record.zone_id || CITY_CONFIG.referenceZoneId}`, true);

    // 2. Clear preview and placement state ONLY after successful commit & rendering
    if (buildabilityOverlay) buildabilityOverlay.clearPreview();
    if (placementController) placementController.cancelPlacementMode();

    // 3. Hide Modal Window
    if (propertiesModal) propertiesModal.classList.add('hidden');
    editingDevId = null;
  }

  function refreshDevList() {
    const allDevs = devStore.getAllDevelopments();
    if (mapScenarioCount) {
      mapScenarioCount.textContent = `${allDevs.length} Development${allDevs.length === 1 ? '' : 's'}`;
    }

    renderDevelopmentList(devListItemsEl, devStore, {
      devCountEl,
      btnRunSimEl: btnRunSimulation,
      onSelect: (dev) => {
        const dId = dev.id || dev.development_id;
        scenarioState.setSelectedDevForSim(dId);
        updateSimSelectDropdown();
        if (viewer && typeof dev.longitude === 'number' && typeof dev.latitude === 'number' && !Number.isNaN(dev.longitude) && !Number.isNaN(dev.latitude)) {
          viewer.camera.flyTo({
            destination: Cartesian3.fromDegrees(dev.longitude, dev.latitude, 850),
            duration: 1.2,
          });
        }
      },
      onEdit: (dev) => openModal({ ...dev, isNew: false }),
      onMove: (dev) => {
        if (placementController) placementController.setMovingId(dev.id || dev.development_id);
        if (placementBanner) placementBanner.classList.remove('hidden');
        if (bannerText) bannerText.textContent = `REPOSITIONING ${dev.id || dev.development_id} — Click new location on 3D map`;
        updateStatus(`Moving ${dev.id || dev.development_id} — Click new 3D location`);
      },
      onDelete: (dev) => {
        const dId = dev.id || dev.development_id;
        devStore.deleteDevelopment(dId);
        developmentRenderer.removeDevelopment(dId);
        if (scenarioState.getState().selectedDevIdForSim === dId) {
          scenarioState.setSelectedDevForSim(null);
          scenarioState.setSimulationResult(null);
          renderSimulationResults(compactResultContent, null);
        }
        refreshDevList();
        updateStatus(`Deleted ${dev.name || dId}`);
      },
    });

    updateSimSelectDropdown();
  }

  async function handleTriggerSimulation(devRecord) {
    if (scenarioState.getState().isSimulationRunning) return;

    if (!devRecord.zone_id || devRecord.zone_id === 'unresolved') {
      updateStatus(`Simulation blocked: ${devRecord.name} is in an unresolved zone.`);
      return;
    }

    const devId = devRecord.id || devRecord.development_id;

    scenarioState.setSimulationRunning(true);
    if (btnRunSimulation) btnRunSimulation.disabled = true;
    if (btnSimText) btnSimText.textContent = 'RUNNING SIMULATION...';
    if (simStatusBanner) {
      simStatusBanner.className = 'sim-status-box info';
      simStatusBanner.textContent = `Running What-If travel demand model for ${devRecord.name}...`;
      simStatusBanner.classList.remove('hidden');
    }

    updateStatus(`Running What-If simulation for ${devRecord.name}...`);

    try {
      const selectedHour = simulationHourSelectSim ? parseInt(simulationHourSelectSim.value || '8', 10) : 8;
      const result = await runWhatIfSimulation(devRecord, selectedHour);
      
      // Enforce Canonical Development Identity in Result Output
      result.development_input = {
        ...result.development_input,
        development_id: devId,
        name: devRecord.name,
      };

      scenarioState.setSimulationResult(result);
      renderSimulationResults(compactResultContent, result);

      if (simStatusBanner) {
        simStatusBanner.className = 'sim-status-box success';
        simStatusBanner.textContent = `✓ Simulation completed for ${devRecord.name}!`;
      }
      if (btnSimText) btnSimText.textContent = '✓ SIMULATION COMPLETE';

      switchView('results');
      updateStatus(`Simulation completed for ${devRecord.name}`, true);
    } catch (err) {
      if (simStatusBanner) {
        simStatusBanner.className = 'sim-status-box error';
        simStatusBanner.textContent = `Simulation failed: ${err.message}`;
      }
      if (btnSimText) btnSimText.textContent = '⚡ RUN WHAT-IF SIMULATION';
      updateStatus(`Simulation failed: ${err.message}`);
    } finally {
      scenarioState.setSimulationRunning(false);
      if (btnRunSimulation) {
        btnRunSimulation.disabled = !scenarioState.getState().selectedDevIdForSim;
      }
    }
  }

  // ----------------------------------------------------
  // PHASE A: IMMMEDIATE DEFENSIVE UI INITIALIZATION
  // Registers all non-3D UI event handlers synchronously
  // so the application UI remains fully functional even if
  // 3D Cesium loading experiences an issue.
  // ----------------------------------------------------

  function safeRegister(fn, name) {
    try {
      fn();
    } catch (err) {
      console.warn(`[UI Init Safeguard] Failed during ${name}:`, err);
    }
  }

  // 1. Navigation & View Switcher UI
  safeRegister(() => {
    const navTabs = document.querySelectorAll('.nav-tab');
    navTabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        const targetView = tab.getAttribute('data-view');
        if (targetView) switchView(targetView);
      });
    });

    if (btnHamburgerMenu && hamburgerDropdown) {
      btnHamburgerMenu.addEventListener('click', (e) => {
        e.stopPropagation();
        hamburgerDropdown.classList.toggle('hidden');
      });

      document.addEventListener('click', () => {
        hamburgerDropdown.classList.add('hidden');
      });
    }

    if (menuToggleSidebar) {
      menuToggleSidebar.addEventListener('click', () => {
        const isCollapsed = document.querySelector('.sim-col-left')?.classList.contains('hidden');
        setSidebarCollapsed(!isCollapsed);
      });
    }

    if (menuResetCamera) {
      menuResetCamera.addEventListener('click', () => {
        if (viewer) {
          viewer.camera.flyTo({
            destination: Cartesian3.fromDegrees(CITY_CONFIG.centerLon, CITY_CONFIG.centerLat, CITY_CONFIG.cameraHeight),
            duration: 1.5,
          });
          updateStatus('Camera reset to default Study Area view.');
        }
      });
    }

    if (menuToggleDebug) {
      menuToggleDebug.addEventListener('click', () => {
        if (debugElements.panel) {
          debugElements.panel.classList.toggle('hidden');
        }
      });
    }

    if (menuToggleBuildable) {
      menuToggleBuildable.addEventListener('click', () => {
        if (buildabilityOverlay) {
          const isActive = buildabilityOverlay.toggleBuildableDebugOverlay();
          menuToggleBuildable.innerHTML = isActive
            ? '<span class="item-icon">🟩</span> Hide Buildable Areas'
            : '<span class="item-icon">🟩</span> Show Buildable Areas';
          updateStatus(isActive ? 'Visual Buildable Areas & Building Footprints Overlay Enabled' : 'Buildable Overlay Disabled');
        }
      });
    }

    if (menuAbout && aboutModal) {
      menuAbout.addEventListener('click', () => {
        aboutModal.classList.remove('hidden');
      });
    }

    if (aboutModalClose && aboutModal) {
      aboutModalClose.addEventListener('click', () => {
        aboutModal.classList.add('hidden');
      });
    }

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (placementController) placementController.cancelPlacementMode();
        if (placementBanner) placementBanner.classList.add('hidden');
        if (hamburgerDropdown) hamburgerDropdown.classList.add('hidden');
        if (aboutModal) aboutModal.classList.add('hidden');
      }
    });
  }, 'NavigationUI');

  // 2. Development Palette & List UI
  safeRegister(() => {
    if (btnAddDevTrigger && devPaletteContainer) {
      btnAddDevTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        devPaletteContainer.classList.toggle('hidden');
      });
    }

    if (btnClosePalette && devPaletteContainer) {
      btnClosePalette.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        devPaletteContainer.classList.add('hidden');
      });
    }

    if (devCardsContainer) {
      renderPaletteCards(devCardsContainer, {
        onCardPointerDown: (typeKey, spec, event) => {
          if (placementController) placementController.handleCardPointerDown(typeKey, spec, event);
        },
        onCardClick: (typeKey, spec) => {
          if (placementController) placementController.handleCardClick(typeKey, spec);
          if (devPaletteContainer) devPaletteContainer.classList.add('hidden');
          if (placementBanner) placementBanner.classList.remove('hidden');
          if (bannerText) bannerText.textContent = `📍 PLACING ${spec.label.toUpperCase()} — Move pointer over 3D map`;
        },
      });
    }

    devStore.subscribe(() => {
      if (developmentRenderer) developmentRenderer.syncAll(devStore.getAllDevelopments());
      refreshDevList();
    });

    refreshDevList();
  }, 'DevelopmentUI');

  // 3. Modal Form & Confirmation UI
  safeRegister(() => {
    if (modalClose) modalClose.addEventListener('click', closeModal);
    if (btnCancelProperties) btnCancelProperties.addEventListener('click', closeModal);

    let isSubmittingConfirm = false;
    const triggerSubmit = (e) => {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      if (isSubmittingConfirm) return;
      isSubmittingConfirm = true;
      try {
        handleConfirmProperties();
      } finally {
        isSubmittingConfirm = false;
      }
    };

    if (propertiesForm) propertiesForm.addEventListener('submit', triggerSubmit);
    if (btnConfirmProperties) btnConfirmProperties.addEventListener('click', triggerSubmit);

    if (btnCancelPlacement) {
      btnCancelPlacement.addEventListener('click', () => {
        if (placementController) placementController.cancelPlacementMode();
        if (placementBanner) placementBanner.classList.add('hidden');
      });
    }
  }, 'ModalUI');

  // 4. Map Layer Checkboxes & Scenario Selector UI
  safeRegister(() => {
    const scenarioSelector = document.getElementById('scenario-selector');
    if (scenarioSelector) {
      scenarioSelector.addEventListener('change', (e) => {
        const scenario = e.target.value;
        updateStatus(`Active Scenario: ${scenario}`);
      });
    }

    if (layerBuildings) {
      layerBuildings.addEventListener('change', (e) => {
        scenarioState.setMapLayerActive('buildings', e.target.checked);
        setBuildingsVisible(e.target.checked);
      });
    }

    if (layerTraffic) {
      layerTraffic.addEventListener('change', (e) => {
        scenarioState.setMapLayerActive('traffic', e.target.checked);
        setTrafficVisible(e.target.checked);
      });
    }

    if (layerDevAreas) {
      layerDevAreas.addEventListener('change', (e) => {
        scenarioState.setMapLayerActive('devAreas', e.target.checked);
        if (buildabilityOverlay) {
          buildabilityOverlay.toggleBuildableDebugOverlay(e.target.checked);
        }
      });
    }

    if (layerElectricity) {
      layerElectricity.addEventListener('change', (e) => {
        scenarioState.setMapLayerActive('electricity', e.target.checked);
        if (developmentRenderer) developmentRenderer.syncAll(devStore.getAllDevelopments());
      });
    }
  }, 'MapLayerUI');

  // 5. Simulation Control UI
  safeRegister(() => {
    if (simDevSelect) {
      simDevSelect.addEventListener('change', () => {
        const selectedId = simDevSelect.value;
        if (selectedId) {
          scenarioState.setSelectedDevForSim(selectedId);
          scenarioState.setSimulationResult(null);
          renderSimulationResults(compactResultContent, null, devStore);

          if (btnRunSimulation) btnRunSimulation.disabled = false;
          if (btnSimText) btnSimText.textContent = '⚡ RUN WHAT-IF SIMULATION';
          if (simStatusBanner) simStatusBanner.classList.add('hidden');

          const record = devStore.getDevelopment(selectedId);
          if (record && viewer && typeof record.longitude === 'number' && typeof record.latitude === 'number') {
            viewer.camera.flyTo({
              destination: Cartesian3.fromDegrees(record.longitude, record.latitude, 850),
              duration: 1.2,
            });
          }
        } else {
          scenarioState.setSelectedDevForSim(null);
          if (btnRunSimulation) btnRunSimulation.disabled = true;
        }
      });
    }

    if (btnRunSimulation) {
      btnRunSimulation.addEventListener('click', () => {
        const selectedId = (simDevSelect && simDevSelect.value) ? simDevSelect.value : scenarioState.getState().selectedDevIdForSim;
        if (selectedId) {
          scenarioState.setSelectedDevForSim(selectedId);
          const record = devStore.getDevelopment(selectedId);
          if (record) handleTriggerSimulation(record);
        }
      });
    }
  }, 'SimulationUI');

  // ----------------------------------------------------
  // PHASE B: ASYNCHRONOUS 3D CESIUM INITIALIZATION
  // Initializes Cesium 3D viewer, buildability overlays,
  // 3D building renderers, and mouse pointer listeners.
  // ----------------------------------------------------

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
      infoCardElements,
      placementLegend,
      placementBanner,
      bannerText,
      SUPPORTED_DEV_TYPES,
    });

    placementController.initScreenEvents();

    window.addEventListener('pointermove', (e) => {
      if (placementController) placementController.handlePointerMove(e);
    });

    window.addEventListener('pointerup', (e) => {
      if (placementController) {
        placementController.handlePointerUp(e);
        const state = placementController.getState();
        if (state === 'IDLE' && placementBanner) {
          placementBanner.classList.add('hidden');
        }
      }
    });

    developmentRenderer.syncAll(devStore.getAllDevelopments());
  }).catch((err) => {
    console.error('[App Init Error]:', err);
    updateStatus('Failed to load 3D Digital Twin environment.');
  });
}
