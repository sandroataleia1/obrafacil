"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";

import { clearDemoAuthSession } from "./demo-auth";

/**
 * Removes ONLY the demo auth session (never any operational data —
 * `projects`/`budgets`/`employees`/etc. are untouched) and redirects
 * to `/login`. Renders `children` with the caller's own className so
 * it can match the desktop sidebar's nav-link style and the mobile
 * "Mais" page's list-row style without a second implementation of
 * either.
 */
export function LogoutButton({ className, children }: { className?: string; children: ReactNode }) {
  const router = useRouter();

  function handleLogout() {
    clearDemoAuthSession();
    router.replace("/login");
  }

  return (
    <button type="button" onClick={handleLogout} className={className}>
      {children}
    </button>
  );
}
