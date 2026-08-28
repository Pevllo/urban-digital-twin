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
  let currentView = 'map';

  // DOM Elements — Header & Navigation
  const statusEl = document.getElementById('status-message');
  const statusDot = document.querySelector('.status-dot');
  const badgeAreaName = document.getElementById('badge-area-name');
  const btnHamburgerMenu = document.getElementById('btn-hamburger-menu');
  const hamburgerDropdown = document.getElementById('hamburger-dropdown');
  const menuToggleSidebar = document.getElementById('menu-toggle-sidebar');
  const menuResetCamera = document.getElementById('menu-reset-camera');
  const menuToggleDebug = document.getElementById('menu-toggle-debug');
  const menuToggleBuildable = document.getElementById('menu-toggle-buildable');
  const menuAbout = document.getElementById('menu-about');

  // DOM Elements — Sidebar & Panels
  const sidebar = document.getElementById('sidebar-dashboard');
  const sidebarToggle = document.getElementById('sidebar-toggle');
  const btnRestoreSidebar = document.getElementById('btn-restore-sidebar');
  const sidebarPanelTitle = document.getElementById('sidebar-panel-title');
  const studyAreaTitle = document.getElementById('study-area-title');
  const studyAreaZone = document.getElementById('study-area-zone');
  const studyAreaCoords = document.getElementById('study-area-coords');
  const mapScenarioCount = document.getElementById('map-scenario-count');
  const devCardsContainer = document.querySelector('.dev-cards-grid');
  const devListItemsEl = document.getElementById('dev-list-items');
  const devCountEl = document.getElementById('dev-count');
  const btnGotoAddDev = document.getElementById('btn-goto-add-dev');
  const btnGotoDevelopments = document.getElementById('btn-goto-developments');

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
  if (studyAreaTitle) studyAreaTitle.textContent = CITY_CONFIG.studyAreaName;
  if (studyAreaZone) studyAreaZone.textContent = CITY_CONFIG.referenceZoneId;
  if (studyAreaCoords) studyAreaCoords.textContent = CITY_CONFIG.defaultCoordinatesText;

  function updateStatus(msg, isComplete = false) {
    if (statusEl) statusEl.textContent = msg;
    if (isComplete && statusDot) {
      statusDot.classList.remove('pulsing');
    }
  }

  function setSidebarCollapsed(collapsed) {
    if (!sidebar) return;
    sidebar.classList.toggle('collapsed', collapsed);
    if (btnRestoreSidebar) {
      btnRestoreSidebar.classList.toggle('hidden', !collapsed);
    }
    if (menuToggleSidebar) {
      menuToggleSidebar.innerHTML = collapsed
        ? '<span class="item-icon">📐</span> Open Sidebar'
        : '<span class="item-icon">📐</span> Collapse Sidebar';
    }
    if (viewer) {
      setTimeout(() => viewer.resize(), 250);
    }
  }

  function switchView(viewName) {
    currentView = viewName;

    // 1. Update Navigation Tabs Active Class
    const navTabs = document.querySelectorAll('.nav-tab');
    navTabs.forEach((tab) => {
      if (tab.getAttribute('data-view') === viewName) {
        tab.classList.add('active');
      } else {
        tab.classList.remove('active');
      }
    });

    // 2. Hide all panels and display target view panel
    const panels = {
      map: document.getElementById('panel-map'),
      developments: document.getElementById('panel-developments'),
      simulation: document.getElementById('panel-simulation'),
      results: document.getElementById('panel-results'),
    };

    const panelTitles = {
      map: 'Map Overview',
      developments: 'Scenario Developments',
      simulation: 'What-If Simulation',
      results: 'Mobility Impact Results',
    };

    Object.keys(panels).forEach((pKey) => {
      if (panels[pKey]) {
        if (pKey === viewName) {
          panels[pKey].classList.remove('hidden');
        } else {
          panels[pKey].classList.add('hidden');
        }
      }
    });

    if (sidebarPanelTitle) sidebarPanelTitle.textContent = panelTitles[viewName] || 'Digital Twin';

    // 3. Ensure Sidebar is expanded when interacting with views
    setSidebarCollapsed(false);
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

  console.log('URBAN TWIN BUILD:', {
    branch: 'main',
    commit: '973b69f76bbd7cf5e4dcfd8c59263a1fc233f3ee',
    timestamp: new Date().toISOString(),
  });

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

    // Perform final buildability re-validation against LOCKED coordinates
    const existingDevs = devStore.getAllDevelopments().filter(d => d.id !== targetDevId && d.development_id !== targetDevId);
    const finalModel = createDevelopmentModel({
      id: targetDevId,
      development_id: targetDevId,
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
      updateStatus(`Confirmed ${record.name} in Zone ${record.zone_id || CITY_CONFIG.referenceZoneId}`, true);
    }

    propertiesModal.classList.add('hidden');
    editingDevId = null;
    if (placementController) placementController.cancelPlacementMode();

    const previewEntity = buildabilityOverlay ? buildabilityOverlay.getPreviewEntity() : null;
    const permanentEntity = developmentRenderer ? developmentRenderer.entitiesMap.get(targetDevId) : null;

    console.log('[PLACEMENT AFTER CONFIRM]', {
      state: placementController ? placementController.getState() : null,
      activePlacementType: placementController ? placementController.getActiveType() : null,
      pendingPlacementLocation: placementController ? placementController.getPendingLocation() : null,
      movingDevId: placementController ? placementController.getMovingDevId() : null,
      previewEntity: previewEntity ? { id: previewEntity.id } : null,
      permanentEntity: permanentEntity ? { id: permanentEntity.id } : null,
    });

    console.log('[PLACEMENT ENTITY CHECK]', {
      previewEntity: previewEntity ? { id: previewEntity.id } : null,
      permanentEntity: permanentEntity ? { id: permanentEntity.id } : null,
      sameObject: previewEntity === permanentEntity,
    });
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

    // 1. Navigation Tab View Switcher
    const navTabs = document.querySelectorAll('.nav-tab');
    navTabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        const targetView = tab.getAttribute('data-view');
        if (targetView) switchView(targetView);
      });
    });

    // 2. Hamburger Dropdown Menu Handlers
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
        const isCollapsed = sidebar ? sidebar.classList.contains('collapsed') : false;
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

    // 3. Quick Action Navigation Buttons inside View Panels
    if (btnGotoAddDev) {
      btnGotoAddDev.addEventListener('click', () => {
        switchView('map');
      });
    }

    if (btnGotoDevelopments) {
      btnGotoDevelopments.addEventListener('click', () => {
        switchView('developments');
      });
    }

    if (simDevSelect) {
      simDevSelect.addEventListener('change', () => {
        const selectedId = simDevSelect.value;
        if (selectedId) {
          scenarioState.setSelectedDevForSim(selectedId);
          // Clear stale result from previous development
          scenarioState.setSimulationResult(null);
          renderSimulationResults(compactResultContent, null);

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

    // 4. Render Development Palette Cards
    renderPaletteCards(devCardsContainer, (typeKey, spec, event) => {
      placementController.startPlacement(typeKey, spec, event);
      if (placementBanner) placementBanner.classList.remove('hidden');
      if (bannerText) bannerText.textContent = `📍 PLACING ${spec.label.toUpperCase()} — Move pointer over 3D map`;
    });

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

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (placementController) placementController.cancelPlacementMode();
        if (placementBanner) placementBanner.classList.add('hidden');
        if (hamburgerDropdown) hamburgerDropdown.classList.add('hidden');
        if (aboutModal) aboutModal.classList.add('hidden');
      }
    });

    if (sidebarToggle) {
      sidebarToggle.addEventListener('click', () => {
        setSidebarCollapsed(true);
      });
    }

    if (btnRestoreSidebar) {
      btnRestoreSidebar.addEventListener('click', () => {
        setSidebarCollapsed(false);
      });
    }

    if (btnCancelPlacement) {
      btnCancelPlacement.addEventListener('click', () => {
        if (placementController) placementController.cancelPlacementMode();
        if (placementBanner) placementBanner.classList.add('hidden');
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
