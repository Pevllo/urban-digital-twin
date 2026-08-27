/**
 * Single Canonical Development Data Model — AI Urban Digital Twin
 *
 * Used uniformly across:
 * - Development UI & Cards
 * - Placement System
 * - Buildability Engine
 * - 3D Renderer (Cesium)
 * - Scenario State
 * - Backend / Simulation Engine
 */

export const SUPPORTED_DEV_TYPES = {
  residential_compound: {
    label: 'Residential Compound',
    icon: '🏠',
    color: '#3b82f6',
    defaultName: 'Proposed Residential Compound',
    defaultDimensions: { width: 90, length: 90, height: 18, floors: 6 },
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
    defaultDimensions: { width: 85, length: 65, height: 24, floors: 8 },
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
    defaultDimensions: { width: 140, length: 110, height: 15, floors: 4 },
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
    defaultDimensions: { width: 95, length: 70, height: 12, floors: 3 },
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
    defaultDimensions: { width: 55, length: 55, height: 45, floors: 12 },
    propertyFields: [
      { key: 'num_employees', label: 'Number of Employees', type: 'number', default: 2000, required: true },
      { key: 'gross_floor_area_sqm', label: 'Gross Floor Area (m²)', type: 'number', default: 35000, required: false },
    ],
  },
  hotel: {
    label: 'Hotel Complex',
    icon: '🏨',
    color: '#f97316',
    defaultName: 'Proposed Hotel Complex',
    defaultDimensions: { width: 75, length: 60, height: 36, floors: 10 },
    propertyFields: [
      { key: 'num_rooms', label: 'Number of Rooms', type: 'number', default: 250, required: true },
      { key: 'staff_count', label: 'Staff Count', type: 'number', default: 180, required: false },
    ],
  },
  mixed_use: {
    label: 'Mixed-Use Center',
    icon: '🏢',
    color: '#10b981',
    defaultName: 'Proposed Mixed-Use Development',
    defaultDimensions: { width: 100, length: 80, height: 28, floors: 8 },
    propertyFields: [
      { key: 'gross_floor_area_sqm', label: 'Gross Floor Area (m²)', type: 'number', default: 30000, required: true },
      { key: 'num_residents', label: 'Residents Capacity', type: 'number', default: 1500, required: false },
    ],
  },
};

/**
 * Creates a normalized development model instance.
 */
export function createDevelopmentModel(raw) {
  const typeKey = raw.development_type || raw.type || 'residential_compound';
  const spec = SUPPORTED_DEV_TYPES[typeKey] || SUPPORTED_DEV_TYPES.residential_compound;
  const props = raw.properties || {};

  // Compute procedural dimensions from user properties if custom calculation defined
  let width = spec.defaultDimensions.width;
  let length = spec.defaultDimensions.length;
  let height = spec.defaultDimensions.height;
  let floors = spec.defaultDimensions.floors;

  if (typeKey === 'residential_compound') {
    const scale = Math.max(0.7, Math.min(2.0, (props.num_residents || 5000) / 5000));
    width = Math.round(90 * scale);
    length = Math.round(90 * scale);
    height = Math.round(18 * Math.pow(scale, 0.5));
    floors = Math.max(2, Math.round(height / 3));
  } else if (typeKey === 'hospital') {
    const scale = Math.max(0.7, Math.min(2.2, (props.num_beds || 300) / 300));
    width = Math.round(85 * scale);
    length = Math.round(65 * scale);
    height = Math.round(24 * Math.pow(scale, 0.5));
    floors = Math.max(3, Math.round(height / 3));
  } else if (typeKey === 'mall') {
    const scale = Math.max(0.6, Math.min(2.2, (props.gross_leasable_area_sqm || 25000) / 25000));
    width = Math.round(140 * scale);
    length = Math.round(110 * scale);
    height = Math.round(15 * Math.pow(scale, 0.4));
    floors = Math.max(2, Math.round(height / 3.5));
  } else if (typeKey === 'school') {
    const scale = Math.max(0.7, Math.min(2.0, (props.num_students || 1500) / 1500));
    width = Math.round(95 * scale);
    length = Math.round(70 * scale);
    height = Math.round(12 * Math.pow(scale, 0.5));
    floors = Math.max(2, Math.round(height / 3));
  } else if (typeKey === 'office') {
    const scale = Math.max(0.7, Math.min(2.2, (props.num_employees || 2000) / 2000));
    width = Math.round(55 * scale);
    length = Math.round(55 * scale);
    height = Math.round(45 * Math.pow(scale, 0.6));
    floors = Math.max(4, Math.round(height / 3.5));
  }

  const area = width * length;

  const id = raw.id || raw.development_id || 'DEV-000';

  return {
    id,
    development_id: id,
    type: typeKey,
    development_type: typeKey,
    name: raw.name || `${spec.label} ${id}`,
    latitude: Number(raw.latitude || 0),
    longitude: Number(raw.longitude || 0),
    height: Number(height),
    x: Number(raw.x || 0),
    y: Number(raw.y || 0),
    z: Number(raw.z || 0),
    area,
    footprint: { width, length },
    floors,
    buildingHeight: height,
    orientation: Number(raw.orientation || props.orientation || 0),
    capacity: props.num_residents || props.num_beds || props.visitor_capacity || props.num_students || props.num_employees || 0,
    residents: props.num_residents || 0,
    jobs: props.num_employees || props.staff_count || 0,
    parking: Math.round(area / 100),
    trafficGeneration: 0,
    status: raw.status || 'proposed',
    zone_id: raw.zone_id || 'unresolved',
    properties: { ...props },
    simulation_hour: Number(raw.simulation_hour || 8),
    created_at: raw.created_at || new Date().toISOString(),
  };
}
