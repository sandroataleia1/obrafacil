"use client";

import { useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { CreateWorkPeriodDialog } from "@/features/employees/attendance/create-work-period-dialog";
import { isLegacyWorkPeriod } from "@/features/employees/prototype/attendance";
import { calculatePeriodEstimate } from "@/features/employees/prototype/period-calculation";
import { EMPLOYMENT_TYPE_LABEL, type Employee, type EmployeeWorkPeriod } from "@/features/employees/types";
import { formatCurrency } from "@/lib/currency";
import { formatDate } from "@/lib/date";
import { ASSIGNMENT_STATUS_LABEL, getAssignmentStatus, getProjectEmployeePeriodHref } from "./project-team";
import type { ProjectTeamAssignment } from "./types";

/**
 * Frequência description reuses the same wording style as
 * `attendance-overview-row.tsx`'s `describeRow` — always "frequência
 * do colaborador", never "nesta obra" (Demo-Ready 009D-A §23-27:
 * `EmployeeAttendanceEntry` has no `projectId`, so it must never read
 * as obra-specific).
 */
function describeFrequency(workPeriod: EmployeeWorkPeriod): string {
  const estimate = calculatePeriodEstimate(workPeriod);
  if (isLegacyWorkPeriod(workPeriod)) {
    const absences = estimate.legacy?.absences ?? 0;
    return `${workPeriod.workedDays ?? 0} de ${workPeriod.expectedDays ?? 0} dias · ${absences} falta${absences === 1 ? "" : "s"} (formato anterior)`;
  }
  const summary = estimate.attendanceSummary;
  if (!summary) return "";
  if (workPeriod.paymentModelSnapshot === "daily") {
    return `${summary.fullDays} completos · ${summary.halfDays} meios · ${summary.workedUnits} diária${summary.workedUnits === 1 ? "" : "s"} equiv.`;
  }
  return `${summary.fullDays} completos · ${summary.halfDays} meios · ${summary.absences} falta${summary.absences === 1 ? "" : "s"} · ${summary.unrecordedDays} pendente${summary.unrecordedDays === 1 ? "" : "s"}`;
}

const STATUS_BADGE_CLASS: Record<string, string> = {
  active: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  future: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  ended: "bg-muted text-muted-foreground",
};

interface RowProps {
  projectId: string;
  assignment: ProjectTeamAssignment;
  employee: Employee;
  workPeriod: EmployeeWorkPeriod | null;
  period: string;
  today: string;
  canManage: boolean;
  hasOtherProjectThisMonth: boolean;
  onPeriodCreated: () => void;
  onEdit: () => void;
  onEnd: () => void;
}

function FrequencySection({
  projectId,
  employee,
  workPeriod,
  period,
  onPeriodCreated,
}: Pick<RowProps, "projectId" | "employee" | "workPeriod" | "period" | "onPeriodCreated">) {
  const [createOpen, setCreateOpen] = useState(false);

  if (!workPeriod) {
    return (
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-muted-foreground">Sem período</span>
        <Button type="button" size="sm" variant="outline" onClick={() => setCreateOpen(true)}>
          Criar período
        </Button>
        <CreateWorkPeriodDialog
          employee={employee}
          open={createOpen}
          onOpenChange={setCreateOpen}
          defaultPeriod={period}
          onCreated={onPeriodCreated}
        />
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-sm text-foreground">{describeFrequency(workPeriod)}</span>
      <Button
        size="sm"
        variant="outline"
        nativeButton={false}
        render={<Link href={getProjectEmployeePeriodHref(projectId, employee.id, period)}>Ver frequência</Link>}
      />
    </div>
  );
}

export function ProjectTeamRowMobile({
  projectId,
  assignment,
  employee,
  workPeriod,
  period,
  today,
  canManage,
  hasOtherProjectThisMonth,
  onPeriodCreated,
  onEdit,
  onEnd,
}: RowProps) {
  const status = getAssignmentStatus(assignment, today);
  const vinculo = `${EMPLOYMENT_TYPE_LABEL[employee.employmentType]} · ${
    employee.paymentModel === "daily" ? `${formatCurrency(employee.dailyRate ?? 0)}/dia` : "Mensal"
  }`;

  return (
    <div className="space-y-2.5 rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{employee.name}</p>
          <p className="text-xs text-muted-foreground">{employee.role}</p>
          <p className="text-xs text-muted-foreground">{vinculo}</p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_BADGE_CLASS[status]}`}>
          {ASSIGNMENT_STATUS_LABEL[status]}
        </span>
      </div>

      <p className="text-xs text-muted-foreground">
        {formatDate(assignment.startDate)} → {assignment.endDate ? formatDate(assignment.endDate) : "atual"}
      </p>

      {hasOtherProjectThisMonth ? (
        <p className="text-xs font-medium text-amber-600 dark:text-amber-400">
          Alocado em mais de uma obra neste período.
        </p>
      ) : null}

      <FrequencySection
        projectId={projectId}
        employee={employee}
        workPeriod={workPeriod}
        period={period}
        onPeriodCreated={onPeriodCreated}
      />

      {canManage ? (
        <div className="flex gap-2 pt-1">
          <Button type="button" size="sm" variant="outline" className="flex-1" onClick={onEdit}>
            Editar alocação
          </Button>
          {status !== "ended" ? (
            <Button type="button" size="sm" variant="outline" className="flex-1" onClick={onEnd}>
              Encerrar alocação
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function ProjectTeamRowDesktop({
  projectId,
  assignment,
  employee,
  workPeriod,
  period,
  today,
  canManage,
  hasOtherProjectThisMonth,
  onPeriodCreated,
  onEdit,
  onEnd,
}: RowProps) {
  const status = getAssignmentStatus(assignment, today);
  const vinculo = `${EMPLOYMENT_TYPE_LABEL[employee.employmentType]} · ${
    employee.paymentModel === "daily" ? `${formatCurrency(employee.dailyRate ?? 0)}/dia` : "Mensal"
  }`;

  return (
    <tr className="border-b border-border last:border-0 align-top hover:bg-muted/40">
      <td className="py-3 pr-4">
        <p className="font-medium text-foreground">{employee.name}</p>
        <p className="text-xs text-muted-foreground">{employee.role}</p>
        <p className="text-xs text-muted-foreground">{vinculo}</p>
      </td>
      <td className="py-3 pr-4 text-sm text-muted-foreground">
        <p>
          {formatDate(assignment.startDate)} → {assignment.endDate ? formatDate(assignment.endDate) : "atual"}
        </p>
        {hasOtherProjectThisMonth ? (
          <p className="mt-1 text-xs font-medium text-amber-600 dark:text-amber-400">
            Mais de uma obra
          </p>
        ) : null}
      </td>
      <td className="py-3 pr-4">
        <FrequencySection
          projectId={projectId}
          employee={employee}
          workPeriod={workPeriod}
          period={period}
          onPeriodCreated={onPeriodCreated}
        />
      </td>
      <td className="py-3 pr-4">
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_BADGE_CLASS[status]}`}>
          {ASSIGNMENT_STATUS_LABEL[status]}
        </span>
      </td>
      <td className="py-3">
        {canManage ? (
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="outline" onClick={onEdit}>
              Editar
            </Button>
            {status !== "ended" ? (
              <Button type="button" size="sm" variant="outline" onClick={onEnd}>
                Encerrar
              </Button>
            ) : null}
          </div>
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        )}
      </td>
    </tr>
  );
}
