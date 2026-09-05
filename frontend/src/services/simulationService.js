// Build the SimulationRequestSchema payload for POST /api/v1/scenarios/simulate.
// development_id and development_type are required; latitude/longitude resolve the zone.
// development_id MUST come from the backend-persisted development (the record
// returned by POST /api/v1/developments and held in state.development.placed or state.developments.selected).
// It is never regenerated or synthesized here.
export function buildSimulationPayload(development, location, selectedDev = null) {
  const dev = development.placed || selectedDev || {};
  const persistedId = dev.development_id || dev.id || null;
  const devType = dev.development_type || dev.type || development.type;
  return {
    development_id: persistedId,
    development_type: devType,
    zone_id: dev.zone_id || "",
    name: development.name || dev.name || "",
    properties:
      development.properties && Object.keys(development.properties).length > 0
        ? development.properties
        : dev.properties || {},
    simulation_hour: 8,
    latitude: location?.latitude ?? dev.latitude,
    longitude: location?.longitude ?? dev.longitude,
  };
}
