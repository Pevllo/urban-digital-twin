/**
 * Development Model Adapter for API Serialization & Backend Bridge
 */

export function adaptDevelopmentToPayload(devRecord, simulationHour = 8) {
  if (!devRecord) {
    throw new Error('No development scenario object provided.');
  }

  const { id, development_id, type, development_type, zone_id, properties, name } = devRecord;

  const devId = id || development_id;
  const devType = type || development_type;

  if (!devType || !zone_id) {
    throw new Error('Development scenario is missing required fields (type or zone_id).');
  }

  return {
    development_id: devId,
    development_type: devType,
    zone_id: zone_id,
    name: name || devId,
    properties: properties || {},
    simulation_hour: Number(simulationHour || devRecord.simulation_hour || 8),
  };
}
