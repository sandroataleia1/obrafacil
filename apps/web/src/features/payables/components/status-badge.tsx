import { cn } from "@/lib/utils";
import { PAYABLE_STATUS_LABEL, type PayableStatus } from "../types";

const STATUS_CLASSES: Record<PayableStatus, string> = {
  pending: "bg-muted text-muted-foreground",
  overdue: "bg-destructive/10 text-destructive",
  paid: "bg-primary text-primary-foreground",
};

export function PayableStatusBadge({
  status,
  className,
}: {
  status: PayableStatus;
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
      {PAYABLE_STATUS_LABEL[status]}
    </span>
  );
}
