import { cn } from "@/lib/utils";
import { PROJECT_STATUS_LABEL, type ProjectStatus } from "../types";

const STATUS_CLASSES: Record<ProjectStatus, string> = {
  planning: "bg-muted text-muted-foreground",
  in_progress: "bg-primary/10 text-primary",
  paused: "bg-accent text-accent-foreground",
  completed: "bg-primary text-primary-foreground",
};

export function ProjectStatusBadge({
  status,
  className,
}: {
  status: ProjectStatus;
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
      {PROJECT_STATUS_LABEL[status]}
    </span>
  );
}
