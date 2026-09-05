// Dynamic development form field configuration.
// Only fields supported by the backend DevelopmentPropertiesSchema are rendered.
// Source of truth: docs/API_CONTRACT.md (Development Properties Reference) and
// backend/api/schemas/development_schema.py.

export const PROPERTY_FIELDS = {
  num_residents: {
    label: "Residents",
    unit: "persons",
    type: "number",
    min: 0,
    step: 1,
  },
  num_units: {
    label: "Dwelling Units",
    unit: "units",
    type: "number",
    min: 0,
    step: 1,
  },
  num_beds: {
    label: "Beds",
    unit: "beds",
    type: "number",
    min: 0,
    step: 1,
  },
  staff_count: {
    label: "Staff",
    unit: "staff",
    type: "number",
    min: 0,
    step: 1,
  },
  num_students: {
    label: "Students",
    unit: "students",
    type: "number",
    min: 0,
    step: 1,
  },
  num_employees: {
    label: "Employees",
    unit: "employees",
    type: "number",
    min: 0,
    step: 1,
  },
  gross_leasable_area_sqm: {
    label: "Gross Leasable Area",
    unit: "m²",
    type: "number",
    min: 0,
    step: 1,
  },
  visitor_capacity: {
    label: "Visitor Capacity",
    unit: "persons",
    type: "number",
    min: 0,
    step: 1,
  },
  gross_floor_area_sqm: {
    label: "Gross Floor Area",
    unit: "m²",
    type: "number",
    min: 0,
    step: 1,
  },
};

// Development fields common to all types (on DevelopmentSchema, not properties).
export const DEVELOPMENT_SCHEMA_FIELDS = {
  name: {
    label: "Development Name",
    type: "text",
    placeholder: "e.g. Al-Fardous Residential Compound",
    optional: true,
  },
  floors: {
    label: "Floors",
    type: "number",
    min: 1,
    max: 200,
    step: 1,
    default: 5,
  },
};

// Which properties are relevant for each canonical development type.
// These reflect the semantic role of the field for that type, so the form
// stays uncluttered without inventing validation rules.
export const TYPE_PROPERTY_MAP = {
  residential_compound: ["num_residents", "num_units", "gross_floor_area_sqm"],
  hospital: ["num_beds", "staff_count", "gross_floor_area_sqm"],
  mall: ["gross_leasable_area_sqm", "visitor_capacity", "staff_count"],
  school: ["num_students", "staff_count", "gross_floor_area_sqm"],
  office: ["num_employees", "gross_leasable_area_sqm"],
  mixed_use: ["num_residents", "num_units", "num_employees", "gross_leasable_area_sqm"],
};

export function getFieldsForType(type) {
  const propertyKeys = TYPE_PROPERTY_MAP[type] || [];
  return {
    schemaFields: [
      "name",
      "floors",
    ],
    propertyFields: propertyKeys,
  };
}
