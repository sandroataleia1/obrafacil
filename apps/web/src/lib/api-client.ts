/**
 * Central HTTP client for the Laravel API (Sanctum SPA: cookie session +
 * CSRF, never a Bearer token or a token in localStorage/sessionStorage).
 * Every authenticated request goes through here — no component reads
 * `NEXT_PUBLIC_API_URL` or the `XSRF-TOKEN` cookie directly.
 */

/**
 * No fallback to a `localhost` default (Gate FRONTEND-AUTH-01A §5/§15):
 * a production build with a forgotten/missing `NEXT_PUBLIC_API_URL` must
 * fail loudly at first use, never silently ship a bundle that quietly
 * tries to reach the *browser's own* localhost. Evaluated once at module
 * load — the same place the old fallback lived — so the failure surfaces
 * as early as possible instead of deep inside some unrelated request.
 */
function resolveApiUrl(): string {
  const raw = process.env.NEXT_PUBLIC_API_URL;

  if (!raw || raw.trim() === "") {
    throw new Error(
      "NEXT_PUBLIC_API_URL is not configured. Set it explicitly (e.g. apps/web/.env.local for " +
        "local development, or as a build-time env var for a real deployment) — there is no " +
        "default/fallback API host."
    );
  }

  return raw.trim().replace(/\/+$/, "");
}

const API_URL = resolveApiUrl();

export class ApiValidationError extends Error {
  readonly status = 422 as const;
  readonly errors: Record<string, string[]>;
  /**
   * PROPOSAL-DOC-01B §10: the raw top-level `message` Laravel sent
   * alongside this 422 — e.g. "A logo cadastrada da empresa não está
   * disponível...". `errors` alone loses this whenever the 422 carries
   * no per-field validation errors (a controlled business-rule 422, not
   * a form validation failure). `null` when the response had no
   * top-level `message` at all. Existing callers that only read
   * `errors` are unaffected — this is purely additive.
   */
  readonly serverMessage: string | null;

  constructor(errors: Record<string, string[]>, serverMessage: string | null = null) {
    super("Validation failed");
    this.name = "ApiValidationError";
    this.errors = errors;
    this.serverMessage = serverMessage;
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
 *
 * The response is checked explicitly (Gate FRONTEND-AUTH-01A §7/§8): a
 * non-2xx response here (404/419/429/500/503/...) is a real, distinct
 * failure — never silently treated as "CSRF is now ready". A server error
 * (`ApiError`) must never be reported as a network error (`ApiNetworkError`)
 * or vice versa; the caller (and the user-facing message it picks) depends
 * on knowing which one actually happened.
 */
export async function ensureCsrfCookie(): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}/sanctum/csrf-cookie`, {
      credentials: "include",
      headers: { Accept: "application/json" },
    });
  } catch {
    throw new ApiNetworkError();
  }

  if (!response.ok) {
    throw new ApiError(response.status, `Failed to initialize CSRF (status ${response.status})`);
  }
}

interface ApiRequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** A plain JSON-serializable value, or a `FormData` for multipart
   * (file upload) requests — see FRONTEND-COMPANY-PROFILE-01 §6-8. */
  body?: unknown;
}

/**
 * PROPOSAL-DOC-01B §6-7: the ONE transport both `apiRequest` (JSON) and
 * `apiBlobRequest` (binary) go through — same `API_URL`, `credentials:
 * "include"`, and network-error mapping, so the two can never diverge.
 * Never throws an `ApiError`/`ApiValidationError` itself — callers
 * inspect the returned `Response` and decide how to parse a non-2xx
 * body (JSON error body either way, even for a PDF endpoint — §9).
 */
async function sendRequest(
  path: string,
  options: { method: string; headers: Record<string, string>; body?: BodyInit }
): Promise<Response> {
  try {
    return await fetch(`${API_URL}${path}`, {
      method: options.method,
      credentials: "include",
      headers: options.headers,
      body: options.body,
    });
  } catch {
    throw new ApiNetworkError();
  }
}

function parseValidationErrorBody(data: unknown): ApiValidationError {
  const errors =
    typeof data === "object" && data !== null && "errors" in data
      ? ((data as { errors?: Record<string, string[]> }).errors ?? {})
      : {};
  const message =
    typeof data === "object" && data !== null && "message" in data
      ? String((data as { message?: unknown }).message ?? "") || null
      : null;
  return new ApiValidationError(errors, message);
}

function parseApiErrorMessage(data: unknown, status: number): string {
  const message =
    typeof data === "object" && data !== null && "message" in data
      ? String((data as { message?: unknown }).message ?? "")
      : "";
  return message || `Request failed with status ${status}`;
}

/**
 * Shared non-2xx handling for both `apiRequest` and `apiBlobRequest`
 * (§9): even on a binary (PDF) endpoint, Laravel's error responses
 * (404/429/500/...) are JSON — this always parses the body as JSON
 * error data, never attempts to treat it as the binary payload.
 */
async function throwForNonOkResponse(response: Response): Promise<never> {
  if (response.status === 422) {
    const data: unknown = await response.json().catch(() => ({}));
    throw parseValidationErrorBody(data);
  }
  const data: unknown = await response.json().catch(() => ({}));
  throw new ApiError(response.status, parseApiErrorMessage(data, response.status));
}

/**
 * §8: a safe, SSR-proof way to tell a `FormData` body apart from a JSON
 * one. `typeof FormData !== "undefined"` guards the check itself (no
 * module-scope browser-only access — this runs inside the function, at
 * call time, never at import time), and `instanceof` never throws even
 * when `FormData` doesn't exist as a global (short-circuited by the
 * `typeof` check first).
 */
function isFormDataBody(body: unknown): body is FormData {
  return typeof FormData !== "undefined" && body instanceof FormData;
}

/**
 * @throws {ApiValidationError} on 422
 * @throws {ApiError} on 401/403/404/409/419/429/5xx (and anything else non-OK),
 *   including when CSRF initialization itself fails for a mutating request —
 *   the request is never attempted in that case (Gate FRONTEND-AUTH-01A §9).
 * @throws {ApiNetworkError} when a request never reached the server
 */
export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const method = options.method ?? "GET";
  const isMutating = method !== "GET";
  const isFormData = isFormDataBody(options.body);

  if (isMutating) {
    // Throws (ApiError or ApiNetworkError) on failure, which propagates
    // straight out of apiRequest — the mutating fetch below never runs.
    await ensureCsrfCookie();
  }

  const headers: Record<string, string> = { Accept: "application/json" };
  // §7: a FormData body NEVER gets a manual Content-Type — the browser
  // sets `multipart/form-data; boundary=...` itself when it sees the
  // fetch `body` is a FormData instance. Setting it here would omit the
  // boundary and the server could never parse the multipart body.
  if (options.body !== undefined && !isFormData) {
    headers["Content-Type"] = "application/json";
  }
  if (isMutating) {
    const token = readCookie("XSRF-TOKEN");
    if (token) headers["X-XSRF-TOKEN"] = token;
  }

  const response = await sendRequest(path, {
    method,
    headers,
    body: isFormData
      ? (options.body as FormData)
      : options.body !== undefined
        ? JSON.stringify(options.body)
        : undefined,
  });

  if (response.status === 204) {
    return undefined as T;
  }

  if (!response.ok) {
    await throwForNonOkResponse(response);
  }

  return response.json() as Promise<T>;
}

interface ApiBlobRequestOptions {
  method?: "GET";
}

/**
 * PROPOSAL-DOC-01B §6-9: the binary counterpart of `apiRequest`, for the
 * PDF endpoints (authenticated preview and public token-based). Both are
 * GET, so this never calls `ensureCsrfCookie()` (§8 — GET needs no CSRF)
 * and never sends a Bearer token or any auth header of its own —
 * authenticated access relies solely on `credentials: "include"` (the
 * session cookie), exactly like every other request through this client;
 * the public PDF endpoint simply doesn't require a session at all.
 *
 * @throws {ApiValidationError} on 422 (never expected for a GET, kept
 *   for symmetry with `apiRequest`'s error contract)
 * @throws {ApiError} on 404/429/5xx/... — the response body is JSON
 *   even here (§9): a Laravel error page for a binary route is never
 *   mistaken for a corrupted PDF blob.
 * @throws {ApiNetworkError} when the request never reached the server
 */
export async function apiBlobRequest(path: string, options: ApiBlobRequestOptions = {}): Promise<Blob> {
  const method = options.method ?? "GET";
  const response = await sendRequest(path, { method, headers: { Accept: "application/pdf" } });

  if (!response.ok) {
    await throwForNonOkResponse(response);
  }

  return response.blob();
}
