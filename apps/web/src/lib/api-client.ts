/**
 * Central HTTP client for the Laravel API (Sanctum SPA: cookie session +
 * CSRF, never a Bearer token or a token in localStorage/sessionStorage).
 * Every authenticated request goes through here — no component reads
 * `NEXT_PUBLIC_API_URL` or the `XSRF-TOKEN` cookie directly.
 */

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000").replace(/\/+$/, "");

export class ApiValidationError extends Error {
  readonly status = 422 as const;
  readonly errors: Record<string, string[]>;

  constructor(errors: Record<string, string[]>) {
    super("Validation failed");
    this.name = "ApiValidationError";
    this.errors = errors;
  }
}

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/** A request that never reached the server (offline, DNS failure, CORS, timeout, ...). */
export class ApiNetworkError extends Error {
  constructor() {
    super("Network error");
    this.name = "ApiNetworkError";
  }
}

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]!) : null;
}

/**
 * Required before any mutating request (login/register/logout/activate) —
 * establishes the session cookie and the XSRF-TOKEN cookie the next
 * request reads from. Safe to call repeatedly: Laravel just reissues the
 * same session's token.
 */
export async function ensureCsrfCookie(): Promise<void> {
  try {
    await fetch(`${API_URL}/sanctum/csrf-cookie`, {
      credentials: "include",
      headers: { Accept: "application/json" },
    });
  } catch {
    throw new ApiNetworkError();
  }
}

interface ApiRequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
}

/**
 * @throws {ApiValidationError} on 422
 * @throws {ApiError} on 401/403/404/409/419/429/5xx (and anything else non-OK)
 * @throws {ApiNetworkError} when the request never reached the server
 */
export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const method = options.method ?? "GET";
  const isMutating = method !== "GET";

  if (isMutating) {
    await ensureCsrfCookie();
  }

  const headers: Record<string, string> = { Accept: "application/json" };
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (isMutating) {
    const token = readCookie("XSRF-TOKEN");
    if (token) headers["X-XSRF-TOKEN"] = token;
  }

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      credentials: "include",
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new ApiNetworkError();
  }

  if (response.status === 204) {
    return undefined as T;
  }

  if (response.status === 422) {
    const data: unknown = await response.json().catch(() => ({}));
    const errors =
      typeof data === "object" && data !== null && "errors" in data
        ? ((data as { errors?: Record<string, string[]> }).errors ?? {})
        : {};
    throw new ApiValidationError(errors);
  }

  if (!response.ok) {
    const data: unknown = await response.json().catch(() => ({}));
    const message =
      typeof data === "object" && data !== null && "message" in data
        ? String((data as { message?: unknown }).message ?? "")
        : "";
    throw new ApiError(response.status, message || `Request failed with status ${response.status}`);
  }

  return response.json() as Promise<T>;
}
