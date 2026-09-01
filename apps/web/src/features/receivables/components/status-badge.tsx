import { cn } from "@/lib/utils";
import { RECEIVABLE_DISPLAY_STATUS_LABEL, type ReceivableDisplayStatus } from "../types";

const STATUS_CLASSES: Record<ReceivableDisplayStatus, string> = {
  pending: "bg-muted text-muted-foreground",
  partial: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  overdue: "bg-destructive/10 text-destructive",
  received: "bg-primary text-primary-foreground",
};

export function ReceivableStatusBadge({
  status,
  className,
}: {
  status: ReceivableDisplayStatus;
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
      {RECEIVABLE_DISPLAY_STATUS_LABEL[status]}
    </span>
  );
}
