import { request } from "./client.js";

export function getHealth(signal) {
  return request("/health", { signal });
}

export function getCityInfo(signal) {
  return request("/api/v1/city/info", { signal });
}
