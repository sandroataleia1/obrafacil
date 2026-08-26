import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";
import type { CalculatorCategory } from "./categories";

export function CalculatorCard({ name, description, icon: Icon, href }: CalculatorCategory) {
  const available = Boolean(href);

  const content = (
    <>
      <span
        className={cn(
          "flex size-11 shrink-0 items-center justify-center rounded-xl",
          available
            ? "bg-primary/10 text-primary"
            : "bg-muted text-muted-foreground"
        )}
      >
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block text-sm font-semibold",
            available ? "text-foreground" : "text-muted-foreground"
          )}
        >
          {name}
        </span>
        <span
          className={cn(
            "block text-xs",
            available
              ? "text-muted-foreground"
              : "text-muted-foreground/70"
          )}
        >
          {description}
        </span>
      </span>
      {available ? (
        <ChevronRight
          className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
          aria-hidden="true"
        />
      ) : (
        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
          Em breve
        </span>
      )}
    </>
  );

  const className = cn(
    "group flex items-center gap-3.5 rounded-xl border p-4 text-left transition-colors",
    available
      ? "border-border bg-card hover:border-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:translate-y-px"
      : "border-border/60 bg-muted/30 cursor-default"
  );

  if (available && href) {
    return (
      <Link href={href} className={className}>
        {content}
      </Link>
    );
  }

  return (
    <div
      className={className}
      aria-disabled="true"
      aria-label={`${name}, em breve`}
    >
      {content}
    </div>
  );
}
