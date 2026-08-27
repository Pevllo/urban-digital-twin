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

    const spec = SUPPORTED_DEV_TYPES[devType] || SUPPORTED_DEV_TYPES.residential_compound;
    const validation = picked.collision || { valid: true, reason: null };
    const dims = validation.dimensions || spec.defaultDimensions;
    const isValid = validation.valid;

    // Green (#10b981) when valid, Red (#ef4444) when invalid
    const colorHex = isValid ? '#10b981' : '#ef4444';
    const previewColor = Color.fromCssColorString(colorHex).withAlpha(isValid ? 0.85 : 0.65);
    const heightPos = Cartesian3.fromDegrees(picked.longitude, picked.latitude, dims.height / 2);

    const semiMajor = Math.max(dims.length, dims.width) / 2;
    const semiMinor = Math.min(dims.length, dims.width) / 2;

    const areaSqm = dims.length * dims.width;
    const areaHa = (areaSqm / 10000).toFixed(2);
    const areaLabel = `${areaSqm.toLocaleString()} m² (${areaHa} ha)`;
    const statusTag = isValid ? 'VALID CANDIDATE' : `BLOCKED (${validation.reason || validation.conflictType})`;

    const textLabel = `🏢 PROPOSED ${devType.toUpperCase()}\nStatus: ${statusTag}\nFootprint: ${dims.length}m × ${dims.width}m × ${dims.height}m (${areaLabel})\nZone ${picked.zone_id}`;

    if (!this.previewEntity) {
      this.previewEntity = this.viewer.entities.add({
        position: heightPos,
        box: {
          dimensions: new Cartesian3(dims.length, dims.width, dims.height),
          material: previewColor,
          outline: true,
          outlineColor: isValid ? Color.WHITE : Color.RED,
          heightReference: HeightReference.RELATIVE_TO_GROUND,
        },
        ellipse: {
          semiMajorAxis: semiMajor,
          semiMinorAxis: semiMinor,
          material: Color.fromCssColorString(colorHex).withAlpha(0.35),
          outline: true,
          outlineColor: isValid ? Color.WHITE : Color.RED,
          heightReference: HeightReference.CLAMP_TO_GROUND,
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
        this.previewEntity.box.dimensions = new Cartesian3(dims.length, dims.width, dims.height);
        this.previewEntity.box.material = previewColor;
        this.previewEntity.box.outlineColor = isValid ? Color.WHITE : Color.RED;
      }
      if (this.previewEntity.ellipse) {
        this.previewEntity.ellipse.semiMajorAxis = semiMajor;
        this.previewEntity.ellipse.semiMinorAxis = semiMinor;
        this.previewEntity.ellipse.material = Color.fromCssColorString(colorHex).withAlpha(0.35);
        this.previewEntity.ellipse.outlineColor = isValid ? Color.WHITE : Color.RED;
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
