"use client";

import { useCallback, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { performLogoutRequest } from "./auth-client";
import { useAuth } from "./auth-provider";

export type LogoutButtonStatus = "idle" | "pending" | "error";

const LOGOUT_FAILURE_MESSAGE = "Não foi possível sair. Verifique sua conexão e tente novamente.";

/**
 * Single source of truth for the real logout side effects — calls the
 * backend (POST /api/v1/logout, with cookie + CSRF) via the resilient
 * `performLogoutRequest`, and only clears the React auth state / redirects
 * to /login when that flow actually confirms the server-side session is
 * gone (Gate FRONTEND-AUTH-01A §2-3).
 *
 * Unlike the previous version, a network error or a 5xx here does NOT
 * clear the session or navigate away — there is no proof the Laravel
 * session/HttpOnly cookie was destroyed, so pretending logout succeeded
 * would leave the user thinking they're signed out while the server still
 * considers them authenticated. `status`/`error` let the caller show a
 * retryable message instead; calling `performLogout()` again is the retry.
 */
export function usePerformLogout() {
  const router = useRouter();
  const auth = useAuth();
  const [status, setStatus] = useState<LogoutButtonStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const performLogout = useCallback(async () => {
    setStatus("pending");
    setError(null);

    const outcome = await performLogoutRequest();

    if (outcome === "signed-out") {
      setStatus("idle");
      auth.clearSession();
      router.replace("/login");
      return;
    }

    setStatus("error");
    setError(LOGOUT_FAILURE_MESSAGE);
  }, [auth, router]);

  return { performLogout, status, error };
}

/**
 * Renders `children` with the caller's own className so it can match
 * different "Sair" trigger styles without a second implementation of the
 * logout side effects themselves. Callers that want to surface a failure
 * message should read `status`/`error` from `usePerformLogout()` directly
 * (see `UserMenu`) instead of relying on this component alone.
 */
export function LogoutButton({ className, children }: { className?: string; children: ReactNode }) {
  const { performLogout } = usePerformLogout();

  return (
    <button type="button" onClick={() => void performLogout()} className={className}>
      {children}
    </button>
  );
}
