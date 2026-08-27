import {
  Cartesian3,
  Color,
  HeightReference,
  VerticalOrigin,
} from 'cesium';

import { SUPPORTED_DEV_TYPES } from '../../types/development.js';

export class DevelopmentRenderer {
  constructor(viewer) {
    this.viewer = viewer;
    this.entitiesMap = new Map();
  }

  setViewer(viewer) {
    this.viewer = viewer;
  }

  renderDevelopment(devRecord) {
    if (!this.viewer || !devRecord) return null;

    const { id, development_id, type, development_type, latitude, longitude, zone_id, name, footprint, height, buildingHeight, floors } = devRecord;
    const devId = id || development_id;
    const devType = type || development_type;
    const spec = SUPPORTED_DEV_TYPES[devType] || SUPPORTED_DEV_TYPES.residential_compound;

    const lon = (typeof longitude === 'number' && !Number.isNaN(longitude)) ? longitude : null;
    const lat = (typeof latitude === 'number' && !Number.isNaN(latitude)) ? latitude : null;

    if (lon === null || lat === null) return null;

    const dims = footprint || spec.defaultDimensions;
    const width = (typeof dims.width === 'number' && !Number.isNaN(dims.width) && dims.width > 0) ? dims.width : spec.defaultDimensions.width;
    const length = (typeof dims.length === 'number' && !Number.isNaN(dims.length) && dims.length > 0) ? dims.length : spec.defaultDimensions.length;

    const rawHeight = height || buildingHeight || dims.height;
    const bldgHeight = (typeof rawHeight === 'number' && !Number.isNaN(rawHeight) && rawHeight > 0) ? rawHeight : spec.defaultDimensions.height;

    const position = Cartesian3.fromDegrees(lon, lat, bldgHeight / 2);
    const semiMajor = Math.max(length, width) / 2;
    const semiMinor = Math.min(length, width) / 2;

    const areaSqm = length * width;
    const areaHa = (areaSqm / 10000).toFixed(2);
    const areaLabel = `${areaSqm.toLocaleString()} m² (${areaHa} ha)`;

    const labelText = `🏢 PROPOSED ${devType.toUpperCase()}\n${name || devId}\nFootprint: ${length}m × ${width}m × ${bldgHeight}m (${floors || Math.round(bldgHeight / 3)} fl | ${areaLabel})\nZone ${zone_id || 'unresolved'}`;

    if (this.entitiesMap.has(devId)) {
      const entity = this.entitiesMap.get(devId);
      entity.position = position;
      if (entity.box) {
        entity.box.dimensions = new Cartesian3(length, width, bldgHeight);
      }
      if (entity.ellipse) {
        entity.ellipse.semiMajorAxis = semiMajor;
        entity.ellipse.semiMinorAxis = semiMinor;
      }
      if (entity.label) {
        entity.label.text = labelText;
      }
      this.viewer.scene.requestRender();
      return entity;
    }

    const entity = this.viewer.entities.add({
      position,
      devId,
      properties: {
        developmentId: devId,
        developmentType: devType,
        zoneId: zone_id,
      },
      box: {
        dimensions: new Cartesian3(length, width, bldgHeight),
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
        text: labelText,
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

    this.entitiesMap.set(devId, entity);
    this.viewer.scene.requestRender();
    return entity;
  }

  removeDevelopment(devId) {
    if (this.entitiesMap.has(devId) && this.viewer) {
      const entity = this.entitiesMap.get(devId);
      this.viewer.entities.remove(entity);
      this.entitiesMap.delete(devId);
      this.viewer.scene.requestRender();
    }
  }

  syncAll(developmentsList) {
    const currentIds = new Set(developmentsList.map(d => d.id || d.development_id));

    // Remove obsolete
    for (const [id] of this.entitiesMap) {
      if (!currentIds.has(id)) {
        this.removeDevelopment(id);
      }
    }

    // Add or update active
    for (const dev of developmentsList) {
      this.renderDevelopment(dev);
    }
  }
}
