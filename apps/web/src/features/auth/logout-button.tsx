"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";

import { logout } from "./auth-client";
import { useAuth } from "./auth-provider";

/**
 * Single source of truth for the real logout side effects — calls the
 * backend (POST /api/v1/logout, with cookie + CSRF), clears the React auth
 * state, and redirects to /login. Shared by every "Sair" trigger in the
 * app so there is never a second implementation to keep in sync.
 *
 * If the backend call itself fails (session already expired, network
 * error), the UX still ends up signed out client-side and at /login —
 * there is no world where clicking "Sair" leaves the user stuck looking
 * authenticated.
 */
export function usePerformLogout() {
  const router = useRouter();
  const auth = useAuth();

  return async function performLogout() {
    try {
      await logout();
    } catch {
      // Already unauthenticated (e.g. session expired) or unreachable —
      // either way, the local state below still ends up signed out.
    }
    auth.clearSession();
    router.replace("/login");
  };
}

/**
 * Renders `children` with the caller's own className so it can match
 * different "Sair" trigger styles without a second implementation of the
 * logout side effects themselves.
 */
export function LogoutButton({ className, children }: { className?: string; children: ReactNode }) {
  const performLogout = usePerformLogout();

  return (
    <button type="button" onClick={() => void performLogout()} className={className}>
      {children}
    </button>
  );
}
