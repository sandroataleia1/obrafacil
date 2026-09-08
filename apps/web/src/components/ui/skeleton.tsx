import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

/**
 * Decorative loading block — `aria-hidden` itself so screen readers
 * don't announce dozens of individual blocks; the composing skeleton
 * screen carries the single `role="status"` announcement instead.
 * `motion-safe:` (not the bare Tailwind `animate-pulse`) so reduced
 * motion renders it static rather than pulsing.
 */
export function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn("motion-safe:animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  );
}
