"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";

import { clearDemoAuthSession } from "./demo-auth";

/**
 * Single source of truth for the demo logout side effects — removes
 * ONLY the demo auth session (never any operational data —
 * `projects`/`budgets`/`employees`/etc. are untouched) and redirects
 * to `/login`. Shared by every "Sair" trigger in the app (this
 * button, the `/mais` page, and the Topbar's `UserMenu`) so there is
 * never a second implementation to keep in sync.
 */
export function performDemoLogout(router: ReturnType<typeof useRouter>): void {
  clearDemoAuthSession();
  router.replace("/login");
}

/**
 * Renders `children` with the caller's own className so it can match
 * the mobile "Mais" page's list-row style without a second
 * implementation of the logout side effects themselves.
 */
export function LogoutButton({ className, children }: { className?: string; children: ReactNode }) {
  const router = useRouter();

  return (
    <button type="button" onClick={() => performDemoLogout(router)} className={className}>
      {children}
    </button>
  );
}
