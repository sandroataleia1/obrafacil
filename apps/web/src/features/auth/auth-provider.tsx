"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { ApiError } from "@/lib/api-client";
import { fetchMe } from "./auth-client";
import type { AuthUser, CompanySummary, Membership, MePayload } from "./types";

export type AuthStatus = "loading" | "authenticated" | "unauthenticated" | "offline";

interface AuthState {
  status: AuthStatus;
  user: AuthUser | null;
  memberships: Membership[];
  activeCompany: CompanySummary | null;
  requiresCompanySelection: boolean;
}

interface AuthContextValue extends AuthState {
  /** Re-queries GET /api/v1/me — the backend remains the authority, this only refreshes the cached React state. */
  refresh: () => Promise<void>;
  /** Applies a MePayload received directly from login/register/activate, without a round-trip to /me. */
  setSession: (payload: MePayload) => void;
  /** Resets to the signed-out state after a successful logout. */
  clearSession: () => void;
}

const EMPTY_STATE: AuthState = {
  status: "loading",
  user: null,
  memberships: [],
  activeCompany: null,
  requiresCompanySelection: false,
};

const AuthContext = createContext<AuthContextValue | null>(null);

function payloadToState(payload: MePayload): AuthState {
  return {
    status: "authenticated",
    user: payload.user,
    memberships: payload.memberships,
    activeCompany: payload.active_company,
    requiresCompanySelection: payload.requires_company_selection,
  };
}

/**
 * Single client-side source of truth for the session (Gate FRONTEND-AUTH-01
 * §6). Initializes from GET /api/v1/me — the React state is a cache for the
 * duration of the page, never persisted to localStorage; the backend
 * session cookie remains the actual authority.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(EMPTY_STATE);

  const refresh = useCallback(async () => {
    try {
      const payload = await fetchMe();
      setState(payloadToState(payload));
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setState({ ...EMPTY_STATE, status: "unauthenticated" });
        return;
      }
      // Network error or unexpected server failure while resolving the
      // session — never silently treated as "logged out" (§30): a real
      // session must not appear to vanish just because the API is
      // temporarily unreachable.
      setState((previous) => ({ ...previous, status: "offline" }));
    }
  }, []);

  useEffect(() => {
    // Initial session bootstrap: reads external state (the backend
    // session) on mount, the same pattern already used for
    // localStorage-backed hooks elsewhere in this app.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  const setSession = useCallback((payload: MePayload) => {
    setState(payloadToState(payload));
  }, []);

  const clearSession = useCallback(() => {
    setState({ ...EMPTY_STATE, status: "unauthenticated" });
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ ...state, refresh, setSession, clearSession }),
    [state, refresh, setSession, clearSession]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
