import { cn } from "@/lib/utils";
import { SERVICE_ORDER_STATUS_LABELS } from "./labels";
import type { ServiceOrderStatus } from "./types";

const STATUS_CLASSES: Record<ServiceOrderStatus, string> = {
  open: "bg-muted text-muted-foreground",
  in_progress: "bg-primary/10 text-primary",
  completed: "bg-primary text-primary-foreground",
  cancelled: "bg-destructive/10 text-destructive",
};

/** Status is always shown as visible text — never color-only (CLAUDE.md a11y rule). */
export function ServiceOrderStatusBadge({
  status,
  className,
}: {
  status: ServiceOrderStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-medium",
        STATUS_CLASSES[status],
        className
      )}
    >
      {SERVICE_ORDER_STATUS_LABELS[status]}
    </span>
  );
}
