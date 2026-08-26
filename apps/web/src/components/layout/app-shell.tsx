import type { ReactNode } from "react";

import { DesktopSidebar } from "./desktop-sidebar";
import { MobileBottomNav } from "./mobile-bottom-nav";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh">
      <DesktopSidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <main className="flex-1 pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-0">
          <div className="mx-auto w-full max-w-xl px-4 py-6 sm:max-w-2xl sm:px-6 md:px-10 md:py-12 lg:max-w-2xl">
            {children}
          </div>
        </main>

        <MobileBottomNav />
      </div>
    </div>
  );
}
