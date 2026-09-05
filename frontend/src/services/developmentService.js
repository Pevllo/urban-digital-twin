import { createDevelopment, deleteDevelopment } from "../api/developments.js";

// The backend POST /api/v1/developments REQUIRES a development_id in the
// request (it returns 400 "development_id is required." otherwise) and does
// not auto-generate one. We therefore mint a stable UUID here at placement
// time. The backend persists it and echoes it back; the returned record's
// development_id is what the What-If simulation must reference (never a
// regenerated or frontend-only/temporary id).
function newDevelopmentId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `dev_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

// Build a DevelopmentSchema payload accepted by POST /api/v1/developments.
// Uses only backend-supported fields.
export function buildDevelopmentPayload({ type, name, latitude, longitude, floors, properties }) {
  return {
    development_id: newDevelopmentId(),
    development_type: type,
    name: name || "",
    latitude,
    longitude,
    floors: Number(floors) || 1,
    status: "proposed",
    properties,
  };
}

export async function placeDevelopment(payload) {
  return createDevelopment(payload);
}

export async function removeDevelopment(developmentId) {
  return deleteDevelopment(developmentId);
}
