"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";

import { cn } from "@/lib/utils";
import { useAuth } from "@/features/auth/auth-provider";
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

function SkeletonShell({ pathname }: { pathname: string }) {
  return (
    <div className="min-h-dvh bg-background px-4 py-6 sm:px-6 md:px-10 md:py-12 lg:px-12 xl:px-16">
      <div className="mx-auto w-full max-w-xl sm:max-w-2xl md:max-w-2xl lg:max-w-none">
        <PageSkeleton pathname={pathname} />
      </div>
    </div>
  );
}

function OfflineShell({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-6">
      <div className="w-full max-w-sm space-y-4 text-center">
        <p role="alert" className="text-sm text-muted-foreground">
          Não foi possível conectar ao servidor.
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Tentar novamente
        </button>
      </div>
    </div>
  );
}

/**
 * Central guard for every route under the `(app)` group (Gate
 * FRONTEND-AUTH-01 §22) — no per-page guard duplicated anywhere. `/login`,
 * `/cadastro` and `/selecionar-empresa` live outside this route group
 * entirely, so they are never subject to this check.
 *
 * Rules, in order:
 *   - loading            -> skeleton, never private content, never a
 *                           redirect fired prematurely.
 *   - offline             -> a controlled "couldn't connect" screen with a
 *                           retry action — never silently treated as
 *                           logged out (an unreachable API is not the same
 *                           thing as an invalid session).
 *   - unauthenticated     -> redirect to /login.
 *   - requiresCompanySelection -> redirect to /selecionar-empresa.
 *   - authenticated + active company -> the app shell renders normally.
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
  const auth = useAuth();
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
    if (auth.status === "unauthenticated") {
      router.replace("/login");
      return;
    }
    if (auth.status === "authenticated" && auth.requiresCompanySelection) {
      router.replace("/selecionar-empresa");
    }
  }, [auth, router]);

  if (auth.status === "offline") {
    return <OfflineShell onRetry={() => auth.refresh()} />;
  }

  if (
    auth.status === "loading" ||
    auth.status === "unauthenticated" ||
    (auth.status === "authenticated" && auth.requiresCompanySelection)
  ) {
    return <SkeletonShell pathname={pathname} />;
  }

  return (
    <div className="flex min-h-dvh">
      <DesktopSidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />

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
