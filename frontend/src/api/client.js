const BASE_URL = import.meta.env.VITE_API_URL ?? "";

const API_KEY_STORAGE = "budget_app_api_key";

class ApiError extends Error {
  constructor(message, status, detail) {
    super(message);
    this.status = status;
    this.detail = detail;
  }
}

export function getStoredApiKey() {
  return sessionStorage.getItem(API_KEY_STORAGE) || "";
}

export function setStoredApiKey(key) {
  if (key) {
    sessionStorage.setItem(API_KEY_STORAGE, key);
  } else {
    sessionStorage.removeItem(API_KEY_STORAGE);
  }
}

export function clearStoredApiKey() {
  sessionStorage.removeItem(API_KEY_STORAGE);
}

function authHeaders(extra = {}) {
  const key = getStoredApiKey();
  if (!key) return extra;
  return { ...extra, "X-API-Key": key };
}

async function request(path, options = {}) {
  const isFormData = options.body instanceof FormData;
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: isFormData
      ? authHeaders()
      : authHeaders({ "Content-Type": "application/json", ...options.headers }),
    ...options,
  });

  if (res.status === 401) {
    clearStoredApiKey();
    window.dispatchEvent(new Event("budget-app-unauthorized"));
  }

  if (!res.ok) {
    let detail = null;
    try {
      const data = await res.json();
      detail = data.detail;
    } catch {
      // ignore
    }
    const message =
      typeof detail === "string"
        ? detail
        : detail?.message || `Request failed (${res.status})`;
    throw new ApiError(message, res.status, detail);
  }

  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return res.json();
  }
  return res;
}

export const api = {
  get: (path) => request(path),
  post: (path, body) =>
    request(path, {
      method: "POST",
      body: body ? JSON.stringify(body) : undefined,
    }),
  postForm: (path, formData) =>
    request(path, { method: "POST", body: formData }),
  put: (path, body) =>
    request(path, { method: "PUT", body: JSON.stringify(body) }),
  del: (path) => request(path, { method: "DELETE" }),
};

export { ApiError, BASE_URL };
