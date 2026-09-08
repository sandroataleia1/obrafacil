"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";

import { cn } from "@/lib/utils";
import { useDemoAuthSession } from "@/features/auth/use-demo-auth";
import { MIN_PAGE_SKELETON_MS } from "@/lib/min-duration";
import { DesktopSidebar } from "./desktop-sidebar";
import { isFocusedFlowRoute } from "./focused-flow";
import { MobileBottomNav } from "./mobile-bottom-nav";
import { DashboardSkeleton, DetailPageSkeleton, ListPageSkeleton } from "./page-skeletons";
import { Topbar } from "./topbar";

const LIST_ROUTES = new Set([
  "/obras",
  "/orcamentos",
  "/equipe",
  "/clientes",
  "/fornecedores",
  "/materiais",
  "/compras",
  "/estoque",
  "/financeiro/contas-a-pagar",
  "/financeiro/contas-a-receber",
]);

function PageSkeleton({ pathname }: { pathname: string }) {
  if (pathname === "/") return <DashboardSkeleton />;
  if (LIST_ROUTES.has(pathname)) return <ListPageSkeleton />;
  return <DetailPageSkeleton />;
}

/**
 * Central guard for every route under the `(app)` group (Pilot-Ready
 * "Login de Demonstração" §8) — no per-page guard duplicated anywhere.
 * `/login` lives outside this route group entirely, so it is never
 * subject to this check. `session === undefined` (not yet read from
 * localStorage) and `session === null` (redirecting) both render the
 * same route-appropriate Skeleton used for in-app navigation, instead
 * of a blank screen or a second, different loading style — internal
 * pages show exactly one kind of loading indicator (the skeleton).
 *
 * The skeleton-on-navigation logic also lives here rather than in
 * `app/(app)/template.tsx`: a route-group `template.tsx` only remounts
 * when the *top-level* segment right below it changes (per Next.js's
 * own template semantics), so a list→detail navigation like
 * `/obras` → `/obras/[id]` — the most common case in this app — never
 * remounted it and the skeleton silently never appeared. Tracking
 * `usePathname()` in this always-mounted wrapper instead reacts to
 * every navigation regardless of segment depth.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { session } = useDemoAuthSession();
  const focused = isFocusedFlowRoute(pathname);

  // `activePathname` lags one tick behind `pathname` on every
  // navigation (and starts `undefined` on mount) so the skeleton for
  // the new route is what appears first — never a flash of the old
  // page, and never a flash of the new page before the skeleton.
  const [activePathname, setActivePathname] = useState<string | undefined>(undefined);
  const transitioning = activePathname !== pathname;

  useEffect(() => {
    if (!transitioning) return;
    const timer = setTimeout(() => setActivePathname(pathname), MIN_PAGE_SKELETON_MS);
    return () => clearTimeout(timer);
  }, [pathname, transitioning]);

  useEffect(() => {
    if (session === null) {
      router.replace("/login");
    }
  }, [session, router]);

  if (session === undefined || session === null) {
    return (
      <div className="min-h-dvh bg-background px-4 py-6 sm:px-6 md:px-10 md:py-12 lg:px-12 xl:px-16">
        <div className="mx-auto w-full max-w-xl sm:max-w-2xl md:max-w-2xl lg:max-w-none">
          <PageSkeleton pathname={pathname} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh">
      <DesktopSidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar user={session.user} />

        <main
          className={cn(
            "flex-1 md:pb-0",
            focused
              ? "pb-[env(safe-area-inset-bottom)]"
              : "pb-[calc(5rem+env(safe-area-inset-bottom))]"
          )}
        >
          <div className="mx-auto w-full max-w-xl px-4 pt-4 pb-6 sm:max-w-2xl sm:px-6 sm:pt-5 md:max-w-2xl md:px-10 md:pt-6 md:pb-12 lg:max-w-none lg:px-12 xl:px-16">
            {transitioning ? <PageSkeleton pathname={pathname} /> : children}
          </div>
        </main>

        {focused ? null : <MobileBottomNav />}
      </div>
    </div>
  );
}
