import { cn } from "@/lib/utils";
import { PURCHASE_ORDER_STATUS_LABEL, type PurchaseOrderCommercialStatus } from "../types";

const STATUS_CLASSES: Record<PurchaseOrderCommercialStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  ordered: "bg-primary text-primary-foreground",
  cancelled: "bg-destructive/10 text-destructive",
};

export function PurchaseOrderStatusBadge({
  status,
  className,
}: {
  status: PurchaseOrderCommercialStatus;
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
      {PURCHASE_ORDER_STATUS_LABEL[status]}
    </span>
  );
}
