/**
 * What-If Simulation Service — AI Urban Digital Twin
 *
 * Connects frontend development scenario to the backend Python mobility simulator
 * via POST /api/simulate bridge.
 */

export async function runWhatIfSimulation(devRecord, simulationHour = 8) {
  if (!devRecord) {
    throw new Error('No development scenario selected.');
  }

  const { development_type, zone_id, properties, name, development_id } = devRecord;

  if (!development_type || !zone_id) {
    throw new Error('Development scenario is missing required fields (type or zone_id).');
  }

  if (!properties || typeof properties !== 'object' || Object.keys(properties).length === 0) {
    throw new Error('Development scenario has invalid or missing properties.');
  }

  const payload = {
    development_id,
    development_type,
    zone_id,
    name: name || development_id,
    properties,
    simulation_hour: Number(simulationHour),
  };

  const startTime = performance.now();

  const response = await fetch('/api/simulate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const endTime = performance.now();
  const durationSeconds = ((endTime - startTime) / 1000.0).toFixed(2);

  if (!response.ok) {
    let errMessage = `Simulation failed with HTTP status ${response.status}`;
    try {
      const errJson = await response.json();
      if (errJson && errJson.error) {
        errMessage = errJson.error;
      }
    } catch (e) {
      // Not JSON error
    }
    throw new Error(errMessage);
  }

  const result = await response.json();

  if (result.error) {
    throw new Error(result.error);
  }

  // Attach execution metadata
  result.execution_metadata = {
    execution_time_seconds: parseFloat(durationSeconds),
    timestamp: new Date().toISOString(),
  };

  return result;
}
