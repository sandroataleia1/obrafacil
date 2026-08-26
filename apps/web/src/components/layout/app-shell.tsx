"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import { DesktopSidebar } from "./desktop-sidebar";
import { isFocusedFlowRoute } from "./focused-flow";
import { MobileBottomNav } from "./mobile-bottom-nav";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const focused = isFocusedFlowRoute(pathname);

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
          <div className="mx-auto w-full max-w-xl px-4 py-6 sm:max-w-2xl sm:px-6 md:px-10 md:py-12 lg:max-w-2xl">
            {children}
          </div>
        </main>

        {focused ? null : <MobileBottomNav />}
      </div>
    </div>
  );
}
