import { Cartesian3, Color, HeightReference, VerticalOrigin, PolygonHierarchy } from 'cesium';
import { SUPPORTED_DEV_TYPES } from '../../types/development.js';
import { getCanonicalSpatialLayers } from '../../utils/buildabilityEngine.js';

export class BuildabilityOverlay {
  constructor(viewer) {
    this.viewer = viewer;
    this.previewEntity = null;
    this.buildableEntities = [];
    this.isDebugOverlayActive = false;
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

    const isValid = validation.valid;
    const colorHex = isValid ? '#10b981' : '#ef4444';
    const previewColor = Color.fromCssColorString(colorHex).withAlpha(isValid ? 0.85 : 0.65);
    const heightPos = Cartesian3.fromDegrees(lon, lat, height / 2);

    const areaSqm = length * width;
    const areaHa = (areaSqm / 10000).toFixed(2);
    const areaLabel = `${areaSqm.toLocaleString()} m² (${areaHa} ha)`;
    const statusTag = isValid ? 'VALID CANDIDATE' : `BLOCKED (${validation.reason || validation.conflictType})`;

    const textLabel = `🏢 PLACEMENT PREVIEW (${devType.toUpperCase()})\nStatus: ${statusTag}\nFootprint: ${length}m × ${width}m × ${height}m (${areaLabel})\nZone ${picked.zone_id || 'unresolved'}`;

    if (!this.previewEntity) {
      this.previewEntity = this.viewer.entities.add({
        id: 'placement-preview-entity',
        position: Cartesian3.clone(heightPos),
        properties: {
          isPreview: true,
          developmentType: devType,
        },
        box: {
          dimensions: new Cartesian3(length, width, height),
          material: previewColor,
          outline: true,
          outlineColor: isValid ? Color.WHITE : Color.fromCssColorString('#991b1b'),
          heightReference: HeightReference.RELATIVE_TO_GROUND,
        },
        label: {
          text: textLabel,
          font: '12px Inter, sans-serif',
          fillColor: Color.WHITE,
          showBackground: true,
          backgroundColor: Color.fromCssColorString(isValid ? '#0f172a' : '#7f1d1d').withAlpha(0.92),
          backgroundPadding: { x: 8, y: 5 },
          verticalOrigin: VerticalOrigin.BOTTOM,
          pixelOffset: { x: 0, y: -25 },
          heightReference: HeightReference.RELATIVE_TO_GROUND,
        },
      });

      console.log('[ENTITY CREATED: PREVIEW]', {
        id: this.previewEntity.id,
        devId: null,
        properties: { isPreview: true, developmentType: devType },
        type: devType,
        isPreview: true,
        position: { lat, lon, height },
      });
    } else {
      const oldPos = this.previewEntity.position ? this.previewEntity.position.getValue(this.viewer.clock.currentTime) : null;
      this.previewEntity.position = Cartesian3.clone(heightPos);
      if (this.previewEntity.box) {
        this.previewEntity.box.dimensions = new Cartesian3(length, width, height);
        this.previewEntity.box.material = previewColor;
        this.previewEntity.box.outlineColor = isValid ? Color.WHITE : Color.fromCssColorString('#991b1b');
      }
      if (this.previewEntity.label) {
        this.previewEntity.label.text = textLabel;
        this.previewEntity.label.backgroundColor = Color.fromCssColorString(isValid ? '#0f172a' : '#7f1d1d').withAlpha(0.92);
      }

      console.log('[ENTITY MOVED: PREVIEW]', {
        id: this.previewEntity.id,
        devId: null,
        properties: { isPreview: true, developmentType: devType },
        type: devType,
        isPreview: true,
        oldPosition: oldPos,
        newPosition: heightPos,
        caller: 'BuildabilityOverlay.updatePreview',
      });
    }

    this.viewer.scene.requestRender();
  }

  clearPreview() {
    if (this.previewEntity && this.viewer) {
      console.log('[ENTITY REMOVED: PREVIEW]', {
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
