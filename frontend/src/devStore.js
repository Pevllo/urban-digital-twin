/**
 * Frontend Development Store & State Manager — AI Urban Digital Twin
 *
 * Manages local scenario developments (CRUD operations, schema compatibility, validation)
 * matching Stage 1 DevelopmentInput specifications.
 */

export const SUPPORTED_DEV_TYPES = {
  residential_compound: {
    label: 'Residential Compound',
    icon: '🏠',
    color: '#3b82f6',
    defaultName: 'Proposed Residential Compound',
    propertyFields: [
      { key: 'num_residents', label: 'Number of Residents', type: 'number', default: 5000, required: true },
      { key: 'num_units', label: 'Number of Housing Units', type: 'number', default: 1200, required: false },
    ],
  },
  hospital: {
    label: 'Hospital',
    icon: '🏥',
    color: '#ef4444',
    defaultName: 'Proposed Medical Center',
    propertyFields: [
      { key: 'num_beds', label: 'Number of Beds', type: 'number', default: 300, required: true },
      { key: 'staff_count', label: 'Staff Count', type: 'number', default: 450, required: false },
    ],
  },
  mall: {
    label: 'Mall',
    icon: '🏬',
    color: '#a855f7',
    defaultName: 'Proposed Commercial Mall',
    propertyFields: [
      { key: 'gross_leasable_area_sqm', label: 'Gross Leasable Area (m²)', type: 'number', default: 25000, required: true },
      { key: 'visitor_capacity', label: 'Daily Visitor Capacity', type: 'number', default: 10000, required: false },
    ],
  },
  school: {
    label: 'School',
    icon: '🏫',
    color: '#eab308',
    defaultName: 'Proposed Educational Facility',
    propertyFields: [
      { key: 'num_students', label: 'Number of Students', type: 'number', default: 1500, required: true },
      { key: 'staff_count', label: 'Staff Count', type: 'number', default: 120, required: false },
    ],
  },
  office: {
    label: 'Office Building',
    icon: '🏢',
    color: '#06b6d4',
    defaultName: 'Proposed Office Complex',
    propertyFields: [
      { key: 'num_employees', label: 'Number of Employees', type: 'number', default: 2000, required: true },
      { key: 'gross_floor_area_sqm', label: 'Gross Floor Area (m²)', type: 'number', default: 35000, required: false },
    ],
  },
};

export class DevelopmentStore {
  constructor() {
    this.developments = new Map();
    this.counter = 1;
  }

  generateId() {
    const idStr = String(this.counter).padStart(3, '0');
    this.counter += 1;
    return `DEV-${idStr}`;
  }

  /**
   * Validates properties according to development type specifications.
   */
  validateProperties(devType, properties) {
    const config = SUPPORTED_DEV_TYPES[devType];
    if (!config) {
      return { valid: false, error: `Unsupported development type '${devType}'.` };
    }

    if (!properties || typeof properties !== 'object') {
      return { valid: false, error: 'Properties must be a valid object.' };
    }

    // Check for negative numbers or NaN
    for (const [k, v] of Object.entries(properties)) {
      if (typeof v === 'number') {
        if (Number.isNaN(v) || v < 0) {
          return { valid: false, error: `Property '${k}' must be a non-negative number. Got: ${v}` };
        }
      }
    }

    // Check required metrics per type
    if (devType === 'residential_compound') {
      const res = properties.num_residents || 0;
      const units = properties.num_units || 0;
      if (res <= 0 && units <= 0) {
        return { valid: false, error: 'Residential Compound requires at least one positive metric: Residents or Units > 0.' };
      }
    } else if (devType === 'hospital') {
      const beds = properties.num_beds || 0;
      const staff = properties.staff_count || 0;
      if (beds <= 0 && staff <= 0) {
        return { valid: false, error: 'Hospital requires at least one positive metric: Beds or Staff > 0.' };
      }
    } else if (devType === 'mall') {
      const gla = properties.gross_leasable_area_sqm || 0;
      const cap = properties.visitor_capacity || 0;
      if (gla <= 0 && cap <= 0) {
        return { valid: false, error: 'Mall requires at least one positive metric: Gross Leasable Area or Visitor Capacity > 0.' };
      }
    } else if (devType === 'school') {
      const students = properties.num_students || 0;
      const staff = properties.staff_count || 0;
      if (students <= 0 && staff <= 0) {
        return { valid: false, error: 'School requires at least one positive metric: Students or Staff > 0.' };
      }
    } else if (devType === 'office') {
      const emp = properties.num_employees || 0;
      const gfa = properties.gross_floor_area_sqm || 0;
      if (emp <= 0 && gfa <= 0) {
        return { valid: false, error: 'Office requires at least one positive metric: Employees or Gross Floor Area > 0.' };
      }
    }

    return { valid: true };
  }

  /**
   * Adds a new development to local state.
   */
  addDevelopment(devData) {
    const { development_type, latitude, longitude, zone_id, properties, name } = devData;

    const validation = this.validateProperties(development_type, properties);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    const devId = devData.development_id || this.generateId();
    const config = SUPPORTED_DEV_TYPES[development_type];

    const record = {
      development_id: devId,
      development_type,
      name: name || `${config.label} ${devId}`,
      latitude: Number(latitude),
      longitude: Number(longitude),
      zone_id,
      properties: { ...properties },
      created_at: new Date().toISOString(),
    };

    this.developments.set(devId, record);
    return record;
  }

  /**
   * Updates properties or name of an existing development.
   */
  updateDevelopment(devId, updatedData) {
    const existing = this.developments.get(devId);
    if (!existing) {
      throw new Error(`Development '${devId}' not found.`);
    }

    const devType = updatedData.development_type || existing.development_type;
    const newProperties = updatedData.properties ? { ...updatedData.properties } : existing.properties;

    const validation = this.validateProperties(devType, newProperties);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    existing.development_type = devType;
    existing.name = updatedData.name || existing.name;
    existing.properties = newProperties;

    if (typeof updatedData.latitude === 'number') existing.latitude = updatedData.latitude;
    if (typeof updatedData.longitude === 'number') existing.longitude = updatedData.longitude;
    if (updatedData.zone_id) existing.zone_id = updatedData.zone_id;

    this.developments.set(devId, existing);
    return existing;
  }

  /**
   * Repositions an existing development (updates lat, lon, zone_id while preserving properties).
   */
  moveDevelopment(devId, latitude, longitude, zoneId) {
    const existing = this.developments.get(devId);
    if (!existing) {
      throw new Error(`Development '${devId}' not found.`);
    }

    existing.latitude = Number(latitude);
    existing.longitude = Number(longitude);
    existing.zone_id = zoneId;

    this.developments.set(devId, existing);
    return existing;
  }

  /**
   * Deletes a development by ID.
   */
  deleteDevelopment(devId) {
    return this.developments.delete(devId);
  }

  getDevelopment(devId) {
    return this.developments.get(devId);
  }

  getAllDevelopments() {
    return Array.from(this.developments.values());
  }

  clearAll() {
    this.developments.clear();
  }
}
