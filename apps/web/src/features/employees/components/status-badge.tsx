import { cn } from "@/lib/utils";
import {
  EMPLOYEE_STATUS_LABEL,
  WORK_PERIOD_STATUS_LABEL,
  type EmployeeStatus,
  type WorkPeriodStatus,
} from "../types";

const EMPLOYEE_STATUS_CLASSES: Record<EmployeeStatus, string> = {
  active: "bg-primary/10 text-primary",
  inactive: "bg-muted text-muted-foreground",
};

export function EmployeeStatusBadge({
  status,
  className,
}: {
  status: EmployeeStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-medium",
        EMPLOYEE_STATUS_CLASSES[status],
        className
      )}
    >
      {EMPLOYEE_STATUS_LABEL[status]}
    </span>
  );
}

const WORK_PERIOD_STATUS_CLASSES: Record<WorkPeriodStatus, string> = {
  open: "bg-primary/10 text-primary",
  closed: "bg-muted text-muted-foreground",
};

export function WorkPeriodStatusBadge({
  status,
  className,
}: {
  status: WorkPeriodStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-medium",
        WORK_PERIOD_STATUS_CLASSES[status],
        className
      )}
    >
      {WORK_PERIOD_STATUS_LABEL[status]}
    </span>
  );
}
