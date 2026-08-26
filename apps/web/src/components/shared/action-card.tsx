import Link from "next/link";
import { ChevronRight, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

interface ActionCardProps {
  href: string;
  icon: LucideIcon;
  title: string;
  description?: string;
  variant?: "primary" | "secondary";
  cta?: string;
  className?: string;
}

export function ActionCard({
  href,
  icon: Icon,
  title,
  description,
  variant = "secondary",
  cta,
  className,
}: ActionCardProps) {
  if (variant === "primary") {
    return (
      <Link
        href={href}
        className={cn(
          "group relative flex flex-col gap-5 overflow-hidden rounded-2xl bg-primary p-6 text-primary-foreground outline-none transition-colors hover:bg-primary/93 focus-visible:ring-3 focus-visible:ring-ring active:translate-y-px sm:p-7",
          className
        )}
      >
        <span
          className="pointer-events-none absolute -top-10 -right-10 size-40 rounded-full bg-primary-foreground/6"
          aria-hidden="true"
        />

        <span className="flex size-12 items-center justify-center rounded-xl bg-primary-foreground/12 ring-1 ring-primary-foreground/20">
          <Icon className="size-6" aria-hidden="true" />
        </span>

        <span className="space-y-1.5">
          <span className="block text-xl font-semibold tracking-tight">
            {title}
          </span>
          {description ? (
            <span className="block text-sm leading-relaxed text-primary-foreground/78">
              {description}
            </span>
          ) : null}
        </span>

        {cta ? (
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold">
            {cta}
            <ChevronRight
              className="size-4 transition-transform group-hover:translate-x-1"
              aria-hidden="true"
            />
          </span>
        ) : null}
      </Link>
    );
  }

  return (
    <Link
      href={href}
      className={cn(
        "group flex flex-col items-start gap-3 rounded-xl bg-card p-4 text-card-foreground ring-1 ring-border transition-colors hover:border-primary/30 hover:ring-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:translate-y-px",
        className
      )}
    >
      <span className="flex size-9 items-center justify-center rounded-lg bg-background text-primary ring-1 ring-border">
        <Icon className="size-4.5" aria-hidden="true" />
      </span>
      <span className="inline-flex items-center gap-1 text-sm font-medium">
        {title}
        <ChevronRight
          className="size-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5"
          aria-hidden="true"
        />
      </span>
    </Link>
  );
}
