import { createDevelopmentModel, SUPPORTED_DEV_TYPES } from '../types/development.js';

export { SUPPORTED_DEV_TYPES };

export class DevelopmentStore {
  constructor() {
    this.developments = new Map();
    this.counter = 1;
    this.listeners = new Set();
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify() {
    for (const listener of this.listeners) {
      try {
        listener(this.getAllDevelopments());
      } catch (err) {
        console.error('[devStore notification error]:', err);
      }
    }
  }

  generateId() {
    const idStr = String(this.counter).padStart(3, '0');
    this.counter += 1;
    return `DEV-${idStr}`;
  }

  validateProperties(devType, properties) {
    const config = SUPPORTED_DEV_TYPES[devType];
    if (!config) {
      return { valid: false, error: `Unsupported development type '${devType}'.` };
    }

    if (!properties || typeof properties !== 'object') {
      return { valid: false, error: 'Properties must be a valid object.' };
    }

    for (const [k, v] of Object.entries(properties)) {
      if (typeof v === 'number' && (Number.isNaN(v) || v < 0)) {
        return { valid: false, error: `Property '${k}' must be a non-negative number. Got: ${v}` };
      }
    }

    return { valid: true };
  }

  addDevelopment(devData) {
    const devId = devData.development_id || devData.id || this.generateId();
    const normalized = createDevelopmentModel({ ...devData, id: devId, development_id: devId });

    this.developments.set(devId, normalized);
    this.notify();
    return normalized;
  }

  updateDevelopment(devId, updatedData) {
    const existing = this.developments.get(devId);
    if (!existing) {
      throw new Error(`Development '${devId}' not found.`);
    }

    const merged = {
      ...existing,
      ...updatedData,
      properties: updatedData.properties
        ? { ...existing.properties, ...updatedData.properties }
        : { ...existing.properties },
      id: devId,
      development_id: devId,
    };

    const normalized = createDevelopmentModel(merged);
    this.developments.set(devId, normalized);
    this.notify();
    return normalized;
  }

  moveDevelopment(devId, latitude, longitude, zoneId) {
    const existing = this.developments.get(devId);
    if (!existing) {
      throw new Error(`Development '${devId}' not found.`);
    }

    const updated = createDevelopmentModel({
      ...existing,
      latitude: Number(latitude),
      longitude: Number(longitude),
      zone_id: zoneId,
      properties: { ...existing.properties },
    });

    this.developments.set(devId, updated);
    this.notify();
    return updated;
  }

  deleteDevelopment(devId) {
    const deleted = this.developments.delete(devId);
    if (deleted) this.notify();
    return deleted;
  }

  getDevelopment(devId) {
    return this.developments.get(devId);
  }

  getAllDevelopments() {
    return Array.from(this.developments.values());
  }

  clearAll() {
    this.developments.clear();
    this.notify();
  }
}
