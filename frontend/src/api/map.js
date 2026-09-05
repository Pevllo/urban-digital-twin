import { request } from "./client.js";

export function getMapConfig(signal) {
  return request("/api/v1/map/config", { signal });
}
