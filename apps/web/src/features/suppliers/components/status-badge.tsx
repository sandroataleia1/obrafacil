import { cn } from "@/lib/utils";

const STATUS_CLASSES = {
  active: "bg-primary/10 text-primary",
  inactive: "bg-muted text-muted-foreground",
};

/** SUPPLY-FRONTEND-01A §74-76. Derives from the real API `active` boolean. */
export function SupplierStatusBadge({ active, className }: { active: boolean; className?: string }) {
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
