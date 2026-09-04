"use client";

import { useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/currency";
import { CreateWorkPeriodDialog } from "./create-work-period-dialog";
import { isLegacyWorkPeriod } from "../prototype/attendance";
import { calculatePeriodEstimate } from "../prototype/period-calculation";
import {
  EMPLOYMENT_TYPE_LABEL,
  WORK_PERIOD_STATUS_LABEL,
  getWorkPeriodStatus,
  type Employee,
  type EmployeeWorkPeriod,
} from "../types";

function describeRow(workPeriod: EmployeeWorkPeriod): { frequency: string; pending: string | null } {
  const estimate = calculatePeriodEstimate(workPeriod);

  if (isLegacyWorkPeriod(workPeriod)) {
    const absences = estimate.legacy?.absences ?? 0;
    return {
      frequency: `${workPeriod.workedDays ?? 0} de ${workPeriod.expectedDays ?? 0} dias · ${absences} falta${absences === 1 ? "" : "s"} (formato anterior)`,
      pending: null,
    };
  }

  const summary = estimate.attendanceSummary;
  if (!summary) return { frequency: "", pending: null };

  if (workPeriod.paymentModelSnapshot === "daily") {
    return {
      frequency: `${summary.fullDays} completos · ${summary.halfDays} meios · ${summary.workedUnits} diária${summary.workedUnits === 1 ? "" : "s"} equiv.`,
      pending: null,
    };
  }

  return {
    frequency: `${summary.fullDays} completos · ${summary.halfDays} meios · ${summary.absences} falta${summary.absences === 1 ? "" : "s"}`,
    pending: summary.unrecordedDays > 0 ? `${summary.unrecordedDays} dia${summary.unrecordedDays === 1 ? "" : "s"}` : null,
  };
}

interface RowProps {
  employee: Employee;
  workPeriod: EmployeeWorkPeriod | null;
  period: string;
  onPeriodCreated: () => void;
}

function CreatePeriodAction({ employee, period, onPeriodCreated }: Omit<RowProps, "workPeriod">) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
        Criar período
      </Button>
      <CreateWorkPeriodDialog
        employee={employee}
        open={open}
        onOpenChange={setOpen}
        defaultPeriod={period}
        onCreated={onPeriodCreated}
      />
    </>
  );
}

export function AttendanceOverviewRowMobile({ employee, workPeriod, period, onPeriodCreated }: RowProps) {
  const vinculo = `${EMPLOYMENT_TYPE_LABEL[employee.employmentType]} · ${
    employee.paymentModel === "daily" ? `${formatCurrency(employee.dailyRate ?? 0)}/diária` : "Mensal"
  }`;

  return (
    <div className="space-y-2 rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{employee.name}</p>
          <p className="text-xs text-muted-foreground">{vinculo}</p>
        </div>
        {workPeriod ? (
          <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
            {WORK_PERIOD_STATUS_LABEL[getWorkPeriodStatus(workPeriod)]}
          </span>
        ) : null}
      </div>

      {!workPeriod ? (
        <div className="flex items-center justify-between gap-3 pt-1">
          <p className="text-sm text-muted-foreground">Sem período</p>
          <CreatePeriodAction employee={employee} period={period} onPeriodCreated={onPeriodCreated} />
        </div>
      ) : (
        <>
          <p className="text-sm text-foreground">{describeRow(workPeriod).frequency}</p>
          {describeRow(workPeriod).pending ? (
            <p className="text-xs font-medium text-amber-600 dark:text-amber-400">
              {describeRow(workPeriod).pending} pendente(s)
            </p>
          ) : null}
          <div className="flex items-center justify-between pt-1">
            <span className="text-sm font-semibold tabular-nums text-foreground">
              {formatCurrency(calculatePeriodEstimate(workPeriod).estimatedPay)}
            </span>
            <Button
              size="sm"
              variant="outline"
              nativeButton={false}
              render={<Link href={`/equipe/${employee.id}/periodos/${period}`}>Ver frequência</Link>}
            />
          </div>
        </>
      )}
    </div>
  );
}

export function AttendanceOverviewRowDesktop({ employee, workPeriod, period, onPeriodCreated }: RowProps) {
  const vinculo = `${EMPLOYMENT_TYPE_LABEL[employee.employmentType]} · ${
    employee.paymentModel === "daily" ? `${formatCurrency(employee.dailyRate ?? 0)}/diária` : "Mensal"
  }`;
  const description = workPeriod ? describeRow(workPeriod) : null;

  return (
    <tr className="border-b border-border last:border-0 hover:bg-muted/40">
      <td className="py-3 pr-4 align-top">
        <p className="font-medium text-foreground">{employee.name}</p>
        <p className="text-xs text-muted-foreground">{employee.role}</p>
      </td>
      <td className="py-3 pr-4 align-top text-sm text-muted-foreground">{vinculo}</td>
      <td className="py-3 pr-4 align-top text-sm text-foreground">
        {workPeriod ? description!.frequency : <span className="text-muted-foreground">Sem período</span>}
      </td>
      <td className="py-3 pr-4 align-top text-sm">
        {description?.pending ? (
          <span className="font-medium text-amber-600 dark:text-amber-400">{description.pending}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      <td className="py-3 pr-4 align-top text-sm font-semibold tabular-nums text-foreground">
        {workPeriod ? formatCurrency(calculatePeriodEstimate(workPeriod).estimatedPay) : "—"}
      </td>
      <td className="py-3 pr-4 align-top text-sm">
        {workPeriod ? (
          <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
            {WORK_PERIOD_STATUS_LABEL[getWorkPeriodStatus(workPeriod)]}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      <td className="py-3 align-top">
        {workPeriod ? (
          <Button
            size="sm"
            variant="outline"
            nativeButton={false}
            render={<Link href={`/equipe/${employee.id}/periodos/${period}`}>Ver frequência</Link>}
          />
        ) : (
          <CreatePeriodAction employee={employee} period={period} onPeriodCreated={onPeriodCreated} />
        )}
      </td>
    </tr>
  );
}
