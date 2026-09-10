import { apiRequest, ApiError } from "@/lib/api-client";
import type { MePayload } from "./types";

export interface RegisterPayload {
  company_name: string;
  name: string;
  email: string;
  phone: string;
  password: string;
  password_confirmation: string;
}

export function fetchMe(): Promise<MePayload> {
  return apiRequest<MePayload>("/api/v1/me");
}

export function login(email: string, password: string): Promise<MePayload> {
  return apiRequest<MePayload>("/api/v1/login", { method: "POST", body: { email, password } });
}

export function register(payload: RegisterPayload): Promise<MePayload> {
  return apiRequest<MePayload>("/api/v1/register", { method: "POST", body: payload });
}

export function logout(): Promise<void> {
  return apiRequest<void>("/api/v1/logout", { method: "POST" });
}

export function activateCompany(companyId: string): Promise<MePayload> {
  return apiRequest<MePayload>(`/api/v1/companies/${encodeURIComponent(companyId)}/activate`, {
    method: "POST",
  });
}

export type LogoutOutcome = "signed-out" | "failed";

type LogoutAttempt = { ok: true } | { ok: false; status: number | "network" };

async function attemptLogoutOnce(): Promise<LogoutAttempt> {
  try {
    await logout();
    return { ok: true };
  } catch (error) {
    if (error instanceof ApiError) {
      return { ok: false, status: error.status };
    }
    // ApiValidationError never applies to logout; anything else here is a
    // network failure (ApiNetworkError, or a genuinely unexpected throw).
    return { ok: false, status: "network" };
  }
}

/**
 * The resilient logout flow (Gate FRONTEND-AUTH-01A §2-4). The frontend
 * can never be sure the server actually destroyed the session/cookie
 * unless it has real evidence — a 204 from /logout, or a 401 (from /logout
 * itself, or from a follow-up /me check) proving no session exists
 * server-side. Everything else — network error, 5xx, a 419 that survives
 * one CSRF-refresh retry — must report "failed", never "signed-out".
 *
 * @returns "signed-out" only when the caller may safely clear the local
 *   session state; "failed" otherwise (the caller must leave the user
 *   authenticated and show a retryable error).
 */
export async function performLogoutRequest(): Promise<LogoutOutcome> {
  const first = await attemptLogoutOnce();

  if (first.ok) {
    return "signed-out";
  }

  if (first.status === 401) {
    // The server itself confirms there is no session to log out of.
    return "signed-out";
  }

  if (first.status === 419) {
    // logout() -> apiRequest already fetches a fresh CSRF cookie before
    // every mutating call, so simply retrying is the "renew CSRF + retry
    // once" the spec asks for.
    const retry = await attemptLogoutOnce();

    if (retry.ok || retry.status === 401) {
      return "signed-out";
    }

    // Still failing (419 again, network, 5xx, ...) — never guess. Ask the
    // server directly which state is real, and never loop past this.
    try {
      await fetchMe();
      // 200: the user is still authenticated server-side — logout truly
      // did not happen, no matter how it looks locally.
      return "failed";
    } catch (meError) {
      if (meError instanceof ApiError && meError.status === 401) {
        return "signed-out";
      }
      return "failed";
    }
  }

  // Network error or 5xx on the very first attempt — never fabricate a
  // "signed out" result from a request that may not have reached the
  // server at all.
  return "failed";
}
