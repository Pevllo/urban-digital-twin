import { fetchJson } from './client.js';
import { adaptDevelopmentToPayload } from '../models/devModelAdapter.js';

export async function runWhatIfSimulation(devRecord, simulationHour = 8) {
  const payload = adaptDevelopmentToPayload(devRecord, simulationHour);
  const startTime = performance.now();

  const result = await fetchJson('/api/simulate', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  const endTime = performance.now();
  const durationSeconds = ((endTime - startTime) / 1000.0).toFixed(2);

  result.execution_metadata = {
    execution_time_seconds: parseFloat(durationSeconds),
    timestamp: new Date().toISOString(),
  };

  return result;
}
