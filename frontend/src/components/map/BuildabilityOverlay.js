import { Cartesian3, Color, HeightReference, VerticalOrigin, PolygonHierarchy, Cartographic, Math as CesiumMath, SceneTransforms } from 'cesium';
import { SUPPORTED_DEV_TYPES } from '../../types/development.js';
import { getCanonicalSpatialLayers } from '../../utils/buildabilityEngine.js';
import { getBuildingPositionCartesian, getDevelopmentFootprintPolygonWGS84 } from '../../utils/geoUtils.js';

export class BuildabilityOverlay {
  constructor(viewer) {
    this.viewer = viewer;
    this.previewEntity = null;
    this.buildableEntities = [];
    this.isDebugOverlayActive = false;

    if (this.viewer && this.viewer.entities && this.viewer.entities.collectionChanged) {
      this.viewer.entities.collectionChanged.addEventListener((collection, added, removed, changed) => {
        if (
          (added && added.some(e => e.id === 'placement-preview-entity')) ||
          (removed && removed.some(e => e.id === 'placement-preview-entity'))
        ) {
          console.log('[PREVIEW ENTITY LIFECYCLE]', {
            added: added ? added.map(e => e.id) : [],
            removed: removed ? removed.map(e => e.id) : [],
          });
        }
      });
    }
  }

  setViewer(viewer) {
    this.viewer = viewer;
  }

  getPreviewEntity() {
    return this.previewEntity;
  }

  updatePreview(picked, devType) {
    if (!this.viewer || !picked) return;

    const lon = (typeof picked.longitude === 'number' && !Number.isNaN(picked.longitude)) ? picked.longitude : null;
    const lat = (typeof picked.latitude === 'number' && !Number.isNaN(picked.latitude)) ? picked.latitude : null;

    if (lon === null || lat === null) return;

    const spec = SUPPORTED_DEV_TYPES[devType] || SUPPORTED_DEV_TYPES.residential_compound;
    const validation = picked.collision || { valid: true, reason: null };
    const dims = validation.dimensions || spec.defaultDimensions;

    const width = (typeof dims.width === 'number' && !Number.isNaN(dims.width) && dims.width > 0) ? dims.width : spec.defaultDimensions.width;
    const length = (typeof dims.length === 'number' && !Number.isNaN(dims.length) && dims.length > 0) ? dims.length : spec.defaultDimensions.length;

    const rawHeight = dims.height || dims.buildingHeight;
    const height = (typeof rawHeight === 'number' && !Number.isNaN(rawHeight) && rawHeight > 0) ? rawHeight : spec.defaultDimensions.height;

    if (width <= 0 || length <= 0 || height <= 0) {
      throw new Error(`INVALID PREVIEW DIMENSIONS: width=${width}, length=${length}, height=${height}`);
    }

    const isValid = validation.valid;
    const fillColorHex = isValid ? '#10b981' : '#ef4444';
    const outlineColorHex = isValid ? '#34d399' : '#f87171';
    
    // Clean translucent 3D wireframe volume (0.40 alpha)
    const previewColor = Color.fromCssColorString(fillColorHex).withAlpha(0.40);
    const outlineColor = Color.fromCssColorString(outlineColorHex);

    const terrainHeight = (typeof picked.terrainHeight === 'number' && !Number.isNaN(picked.terrainHeight)) ? picked.terrainHeight : (picked.height || 0);
    const heightPos = getBuildingPositionCartesian(lon, lat, terrainHeight, height);
    if (!heightPos) return;

    // Render ONLY ONE 3D Translucent Wireframe Preview Volume (No floating Cesium label, no duplicate box)
    if (!this.previewEntity) {
      const countBefore = this.viewer.entities.values.length;
      this.previewEntity = this.viewer.entities.add({
        id: 'placement-preview-entity',
        show: true,
        position: Cartesian3.clone(heightPos),
        properties: {
          isPreview: true,
          developmentType: devType,
        },
        box: {
          dimensions: new Cartesian3(length, width, height),
          material: previewColor,
          outline: true,
          outlineColor: outlineColor,
          heightReference: HeightReference.NONE,
        },
      });
      const countAfter = this.viewer.entities.values.length;

      console.log('[PREVIEW CREATE]', {
        type: devType,
        entityId: this.previewEntity.id,
        show: this.previewEntity.show,
        hasBox: !!this.previewEntity.box,
        dimensions: { length, width, height },
        position: { lat, lon, heightPos },
        entitiesCount: { before: countBefore, after: countAfter },
      });
    } else {
      const oldPos = this.previewEntity.position ? this.previewEntity.position.getValue(this.viewer.clock.currentTime) : null;
      this.previewEntity.show = true;
      this.previewEntity.position = Cartesian3.clone(heightPos);
      if (this.previewEntity.box) {
        this.previewEntity.box.dimensions = new Cartesian3(length, width, height);
        this.previewEntity.box.material = previewColor;
        this.previewEntity.box.outlineColor = outlineColor;
        this.previewEntity.box.heightReference = HeightReference.NONE;
      }

      console.log('[PREVIEW UPDATE]', {
        id: this.previewEntity.id,
        show: this.previewEntity.show,
        type: devType,
        oldPosition: oldPos,
        newPosition: heightPos,
      });
    }

    // Verify entity in viewer collection
    const retrieved = this.viewer.entities.getById('placement-preview-entity');
    if (!retrieved) {
      throw new Error('FAILED TO RETRIEVE PREVIEW ENTITY FROM VIEWER');
    }

    // Log Cartographic position verification
    const carto = Cartographic.fromCartesian(this.previewEntity.position.getValue(this.viewer.clock.currentTime));
    const screenPos = SceneTransforms.worldToWindowCoordinates(
      this.viewer.scene,
      this.previewEntity.position.getValue(this.viewer.clock.currentTime)
    );

    console.log('[PREVIEW VERIFIED POSITION]', {
      id: this.previewEntity.id,
      show: this.previewEntity.show,
      hasBox: !!this.previewEntity.box,
      dimensions: { length, width, height },
      heightReference: 'NONE',
      pickedLon: lon,
      pickedLat: lat,
      renderedLon: CesiumMath.toDegrees(carto.longitude),
      renderedLat: CesiumMath.toDegrees(carto.latitude),
      renderedCenterHeight: carto.height,
      expectedCenterHeight: terrainHeight + (height / 2.0),
      screenPos,
      isSameViewer: this.viewer === window.cesiumViewer,
    });

    const previewCount = this.viewer.entities.values.filter(e => e.id === 'placement-preview-entity').length;
    if (previewCount !== 1) {
      console.warn(`DUPLICATE PREVIEW DETECTED: ${previewCount} entities with id placement-preview-entity`);
    }

    this.viewer.scene.requestRender();
  }

  clearPreview() {
    if (this.previewEntity && this.viewer) {
      console.log('[ENTITY REMOVED: PREVIEW VOLUME]', {
        id: this.previewEntity.id,
        devId: null,
        properties: { isPreview: true },
        type: 'preview',
        isPreview: true,
      });

      this.viewer.entities.remove(this.previewEntity);
    }
    this.previewEntity = null;
  }

  toggleBuildableDebugOverlay(forceState = null) {
    const newState = forceState !== null ? forceState : !this.isDebugOverlayActive;
    this.isDebugOverlayActive = newState;

    if (!newState) {
      this.clearBuildableDebugOverlay();
      return false;
    }

    this.clearBuildableDebugOverlay();
    if (!this.viewer) return false;

    const { buildingFootprints } = getCanonicalSpatialLayers();

    // Render 2D Building Footprint Polygons (Red Footprints)
    buildingFootprints.forEach((bldg) => {
      const flat = [];
      bldg.wgs84Coords.forEach((pt) => {
        flat.push(pt[1], pt[0]); // [lon, lat]
      });

      if (flat.length >= 6) {
        const entity = this.viewer.entities.add({
          polygon: {
            hierarchy: new PolygonHierarchy(Cartesian3.fromDegreesArray(flat)),
            material: Color.fromCssColorString('#ef4444').withAlpha(0.35),
            outline: true,
            outlineColor: Color.fromCssColorString('#f87171'),
            heightReference: HeightReference.CLAMP_TO_GROUND,
          },
        });
        this.buildableEntities.push(entity);
      }
    });

    this.viewer.scene.requestRender();
    return true;
  }

  clearBuildableDebugOverlay() {
    if (this.viewer && this.buildableEntities.length > 0) {
      this.buildableEntities.forEach((ent) => {
        this.viewer.entities.remove(ent);
      });
    }
    this.buildableEntities = [];
    this.isDebugOverlayActive = false;
  }
}
