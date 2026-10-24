// Thin JSON client for the backend. Every mutating call carries the anti-CSRF header.

export class ApiError extends Error {
  constructor(status, message, detail) {
    super(message);
    this.status = status;
    this.detail = detail;
  }
}

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => (onUnauthorized = fn);

async function request(method, path, { body, bytes } = {}) {
  let res;
  try {
    res = await fetch(path, {
      method,
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": bytes ? "application/octet-stream" : "application/json", "X-Requested-With": "supervision" },
      body: bytes ?? (body === undefined ? undefined : JSON.stringify(body)),
    });
  } catch {
    throw new ApiError(0, "Ingen forbindelse til serveren. Er du offline?");
  }
  if (!res.ok) {
    let data = null;
    try {
      data = await res.json();
    } catch {
      /* empty body */
    }
    const detail = data?.detail;
    let msg = typeof detail === "string" ? detail : detail?.message;
    if (Array.isArray(detail)) msg = detail.map((d) => d.msg?.replace(/^Value error, /, "")).join(". ");
    if (res.status === 401 && !path.startsWith("/api/login") && !path.startsWith("/api/recover")
        && !path.startsWith("/api/password") && !path.startsWith("/api/account")) onUnauthorized();
    throw new ApiError(res.status, msg || `Fejl ${res.status}`, detail);
  }
  return res;
}

export async function api(method, path, body) {
  const res = await request(method, path, { body });
  try {
    return await res.json();
  } catch {
    return null;
  }
}

/** Binary upload (PUT with bytes) or download (GET returns Uint8Array). */
export async function apiBytes(method, path, bytes) {
  const res = await request(method, path, { bytes });
  return method === "GET" ? new Uint8Array(await res.arrayBuffer()) : res.json();
}
