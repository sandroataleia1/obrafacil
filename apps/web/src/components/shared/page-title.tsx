import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Standard "[ícone do módulo] [título]" page heading — the same pattern
 * every list page (Clientes, Obras, Materiais, ...) uses for its `<h1>`.
 * `icon` always comes from `nav-items.ts` (never a second, divergent
 * icon table) — see each page's usage for which `NavItem.icon` it passes.
 */
export function PageTitle({
  icon: Icon,
  children,
  className,
}: {
  icon: LucideIcon;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <h1
      className={cn(
        "flex items-center gap-2 text-2xl font-semibold tracking-tight text-foreground",
        className
      )}
    >
      <Icon className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      {children}
    </h1>
  );
}
