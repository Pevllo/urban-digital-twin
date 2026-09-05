import { request } from "./client.js";

export function getAllBaselineTraffic(signal) {
  return request("/api/v1/traffic/baseline/all", { signal });
}

export function getRoadBaselineTraffic(osmWayId, signal) {
  return request(`/api/v1/traffic/baseline?osm_way_id=${encodeURIComponent(osmWayId)}`, { signal });
}
