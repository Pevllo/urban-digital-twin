import { request } from "./client.js";

export function runSimulation(payload, signal) {
  return request("/api/v1/scenarios/simulate", { method: "POST", body: payload, signal });
}
