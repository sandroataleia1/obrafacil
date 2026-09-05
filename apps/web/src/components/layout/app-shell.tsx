"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";

import { cn } from "@/lib/utils";
import { useDemoAuthSession } from "@/features/auth/use-demo-auth";
import { DesktopSidebar } from "./desktop-sidebar";
import { isFocusedFlowRoute } from "./focused-flow";
import { MobileBottomNav } from "./mobile-bottom-nav";

/**
 * Central guard for every route under the `(app)` group (Pilot-Ready
 * "Login de Demonstração" §8) — no per-page guard duplicated anywhere.
 * `/login` lives outside this route group entirely, so it is never
 * subject to this check. `session === undefined` (not yet read from
 * localStorage) and `session === null` (redirecting) both render
 * nothing, so an unauthenticated visitor never sees a flash of
 * protected content before the redirect fires.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { session } = useDemoAuthSession();
  const focused = isFocusedFlowRoute(pathname);

  useEffect(() => {
    if (session === null) {
      router.replace("/login");
    }
  }, [session, router]);

  if (session === undefined || session === null) return null;

  return (
    <div className="flex min-h-dvh">
      <DesktopSidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <main
          className={cn(
            "flex-1 md:pb-0",
            focused
              ? "pb-[env(safe-area-inset-bottom)]"
              : "pb-[calc(5rem+env(safe-area-inset-bottom))]"
          )}
        >
          <div className="mx-auto w-full max-w-xl px-4 py-6 sm:max-w-2xl sm:px-6 md:max-w-2xl md:px-10 md:py-12 lg:max-w-none lg:px-12 xl:px-16">
            {children}
          </div>
        </main>

        {focused ? null : <MobileBottomNav />}
      </div>
    </div>
  );
}
