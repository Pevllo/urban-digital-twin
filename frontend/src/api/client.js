const API_BASE =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_BASE_URL) ||
  "http://localhost:8000";

export class ApiError extends Error {
  constructor(status, detail) {
    super(typeof detail === "string" ? detail : "Request failed");
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

async function handleResponse(res) {
  let body = null;
  try {
    body = await res.json();
  } catch {
    // non-JSON response
  }

  if (res.ok) {
    return body;
  }

  if (res.status === 422 && Array.isArray(body?.detail)) {
    const messages = body.detail
      .map((e) => e.msg || "Validation error")
      .join("; ");
    throw new ApiError(res.status, messages);
  }

  throw new ApiError(res.status, body?.detail || `Request failed (${res.status})`);
}

export async function request(path, { method = "GET", body, signal } = {}) {
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: body !== undefined ? { "Content-Type": "application/json" } : {},
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (err) {
    if (err.name === "AbortError") throw err;
    throw new ApiError(0, "Backend unavailable. Check that the server is running on " + API_BASE + ".");
  }

  return handleResponse(res);
}
