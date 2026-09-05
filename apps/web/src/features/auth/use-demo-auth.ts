"use client";

import { useEffect, useState } from "react";

import { clearDemoAuthSession, getDemoAuthSession, type DemoAuthSession } from "./demo-auth";

/**
 * `undefined` while the session hasn't been read yet (avoids a
 * hydration mismatch — same post-mount-read pattern as
 * `useProject`/`useEmployees`), `null` when there is no session.
 */
export function useDemoAuthSession() {
  const [session, setSession] = useState<DemoAuthSession | null | undefined>(undefined);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSession(getDemoAuthSession());
  }, []);

  function logout() {
    clearDemoAuthSession();
    setSession(null);
  }

  return { session, logout };
}
