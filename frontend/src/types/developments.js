// Canonical development types and their accepted aliases.
// Source of truth: backend/api/schemas/development_schema.py (ACCEPTED_DEVELOPMENT_TYPES)
// and the frozen API contract (docs/API_CONTRACT.md).

export const DEVELOPMENT_TYPES = [
  {
    value: "residential_compound",
    label: "Residential Compound",
    description: "Housing / residential community",
  },
  {
    value: "hospital",
    label: "Hospital",
    description: "Healthcare facility",
  },
  {
    value: "mall",
    label: "Mall",
    description: "Commercial / retail",
  },
  {
    value: "school",
    label: "School",
    description: "Educational institution",
  },
  {
    value: "office",
    label: "Office",
    description: "Commercial workspace",
  },
];

// Accepted aliases resolved by the backend.
export const DEVELOPMENT_TYPE_ALIASES = {
  residential: "residential_compound",
  hotel: "residential_compound",
  commercial: "mall",
  retail: "mall",
};

// Backend persists the value (canonical form is recommended).
export const DEFAULT_DEVELOPMENT_TYPE = "residential_compound";
