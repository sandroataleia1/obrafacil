"use client";

import Link from "next/link";
import { ChevronLeft, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

interface BackLinkContentProps {
  title: string;
  description?: string;
  step?: { current: number; total: number };
  /** Module icon (from `nav-items.ts` — never a second, divergent icon
   * table) shown before `title`. Internal pages (novo/detalhe/editar)
   * pass their parent module's icon; omit where no module applies. */
  icon?: LucideIcon;
}

type BackLinkProps = BackLinkContentProps &
  (
    | { href: string; onBack?: undefined }
    | { href?: undefined; onBack: () => void }
  );

const CONTROL_CLASSNAME =
  "inline-flex items-center gap-1 rounded-lg py-1 pr-2 -ml-1 pl-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * The single standardized "back" pattern for every internal page that
 * needs return navigation (Pilot-Ready "Padronização Global do Botão
 * Voltar") — replaces the two previously-duplicated implementations
 * (`BackHeader` and `flow-header.tsx`'s `FlowHeader`) plus several
 * hand-rolled one-offs. Always renders `← Voltar` on its own line
 * above the title, never inline with it.
 *
 * Pass `href` for a known destination (renders a real `<Link>` — the
 * common case: a literal or computed parent route). Pass `onBack` only
 * when the destination genuinely depends on runtime logic that isn't a
 * plain route (e.g. a multi-step wizard going back one internal step).
 */
export function BackLink({ title, description, step, icon: Icon, href, onBack }: BackLinkProps) {
  const control =
    href !== undefined ? (
      <Link href={href} className={CONTROL_CLASSNAME}>
        <ChevronLeft className="size-4" aria-hidden="true" />
        Voltar
      </Link>
    ) : (
      <button type="button" onClick={onBack} className={CONTROL_CLASSNAME}>
        <ChevronLeft className="size-4" aria-hidden="true" />
        Voltar
      </button>
    );

  return (
    <div className="space-y-1.5 pb-1">
      {control}
      <div className="min-w-0 space-y-1">
        <h1
          className={cn(
            "flex items-center gap-2 truncate font-semibold tracking-tight text-foreground",
            step ? "text-lg" : "text-2xl"
          )}
        >
          {Icon ? <Icon className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" /> : null}
          <span className="truncate">{title}</span>
        </h1>
        {step ? (
          <p className="text-xs text-muted-foreground">
            Etapa {step.current} de {step.total}
          </p>
        ) : description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
    </div>
  );
}
