import { cn } from "@/lib/utils";
import { STOCK_MOVEMENT_TYPE_LABEL, type StockMovementType } from "../types";

const TYPE_CLASSES: Record<StockMovementType, string> = {
  IN: "bg-primary/10 text-primary",
  ADJUSTMENT_IN: "bg-primary/10 text-primary",
  OUT: "bg-destructive/10 text-destructive",
  ADJUSTMENT_OUT: "bg-destructive/10 text-destructive",
};

export function StockMovementTypeBadge({
  type,
  className,
}: {
  type: StockMovementType;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-medium",
        TYPE_CLASSES[type],
        className
      )}
    >
      {STOCK_MOVEMENT_TYPE_LABEL[type]}
    </span>
  );
}
