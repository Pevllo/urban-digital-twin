import { request } from "./client.js";

export function listDevelopments(signal) {
  return request("/api/v1/developments", { signal });
}

export function getDevelopment(id) {
  return request(`/api/v1/developments/${encodeURIComponent(id)}`);
}

export function createDevelopment(payload) {
  return request("/api/v1/developments", { method: "POST", body: payload });
}

export function updateDevelopment(id, payload) {
  return request(`/api/v1/developments/${encodeURIComponent(id)}`, { method: "PUT", body: payload });
}

export function deleteDevelopment(id) {
  return request(`/api/v1/developments/${encodeURIComponent(id)}`, { method: "DELETE" });
}
