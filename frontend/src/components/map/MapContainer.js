import {
  Ion,
  Viewer,
  ImageryLayer,
  createWorldImageryAsync,
  Cartesian3,
  Math as CesiumMath,
  Terrain,
  Color,
} from 'cesium';

import 'cesium/Build/Cesium/Widgets/widgets.css';
import { loadMapLayers } from './MapLayers.js';

export async function createCesiumViewer(containerId, onStatusUpdate) {
  const token = import.meta.env.VITE_CESIUM_ION_TOKEN || import.meta.env.CESIUM_ION_TOKEN;
  if (!token || token.trim() === '' || token.includes('your_token_here')) {
    if (onStatusUpdate) onStatusUpdate('Cesium ion access token missing');
    throw new Error('Cesium ion access token missing');
  }

  Ion.defaultAccessToken = token.trim();
  if (onStatusUpdate) onStatusUpdate('Initializing Stylized Digital Twin Environment...');

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

  const viewer = new Viewer(containerId, {
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

  if (viewer.cesiumWidget && viewer.cesiumWidget.creditContainer) {
    viewer.cesiumWidget.creditContainer.style.display = 'none';
  }

  viewer.scene.fxaa = true;
  viewer.scene.globe.baseColor = Color.fromCssColorString('#0f172a');
  viewer.scene.globe.showAtmosphere = false;
  viewer.scene.globe.enableLighting = false;

  if (onStatusUpdate) onStatusUpdate('Loading Low-Poly 3D OSM Architecture...');
  await loadMapLayers(viewer);

  // Focus view on District R3 (New Administrative Capital)
  viewer.camera.setView({
    destination: Cartesian3.fromDegrees(31.7366, 30.0154, 1300),
    orientation: {
      heading: CesiumMath.toRadians(12.0),
      pitch: CesiumMath.toRadians(-38.0),
      roll: 0.0,
    },
  });

  if (onStatusUpdate) onStatusUpdate('Ready — Stylized Digital Twin active.', true);
  return viewer;
}
