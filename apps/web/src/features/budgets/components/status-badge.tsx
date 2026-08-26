import { cn } from "@/lib/utils";
import { BUDGET_STATUS_LABEL, type BudgetStatus } from "../types";

const STATUS_CLASSES: Record<BudgetStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  pending_approval: "bg-primary/10 text-primary",
  approved: "bg-primary text-primary-foreground",
  rejected: "bg-destructive/10 text-destructive",
};

export function StatusBadge({
  status,
  className,
}: {
  status: BudgetStatus;
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
      {BUDGET_STATUS_LABEL[status]}
    </span>
  );
}
