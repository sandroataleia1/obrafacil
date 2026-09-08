import type { DemoAuthUser } from "@/features/auth/demo-auth";
import { BrandLogo } from "./brand-logo";
import { UserMenu } from "./user-menu";

/**
 * Global shell chrome (Gate Shell "Topbar Global" §3/§5/§11) — belongs
 * to `AppShell`, never composed per-page. Carries only session/global
 * actions, never a page title: each page's own heading (via
 * `BackLink`/`PageHeader`-style patterns) still owns that job, so
 * there is no duplicated title between this bar and page content.
 *
 * The brand mark only appears here on mobile (`md:hidden`) — on
 * desktop it already lives in `DesktopSidebar`, so showing it twice
 * would be redundant chrome instead of a second entry point.
 */
export function Topbar({ user }: { user: DemoAuthUser }) {
  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center border-b border-border bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:px-6 md:px-10 lg:px-12 xl:px-16">
      <BrandLogo className="text-foreground md:hidden" />
      <div className="ml-auto">
        <UserMenu user={user} />
      </div>
    </header>
  );
}
