/**
 * Central HTTP API Client — AI Urban Digital Twin
 */

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

export async function fetchJson(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint}`;
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });

  if (!response.ok) {
    let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
    try {
      const errorJson = await response.json();
      if (errorJson && (errorJson.error || errorJson.detail)) {
        errorMessage = errorJson.error || errorJson.detail;
      }
    } catch (e) {
      // Non-JSON response
    }
    throw new Error(errorMessage);
  }

  return response.json();
}
