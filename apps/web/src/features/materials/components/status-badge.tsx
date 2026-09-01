import { cn } from "@/lib/utils";
import { MATERIAL_STATUS_LABEL, type MaterialStatus } from "../types";

const STATUS_CLASSES: Record<MaterialStatus, string> = {
  active: "bg-primary/10 text-primary",
  inactive: "bg-muted text-muted-foreground",
};

export function MaterialStatusBadge({
  status,
  className,
}: {
  status: MaterialStatus;
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
      {MATERIAL_STATUS_LABEL[status]}
    </span>
  );
}
