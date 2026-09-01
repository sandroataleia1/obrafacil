import { cn } from "@/lib/utils";
import { SUPPLIER_STATUS_LABEL, type SupplierStatus } from "../types";

const STATUS_CLASSES: Record<SupplierStatus, string> = {
  active: "bg-primary/10 text-primary",
  inactive: "bg-muted text-muted-foreground",
};

export function SupplierStatusBadge({
  status,
  className,
}: {
  status: SupplierStatus;
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
      {SUPPLIER_STATUS_LABEL[status]}
    </span>
  );
}
