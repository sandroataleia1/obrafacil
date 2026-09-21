import { cn } from "@/lib/utils";

const STATUS_CLASSES = {
  active: "bg-primary/10 text-primary",
  inactive: "bg-muted text-muted-foreground",
};

/**
 * SUPPLY-FRONTEND-01A §74-75. Derives its label/color from the real API
 * `active` boolean — `status` is never persisted on the entity itself.
 */
export function MaterialStatusBadge({ active, className }: { active: boolean; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-medium",
        active ? STATUS_CLASSES.active : STATUS_CLASSES.inactive,
        className
      )}
    >
      {active ? "Ativo" : "Inativo"}
    </span>
  );
}
