import { Cartesian3, Color, HeightReference, VerticalOrigin } from 'cesium';
import { SUPPORTED_DEV_TYPES } from '../../types/development.js';

export class BuildabilityOverlay {
  constructor(viewer) {
    this.viewer = viewer;
    this.previewEntity = null;
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

    const textLabel = `🏢 PROPOSED ${devType.toUpperCase()}\nStatus: ${statusTag}\nFootprint: ${length}m × ${width}m × ${height}m (${areaLabel})\nZone ${picked.zone_id || 'unresolved'}`;

    if (!this.previewEntity) {
      this.previewEntity = this.viewer.entities.add({
        position: heightPos,
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
    } else {
      this.previewEntity.position = heightPos;
      if (this.previewEntity.box) {
        this.previewEntity.box.dimensions = new Cartesian3(length, width, height);
        this.previewEntity.box.material = previewColor;
        this.previewEntity.box.outlineColor = isValid ? Color.WHITE : Color.fromCssColorString('#991b1b');
      }
      if (this.previewEntity.label) {
        this.previewEntity.label.text = textLabel;
        this.previewEntity.label.backgroundColor = Color.fromCssColorString(isValid ? '#0f172a' : '#7f1d1d').withAlpha(0.92);
      }
    }

    this.viewer.scene.requestRender();
  }

  clearPreview() {
    if (this.previewEntity && this.viewer) {
      this.viewer.entities.remove(this.previewEntity);
    }
    this.previewEntity = null;
  }
}
