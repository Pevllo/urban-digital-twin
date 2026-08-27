import './style.css';
import {
  Ion,
  Viewer,
  ImageryLayer,
  createOsmBuildingsAsync,
  createWorldImageryAsync,
  Cartesian3,
  Cartesian2,
  Math as CesiumMath,
  Terrain,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  Cartographic,
  Color,
  HeightReference,
  VerticalOrigin,
  Cesium3DTileStyle,
  PolylineGlowMaterialProperty,
} from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';

import { resolveNearestZone } from './geo/zoneResolver.js';
import { DevelopmentStore, SUPPORTED_DEV_TYPES } from './devStore.js';
import { runWhatIfSimulation } from './simulationService.js';
import { PHYSICAL_DEV_SPECS, validatePlacementCollision } from './geo/physicalDevelopment.js';
import spatialData from './geo/spatialFeatures.json';

// Instantiate Development State Store
const devStore = new DevelopmentStore();

// App Interaction State
let activePlacementType = null;
let isDraggingFromSidebar = false;
let movingDevId = null;
let editingDevId = null;
let pendingPlacementLocation = null;

let isSimulationRunning = false;
let selectedDevIdForSim = null;

// Cesium 3D Viewer & Tracking
let mainViewer = null;
let previewEntity = null;
const devEntities = new Map();

// DOM References
const statusEl = document.getElementById('status-message');
const statusDot = document.querySelector('.status-dot');
const sidebar = document.getElementById('sidebar-dashboard');
const sidebarToggle = document.getElementById('sidebar-toggle');

const placementBanner = document.getElementById('placement-banner');
const bannerText = document.getElementById('banner-text');
const btnCancelPlacement = document.getElementById('btn-cancel-placement');

const dragGhost = document.getElementById('drag-ghost-preview');
const ghostIcon = document.getElementById('ghost-icon');
const ghostTitle = document.getElementById('ghost-title');
const ghostSub = document.getElementById('ghost-sub');

const devCountEl = document.getElementById('dev-count');
const devListItemsEl = document.getElementById('dev-list-items');
const btnSidebarRunSim = document.getElementById('btn-sidebar-run-sim');

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

const sectionResults = document.getElementById('section-results');
const compactResultContent = document.getElementById('compact-result-content');

function updateStatus(msg, isComplete = false) {
  if (statusEl) statusEl.textContent = msg;
  if (isComplete && statusDot) {
    statusDot.classList.remove('pulsing');
    statusDot.classList.add('success');
  }
}

/**
 * Robust Geographic 3D Picking Helper.
 */
function pickGeographicLocation(viewer, clientX, clientY, devType, excludeDevId = null) {
  const targetViewer = viewer || mainViewer || window.cesiumViewer;
  if (!targetViewer || !targetViewer.scene) return null;

  const canvas = targetViewer.scene.canvas;
  if (!canvas) return null;

  const rect = canvas.getBoundingClientRect();

  if (
    clientX < rect.left ||
    clientX > rect.right ||
    clientY < rect.top ||
    clientY > rect.bottom
  ) {
    return null;
  }

  const windowPosition = new Cartesian2(clientX - rect.left, clientY - rect.top);

  // 1. Pick 3D OSM Building / Tileset surface
  let cartesian = targetViewer.scene.pickPosition(windowPosition);

  // 2. Fallback: Globe raycast picking with terrain depth
  if (!cartesian && targetViewer.scene.globe) {
    const ray = targetViewer.camera.getPickRay(windowPosition);
    if (ray) {
      cartesian = targetViewer.scene.globe.pick(ray, targetViewer.scene);
    }
  }

  // 3. Fallback: Ellipsoid surface picking
  if (!cartesian && targetViewer.scene.globe) {
    cartesian = targetViewer.camera.pickEllipsoid(windowPosition, targetViewer.scene.globe.ellipsoid);
  }

  if (!cartesian) return null;

  const cartographic = Cartographic.fromCartesian(cartesian);
  if (!cartographic) return null;

  const lon = CesiumMath.toDegrees(cartographic.longitude);
  const lat = CesiumMath.toDegrees(cartographic.latitude);

  if (Number.isNaN(lat) || Number.isNaN(lon)) return null;

  const resolved = resolveNearestZone(lat, lon);
  const existingDevs = devStore.getAllDevelopments().filter((d) => d.development_id !== excludeDevId);
  const collision = validatePlacementCollision(lat, lon, devType, existingDevs);

  return {
    latitude: lat,
    longitude: lon,
    zone_id: resolved.zone_id,
    distance_km: resolved.distance_km,
    cartesian,
    collision,
  };
}

async function initCesiumViewer() {
  try {
    const token = import.meta.env.VITE_CESIUM_ION_TOKEN || import.meta.env.CESIUM_ION_TOKEN;
    if (!token || token.trim() === '' || token.includes('your_token_here')) {
      updateStatus('Cesium ion access token missing');
      return;
    }

    Ion.defaultAccessToken = token.trim();
    updateStatus('Initializing Stylized Digital Twin Environment...');

    let baseLayer = false;
    try {
      const provider = await createWorldImageryAsync();
      if (provider) {
        baseLayer = new ImageryLayer(provider);
      }
    } catch (e) {
      console.warn('World imagery loading fallback:', e);
      baseLayer = false;
    }

    // Create Viewer with Seamless Base Layer & High-Performance GPU Acceleration
    const viewer = new Viewer('cesiumContainer', {
      terrain: Terrain.fromWorldTerrain(),
      baseLayer: baseLayer,
      animation: false,
      timeline: false,
      baseLayerPicker: false,
      fullscreenButton: false,
      geocoder: false,
      homeButton: true,
      infoBox: false,
      sceneModePicker: false,
      selectionIndicator: true,
      navigationHelpButton: false,
      scene3DOnly: true,
      contextOptions: {
        requestWebgl2: true,
        webgl: {
          powerPreference: 'high-performance',
          failIfMajorPerformanceCaveat: false,
          preserveDrawingBuffer: true,
          alpha: false,
          antialias: true,
        },
      },
    });

    mainViewer = viewer;
    window.cesiumViewer = viewer;

    if (viewer.cesiumWidget && viewer.cesiumWidget.creditContainer) {
      viewer.cesiumWidget.creditContainer.style.display = 'none';
    }

    // Enable Anti-Aliasing on Dedicated GPU
    viewer.scene.fxaa = true;

    // Configure Stylized Scene Appearance (Isometric Digital Twin aesthetic)
    viewer.scene.globe.baseColor = Color.fromCssColorString('#0f172a');
    viewer.scene.globe.showAtmosphere = false;
    viewer.scene.globe.enableLighting = false;

    updateStatus('Loading Low-Poly 3D OSM Building Architecture...');

    // Load and Style OSM 3D Buildings into Low-Poly Neutral Slate Volumes
    const osmBuildings = await createOsmBuildingsAsync();
    osmBuildings.style = new Cesium3DTileStyle({
      color: {
        conditions: [
          ['${feature["building"]} === "hospital"', 'color("#f87171", 0.9)'],
          ['${feature["building"]} === "residential"', 'color("#60a5fa", 0.85)'],
          ['${feature["building"]} === "commercial"', 'color("#c084fc", 0.85)'],
          ['true', 'color("#334155", 0.9)'], // Stylized neutral slate for existing buildings
        ],
      },
    });
    viewer.scene.primitives.add(osmBuildings);

    // Render Stylized 3D Road Network Layer from spatial features
    renderStylizedRoadNetwork(viewer);

    // Initial Camera Position: Isometric View over District R3 (Zone Z0090)
    const targetLon = 31.7366;
    const targetLat = 30.0154;

    viewer.camera.setView({
      destination: Cartesian3.fromDegrees(targetLon, targetLat, 1300),
      orientation: {
        heading: CesiumMath.toRadians(12.0),
        pitch: CesiumMath.toRadians(-38.0), // Isometric high-angle tilt
        roll: 0.0,
      },
    });

    updateStatus('Ready — Stylized Digital Twin active. Drag or click a land-use card onto map', true);

    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);

    handler.setInputAction((click) => {
      if (movingDevId) {
        const type = devStore.getDevelopment(movingDevId)?.development_type || 'hospital';
        const picked = pickGeographicLocation(viewer, click.position.x, click.position.y, type, movingDevId);

        if (picked) {
          const updated = devStore.moveDevelopment(movingDevId, picked.latitude, picked.longitude, picked.zone_id);
          renderDevelopmentEntity(viewer, updated);
          updateStatus(`Moved ${updated.development_id} to Zone ${picked.zone_id}`);
          cancelPlacementMode();
          renderDevelopmentsList();
        }
        return;
      }

      if (activePlacementType && !isDraggingFromSidebar) {
        const picked = pickGeographicLocation(viewer, click.position.x, click.position.y, activePlacementType);
        if (picked) {
          const tempId = devStore.generateId();
          const devType = activePlacementType;

          pendingPlacementLocation = {
            development_id: tempId,
            development_type: devType,
            latitude: picked.latitude,
            longitude: picked.longitude,
            zone_id: picked.zone_id,
            isNew: true,
          };

          openPropertiesModal(pendingPlacementLocation);
          activePlacementType = null;
          placementBanner.classList.add('hidden');
          dragGhost.classList.add('hidden');
        }
        return;
      }

      const pickedObject = viewer.scene.pick(click.position);
      if (pickedObject && pickedObject.id && pickedObject.id.devId) {
        const clickedDevId = pickedObject.id.devId;
        const devRecord = devStore.getDevelopment(clickedDevId);
        if (devRecord) {
          selectDevelopmentForSimulation(devRecord);
          openPropertiesModal({ ...devRecord, isNew: false });
        }
      }
    }, ScreenSpaceEventType.LEFT_CLICK);

    setupSidebarAndDragInteractions(viewer);

  } catch (err) {
    console.error('[Cesium Init Error]:', err);
    updateStatus('Failed to load 3D Digital Twin viewer.');
  }
}

/**
 * Render Stylized 3D Road Network Corridors from spatial dataset.
 */
function renderStylizedRoadNetwork(viewer) {
  if (!spatialData || !spatialData.roads) return;

  spatialData.roads.forEach((roadSeg, idx) => {
    const flatPositions = [];
    roadSeg.forEach(([rLat, rLon]) => {
      flatPositions.push(rLon, rLat);
    });

    const isMajor = idx % 5 === 0;
    viewer.entities.add({
      polyline: {
        positions: Cartesian3.fromDegreesArray(flatPositions),
        width: isMajor ? 5 : 2.5,
        material: isMajor
          ? new PolylineGlowMaterialProperty({
              glowPower: 0.25,
              color: Color.fromCssColorString('#38bdf8'), // Glowing Cyan Major Arterials
            })
          : Color.fromCssColorString('#475569'), // Slate Secondary Roads
        clampToGround: true,
      },
    });
  });
}

// -----------------------------------------------------------------------------
// Stylized Physical 3D Building Entity Rendering
// -----------------------------------------------------------------------------
function renderDevelopmentEntity(viewer, devRecord) {
  const targetViewer = viewer || mainViewer || window.cesiumViewer;
  if (!targetViewer) return;

  const { development_id, development_type, latitude, longitude, zone_id, name, properties } = devRecord;
  const spec = PHYSICAL_DEV_SPECS[development_type] || PHYSICAL_DEV_SPECS.residential_compound;
  const dims = properties ? spec.calculateDimensions(properties) : spec.defaultDimensions;
  const position = Cartesian3.fromDegrees(longitude, latitude, dims.height / 2);

  const semiMajor = Math.max(dims.length, dims.width) / 2;
  const semiMinor = Math.min(dims.length, dims.width) / 2;

  const areaSqm = dims.length * dims.width;
  const areaHa = (areaSqm / 10000).toFixed(2);
  const areaLabel = `${areaSqm.toLocaleString()} m² (${areaHa} ha)`;

  if (devEntities.has(development_id)) {
    const entity = devEntities.get(development_id);
    entity.position = position;
    if (entity.box) {
      entity.box.dimensions = new Cartesian3(dims.length, dims.width, dims.height);
    }
    if (entity.ellipse) {
      entity.ellipse.semiMajorAxis = semiMajor;
      entity.ellipse.semiMinorAxis = semiMinor;
    }
    entity.label.text = `🏢 PROPOSED ${development_type.toUpperCase()}\n${name || development_id}\nFootprint: ${dims.length}m × ${dims.width}m × ${dims.height}m (${areaLabel})\nZone ${zone_id}`;
    targetViewer.scene.requestRender();
    return entity;
  }

  // Create Physical 3D Proposed Building Volume + Real-World Footprint Base
  const entity = targetViewer.entities.add({
    position,
    devId: development_id,
    box: {
      dimensions: new Cartesian3(dims.length, dims.width, dims.height),
      material: Color.fromCssColorString(spec.color).withAlpha(0.95),
      outline: true,
      outlineColor: Color.WHITE,
      heightReference: HeightReference.RELATIVE_TO_GROUND,
    },
    ellipse: {
      semiMajorAxis: semiMajor,
      semiMinorAxis: semiMinor,
      material: Color.fromCssColorString(spec.color).withAlpha(0.45),
      outline: true,
      outlineColor: Color.WHITE,
      heightReference: HeightReference.CLAMP_TO_GROUND,
    },
    point: {
      pixelSize: 10,
      color: Color.fromCssColorString(spec.color),
      outlineColor: Color.WHITE,
      outlineWidth: 2,
      heightReference: HeightReference.CLAMP_TO_GROUND,
    },
    label: {
      text: `🏢 PROPOSED ${development_type.toUpperCase()}\n${name || development_id}\nFootprint: ${dims.length}m × ${dims.width}m × ${dims.height}m (${areaLabel})\nZone ${zone_id}`,
      font: '12px Inter, sans-serif',
      fillColor: Color.WHITE,
      showBackground: true,
      backgroundColor: Color.fromCssColorString('#0f172a').withAlpha(0.92),
      backgroundPadding: { x: 8, y: 5 },
      verticalOrigin: VerticalOrigin.BOTTOM,
      pixelOffset: { x: 0, y: -30 },
      heightReference: HeightReference.RELATIVE_TO_GROUND,
    },
  });

  devEntities.set(development_id, entity);
  targetViewer.scene.requestRender();
  return entity;
}

function removeDevelopmentEntity(viewer, devId) {
  const targetViewer = viewer || mainViewer || window.cesiumViewer;
  if (devEntities.has(devId) && targetViewer) {
    const entity = devEntities.get(devId);
    targetViewer.entities.remove(entity);
    devEntities.delete(devId);
    targetViewer.scene.requestRender();
  }
}

// -----------------------------------------------------------------------------
// Sidebar Accordions & Physical Pointer Drag/Drop Engine
// -----------------------------------------------------------------------------
function setupSidebarAndDragInteractions(viewer) {
  sidebarToggle.addEventListener('click', () => {
    sidebar.classList.toggle('collapsed');
    if (window.cesiumViewer) {
      setTimeout(() => window.cesiumViewer.resize(), 300);
    }
  });

  document.querySelectorAll('.section-header').forEach((header) => {
    header.addEventListener('click', () => {
      header.classList.toggle('closed');
    });
  });

  btnCancelPlacement.addEventListener('click', cancelPlacementMode);

  modalClose.addEventListener('click', closePropertiesModal);
  btnCancelProperties.addEventListener('click', closePropertiesModal);

  const triggerConfirm = (e) => {
    if (e) e.preventDefault();
    handleConfirmProperties(viewer);
  };

  propertiesForm.addEventListener('submit', triggerConfirm);

  if (btnConfirmProperties) {
    btnConfirmProperties.addEventListener('click', triggerConfirm);
  }

  btnSidebarRunSim.addEventListener('click', () => {
    if (!selectedDevIdForSim) return;
    const devRecord = devStore.getDevelopment(selectedDevIdForSim);
    if (devRecord) handleTriggerSimulation(devRecord);
  });

  // Physical Pointer Drag & Drop + Click-to-Place Handlers
  const devCards = document.querySelectorAll('.draggable-dev-card');

  devCards.forEach((card) => {
    const handleStartPlacement = (e) => {
      const type = card.getAttribute('data-type');
      const spec = PHYSICAL_DEV_SPECS[type];
      if (!spec) return;

      activePlacementType = type;
      isDraggingFromSidebar = true;

      ghostIcon.textContent = '🏢';
      ghostTitle.textContent = spec.label;
      ghostSub.textContent = 'Move footprint over 3D map to place';
      if (e.clientX && e.clientY) {
        dragGhost.style.left = `${e.clientX}px`;
        dragGhost.style.top = `${e.clientY}px`;
      }
      dragGhost.classList.remove('hidden');

      placementBanner.classList.remove('hidden');
      bannerText.textContent = `Placement active: Drag or click location on 3D map to place ${spec.label}`;

      updateStatus(`PLACEMENT MODE ACTIVE — Drag or click 3D map to place ${spec.label}`);
    };

    card.addEventListener('pointerdown', handleStartPlacement);
    card.addEventListener('click', handleStartPlacement);
  });

  window.addEventListener('pointermove', (e) => {
    if (!activePlacementType) return;

    if (isDraggingFromSidebar && dragGhost) {
      dragGhost.style.left = `${e.clientX}px`;
      dragGhost.style.top = `${e.clientY}px`;
    }

    const picked = pickGeographicLocation(viewer, e.clientX, e.clientY, activePlacementType, movingDevId);

    const debugPanel = document.getElementById('placement-debug-panel');
    const debugDevType = document.getElementById('debug-dev-type');
    const debugDevId = document.getElementById('debug-dev-id');
    const debugFootprint = document.getElementById('debug-footprint');
    const debugLat = document.getElementById('debug-lat');
    const debugLon = document.getElementById('debug-lon');
    const debugZone = document.getElementById('debug-zone');
    const debugEntityStatus = document.getElementById('debug-entity-status');

    if (picked) {
      const spec = PHYSICAL_DEV_SPECS[activePlacementType] || PHYSICAL_DEV_SPECS.residential_compound;
      const dims = picked.collision.dimensions;

      const previewColor = Color.fromCssColorString(spec.color).withAlpha(0.85);
      const previewHeightPos = Cartesian3.fromDegrees(picked.longitude, picked.latitude, dims.height / 2);

      const semiMajor = Math.max(dims.length, dims.width) / 2;
      const semiMinor = Math.min(dims.length, dims.width) / 2;

      const areaSqm = dims.length * dims.width;
      const areaHa = (areaSqm / 10000).toFixed(2);
      const areaLabel = `${areaSqm.toLocaleString()} m² (${areaHa} ha)`;

      if (!previewEntity) {
        previewEntity = viewer.entities.add({
          position: previewHeightPos,
          box: {
            dimensions: new Cartesian3(dims.length, dims.width, dims.height),
            material: previewColor,
            outline: true,
            outlineColor: Color.WHITE,
            heightReference: HeightReference.RELATIVE_TO_GROUND,
          },
          ellipse: {
            semiMajorAxis: semiMajor,
            semiMinorAxis: semiMinor,
            material: Color.fromCssColorString(spec.color).withAlpha(0.35),
            outline: true,
            outlineColor: Color.WHITE,
            heightReference: HeightReference.CLAMP_TO_GROUND,
          },
          label: {
            text: `🏢 PROPOSED ${activePlacementType.toUpperCase()}\nFootprint: ${dims.length}m × ${dims.width}m × ${dims.height}m (${areaLabel})\nZone ${picked.zone_id}`,
            font: '12px Inter, sans-serif',
            fillColor: Color.WHITE,
            showBackground: true,
            backgroundColor: Color.fromCssColorString('#0f172a').withAlpha(0.92),
            backgroundPadding: { x: 8, y: 5 },
            verticalOrigin: VerticalOrigin.BOTTOM,
            pixelOffset: { x: 0, y: -25 },
            heightReference: HeightReference.RELATIVE_TO_GROUND,
          },
        });
      } else {
        previewEntity.position = previewHeightPos;
        if (previewEntity.box) {
          previewEntity.box.dimensions = new Cartesian3(dims.length, dims.width, dims.height);
          previewEntity.box.material = previewColor;
        }
        if (previewEntity.ellipse) {
          previewEntity.ellipse.semiMajorAxis = semiMajor;
          previewEntity.ellipse.semiMinorAxis = semiMinor;
          previewEntity.ellipse.material = Color.fromCssColorString(spec.color).withAlpha(0.35);
        }
        previewEntity.label.text = `🏢 PROPOSED ${activePlacementType.toUpperCase()}\nFootprint: ${dims.length}m × ${dims.width}m × ${dims.height}m (${areaLabel})\nZone ${picked.zone_id}`;
      }

      if (debugPanel) debugPanel.classList.remove('hidden');
      if (debugDevType) debugDevType.textContent = spec.label;
      if (debugDevId) debugDevId.textContent = 'DEV-PREVIEW';
      if (debugFootprint) debugFootprint.textContent = `${dims.length}m × ${dims.width}m × ${dims.height}m (${areaLabel})`;
      if (debugLat) debugLat.textContent = `${picked.latitude.toFixed(4)}° N`;
      if (debugLon) debugLon.textContent = `${picked.longitude.toFixed(4)}° E`;
      if (debugZone) debugZone.textContent = picked.zone_id;
      if (debugEntityStatus) debugEntityStatus.textContent = 'PREVIEW ACTIVE';

      ghostSub.textContent = `Zone ${picked.zone_id}`;
      bannerText.textContent = `Placing ${spec.label} (${dims.length}m × ${dims.width}m | ${areaLabel}) | Zone: ${picked.zone_id}`;
    } else {
      ghostSub.textContent = 'Move over 3D map to place';
      bannerText.textContent = 'Move pointer over 3D city map to place proposed development';
    }
  });

  window.addEventListener('pointerup', (e) => {
    if (!isDraggingFromSidebar || !activePlacementType) return;

    isDraggingFromSidebar = false;
    dragGhost.classList.add('hidden');
    placementBanner.classList.add('hidden');

    const releasePick = pickGeographicLocation(viewer, e.clientX, e.clientY, activePlacementType, movingDevId);

    if (releasePick) {
      const tempId = devStore.generateId();
      const devType = activePlacementType;

      pendingPlacementLocation = {
        development_id: tempId,
        development_type: devType,
        latitude: releasePick.latitude,
        longitude: releasePick.longitude,
        zone_id: releasePick.zone_id,
        isNew: true,
      };

      console.log('[DEVELOPMENT DROP]', {
        type: devType,
        id: tempId,
        latitude: releasePick.latitude,
        longitude: releasePick.longitude,
        zone: releasePick.zone_id,
        properties: {},
        cesiumEntity: 'PREVIEW_ACTIVE',
      });

      openPropertiesModal(pendingPlacementLocation);
    } else {
      cancelPlacementMode();
    }
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') cancelPlacementMode();
  });
}

function cancelPlacementMode() {
  activePlacementType = null;
  isDraggingFromSidebar = false;
  movingDevId = null;
  pendingPlacementLocation = null;

  placementBanner.classList.add('hidden');
  dragGhost.classList.add('hidden');

  const debugPanel = document.getElementById('placement-debug-panel');
  if (debugPanel) debugPanel.classList.add('hidden');

  if (previewEntity && (mainViewer || window.cesiumViewer)) {
    (mainViewer || window.cesiumViewer).entities.remove(previewEntity);
  }
  previewEntity = null;
}

// -----------------------------------------------------------------------------
// Properties Modal Handling
// -----------------------------------------------------------------------------
function openPropertiesModal(devRecord) {
  editingDevId = devRecord.isNew ? null : devRecord.development_id;
  const isNew = devRecord.isNew;
  const config = SUPPORTED_DEV_TYPES[devRecord.development_type];

  modalTitle.textContent = isNew ? `Configure ${config.label}` : `Edit ${devRecord.name}`;
  modalDevId.textContent = devRecord.development_id;
  modalDevZone.textContent = `Zone: ${devRecord.zone_id}`;
  modalDevCoords.textContent = `${devRecord.latitude.toFixed(4)}° N, ${devRecord.longitude.toFixed(4)}° E`;

  devNameInput.value = devRecord.name || `${config.label} ${devRecord.development_id}`;
  simulationHourSelect.value = devRecord.simulation_hour || '8';

  dynamicFieldsContainer.innerHTML = '';
  config.propertyFields.forEach((field) => {
    const val = devRecord.properties && devRecord.properties[field.key] !== undefined ? devRecord.properties[field.key] : field.default;

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

function closePropertiesModal() {
  propertiesModal.classList.add('hidden');

  // If closing without confirming a new placement, cancel preview
  if (pendingPlacementLocation && pendingPlacementLocation.isNew) {
    cancelPlacementMode();
  }

  editingDevId = null;
  pendingPlacementLocation = null;
}

function handleConfirmProperties(viewer) {
  const targetLocation = pendingPlacementLocation;
  if (!targetLocation && !editingDevId) {
    propertiesModal.classList.add('hidden');
    return;
  }

  const devType = targetLocation ? targetLocation.development_type : (devStore.getDevelopment(editingDevId)?.development_type || 'hospital');
  const config = SUPPORTED_DEV_TYPES[devType];

  let nameVal = devNameInput.value ? devNameInput.value.trim() : '';
  if (!nameVal) {
    nameVal = targetLocation ? `${config.label} ${targetLocation.development_id}` : `Proposed ${config.label}`;
  }

  const simHour = parseInt(simulationHourSelect.value || '8', 10);
  const inputs = dynamicFieldsContainer.querySelectorAll('.form-input');
  const properties = {};

  inputs.forEach((inp) => {
    const key = inp.name;
    const numVal = parseFloat(inp.value);
    properties[key] = Number.isNaN(numVal) ? (config.propertyFields.find(f => f.key === key)?.default || 0) : numVal;
  });

  const validation = devStore.validateProperties(devType, properties);
  if (!validation.valid) {
    formErrorAlert.textContent = validation.error;
    formErrorAlert.classList.remove('hidden');
    return;
  }

  let record;
  if (targetLocation && targetLocation.isNew) {
    record = devStore.addDevelopment({
      development_id: targetLocation.development_id,
      development_type: devType,
      name: nameVal,
      latitude: targetLocation.latitude,
      longitude: targetLocation.longitude,
      zone_id: targetLocation.zone_id,
      properties,
      simulation_hour: simHour,
    });
  } else if (editingDevId) {
    record = devStore.updateDevelopment(editingDevId, {
      development_type: devType,
      name: nameVal,
      properties,
      simulation_hour: simHour,
    });
  }

  if (record) {
    // 1. Render permanent 3D building entity
    renderDevelopmentEntity(mainViewer || window.cesiumViewer, record);

    // 2. Select for simulation & update list
    selectDevelopmentForSimulation(record);
    renderDevelopmentsList();
  }

  // 3. Close modal & reset placement state
  propertiesModal.classList.add('hidden');
  editingDevId = null;
  cancelPlacementMode();

  if (record) {
    updateStatus(`Confirmed physical 3D proposed building ${record.name} in Zone ${record.zone_id}`, true);
  }
}

function flyToDevelopment(devRecord) {
  const viewer = mainViewer || window.cesiumViewer;
  if (!viewer || !devRecord) return;

  viewer.camera.flyTo({
    destination: Cartesian3.fromDegrees(devRecord.longitude, devRecord.latitude, 850),
    orientation: {
      heading: CesiumMath.toRadians(12.0),
      pitch: CesiumMath.toRadians(-38.0),
      roll: 0.0,
    },
    duration: 1.2,
  });
}

function selectDevelopmentForSimulation(devRecord) {
  selectedDevIdForSim = devRecord.development_id;
  btnSidebarRunSim.disabled = false;
  btnSidebarRunSim.innerHTML = `<span>⚡</span> Run Simulation (${devRecord.development_id})`;
  flyToDevelopment(devRecord);
}

function renderDevelopmentsList() {
  const allDevs = devStore.getAllDevelopments();
  devCountEl.textContent = allDevs.length;

  if (allDevs.length === 0) {
    devListItemsEl.innerHTML = '<p class="empty-list-msg">No developments placed yet. Drag a land-use card onto the 3D city.</p>';
    btnSidebarRunSim.disabled = true;
    btnSidebarRunSim.innerHTML = '<span>⚡</span> Run What-If Simulation';
    selectedDevIdForSim = null;
    return;
  }

  devListItemsEl.innerHTML = '';

  allDevs.forEach((dev) => {
    const config = SUPPORTED_DEV_TYPES[dev.development_type] || SUPPORTED_DEV_TYPES.residential_compound;

    const item = document.createElement('div');
    item.className = 'compact-dev-item';

    const propSummary = Object.entries(dev.properties)
      .map(([k, v]) => `${k.replace(/num_|gross_|staff_/g, '')}: ${v}`)
      .join(', ');

    item.innerHTML = `
      <div class="compact-dev-top">
        <div class="compact-dev-title">${config.icon} ${dev.name}</div>
        <div class="compact-dev-actions">
          <button class="btn-mini-action edit" title="Edit Properties">✏️</button>
          <button class="btn-mini-action move" title="Move Location">📍</button>
          <button class="btn-mini-action delete" title="Delete">🗑️</button>
        </div>
      </div>
      <div class="compact-dev-sub">${dev.development_id} | Zone ${dev.zone_id} | ${propSummary}</div>
    `;

    item.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      selectDevelopmentForSimulation(dev);
    });

    item.querySelector('.edit').addEventListener('click', () => openPropertiesModal({ ...dev, isNew: false }));
    item.querySelector('.move').addEventListener('click', () => {
      movingDevId = dev.development_id;
      placementBanner.classList.remove('hidden');
      bannerText.textContent = `Repositioning ${dev.development_id}... Click new location on 3D map`;
      updateStatus(`Moving ${dev.development_id} — Click new 3D location`);
    });
    item.querySelector('.delete').addEventListener('click', () => {
      devStore.deleteDevelopment(dev.development_id);
      removeDevelopmentEntity(window.cesiumViewer, dev.development_id);
      if (selectedDevIdForSim === dev.development_id) selectedDevIdForSim = null;
      renderDevelopmentsList();
      updateStatus(`Deleted ${dev.development_id}`);
    });

    devListItemsEl.appendChild(item);
  });

  if (!selectedDevIdForSim && allDevs.length > 0) {
    selectDevelopmentForSimulation(allDevs[allDevs.length - 1]);
  }
}

// -----------------------------------------------------------------------------
// Simulation Trigger Handler
// -----------------------------------------------------------------------------
async function handleTriggerSimulation(devRecord) {
  if (isSimulationRunning) return;
  isSimulationRunning = true;

  updateStatus(`Running What-If simulation for ${devRecord.name}...`);
  btnSidebarRunSim.disabled = true;

  try {
    const result = await runWhatIfSimulation(devRecord, devRecord.simulation_hour || 8);
    window.lastSimulationResult = result;

    renderCompactSimulationResult(result);
    updateStatus(`What-If simulation completed for ${devRecord.name}`, true);
  } catch (err) {
    updateStatus(`Simulation failed: ${err.message}`);
  } finally {
    isSimulationRunning = false;
    btnSidebarRunSim.disabled = false;
  }
}

function renderCompactSimulationResult(result) {
  const devInput = result.development_input || {};
  const stage1 = result.stage1_od_demand || {};
  const stage3 = result.stage3_scenario_traffic || {};
  const stage4 = result.stage4_impact_assessment || {};
  const meta = result.execution_metadata || {};

  const impactLevel = (stage4.overall_impact_level || 'LOW').toUpperCase();

  compactResultContent.innerHTML = `
    <div style="display:flex; flex-direction:column; gap:6px; font-size:11px;">
      <div style="font-weight:700; color:#38bdf8;">${devInput.name || devInput.development_id}</div>
      <div>Zone ${devInput.zone_id} | Hour ${String(result.hour).padStart(2, '0')}:00</div>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:4px; margin-top:4px;">
        <div style="background:rgba(15,23,42,0.6); padding:4px 6px; border-radius:4px;">
          <span style="color:#64748b; font-size:9px;">GENERATED TRIPS</span><br>
          <strong style="color:#38bdf8;">${Math.round(stage1.total_trips || 0)} veh/h</strong>
        </div>
        <div style="background:rgba(15,23,42,0.6); padding:4px 6px; border-radius:4px;">
          <span style="color:#64748b; font-size:9px;">ASSIGNED TRIPS</span><br>
          <strong style="color:#818cf8;">${Math.round(stage3.assigned_external_trips || 0)} veh/h</strong>
        </div>
        <div style="background:rgba(15,23,42,0.6); padding:4px 6px; border-radius:4px;">
          <span style="color:#64748b; font-size:9px;">AFFECTED ROADS</span><br>
          <strong>${stage4.number_of_affected_roads || 0}</strong>
        </div>
        <div style="background:rgba(15,23,42,0.6); padding:4px 6px; border-radius:4px;">
          <span style="color:#64748b; font-size:9px;">MAX V/C RATIO</span><br>
          <strong style="color:#c084fc;">${(stage4.max_scenario_vc || 0).toFixed(2)}</strong>
        </div>
      </div>
      <div style="display:flex; justify-content:space-between; align-items:center; margin-top:6px; border-top:1px solid rgba(255,255,255,0.1); padding-top:6px;">
        <span>IMPACT LEVEL:</span>
        <span class="impact-badge impact-${impactLevel.toLowerCase()}">${impactLevel}</span>
      </div>
      <div style="font-size:9px; color:#64748b; text-align:right;">Completed in ${meta.execution_time_seconds || 0} s</div>
    </div>
  `;

  sectionResults.classList.remove('hidden');
}

// Global viewer listener
window.addEventListener('DOMContentLoaded', () => {
  initCesiumViewer().then(() => {
    const v = document.querySelector('#cesiumContainer')?._cesiumWidget?._viewer;
    if (v) window.cesiumViewer = v;
  });
});
