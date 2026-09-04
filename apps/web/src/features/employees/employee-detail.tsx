"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Plus, Users } from "lucide-react";

import { BackHeader } from "@/components/shared/back-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { formatCurrency } from "@/lib/currency";
import { formatPhoneInput } from "@/lib/phone";
import { CreateWorkPeriodDialog } from "./attendance/create-work-period-dialog";
import { isLegacyWorkPeriod } from "./prototype/attendance";
import { calculatePeriodEstimate } from "./prototype/period-calculation";
import { formatPeriodShort } from "./prototype/period-label";
import { useEmployee } from "./prototype/use-employee";
import { useWorkPeriods } from "./prototype/use-work-periods";
import { EmployeeStatusBadge, WorkPeriodStatusBadge } from "./components/status-badge";
import {
  EMPLOYMENT_TYPE_LABEL,
  PAYMENT_MODEL_LABEL,
  getWorkPeriodStatus,
  type EmployeeStatus,
  type EmployeeWorkPeriod,
} from "./types";

const STATUS_OPTIONS: EmployeeStatus[] = ["active", "inactive"];

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground">{value}</span>
    </div>
  );
}

function periodSubtitle(workPeriod: EmployeeWorkPeriod): string {
  const estimate = calculatePeriodEstimate(workPeriod);

  if (isLegacyWorkPeriod(workPeriod)) {
    return `${workPeriod.workedDays} de ${workPeriod.expectedDays} dias · ${estimate.legacy?.absences ?? 0} falta${
      estimate.legacy?.absences === 1 ? "" : "s"
    }`;
  }

  const summary = estimate.attendanceSummary;
  if (!summary) return "";

  if (workPeriod.paymentModelSnapshot === "daily") {
    return `${summary.workedUnits} diária${summary.workedUnits === 1 ? "" : "s"} equivalente${
      summary.workedUnits === 1 ? "" : "s"
    }`;
  }

  return `${summary.fullDays} completos · ${summary.halfDays} meios · ${summary.absences} falta${
    summary.absences === 1 ? "" : "s"
  } · ${summary.unrecordedDays} pendente${summary.unrecordedDays === 1 ? "" : "s"}`;
}

function PeriodRow({ workPeriod }: { workPeriod: EmployeeWorkPeriod }) {
  const status = getWorkPeriodStatus(workPeriod);
  const estimate = calculatePeriodEstimate(workPeriod);

  return (
    <Link
      href={`/equipe/${workPeriod.employeeId}/periodos/${workPeriod.period}`}
      className="flex items-center gap-3 p-3.5 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-foreground">{formatPeriodShort(workPeriod.period)}</p>
          <WorkPeriodStatusBadge status={status} />
        </div>
        <p className="text-xs text-muted-foreground">{periodSubtitle(workPeriod)}</p>
      </div>
      <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
        {formatCurrency(estimate.estimatedPay)}
      </span>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </Link>
  );
}

export function EmployeeDetail({ id }: { id: string }) {
  const router = useRouter();
  const { employee, persist } = useEmployee(id);
  const { workPeriods } = useWorkPeriods(id);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  if (employee === undefined) return null;

  if (employee === null) {
    return (
      <EmptyState
        icon={Users}
        title="Funcionário não encontrado"
        description="Ele pode ter sido removido ou o link está incorreto."
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <BackHeader title={employee.name} onBack={() => router.push("/equipe")} />
        <div className="flex items-center gap-2 pl-11">
          <p className="text-sm text-muted-foreground">{employee.role}</p>
          <EmployeeStatusBadge status={employee.status} />
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        {employee.phone ? (
          <InfoRow label="Telefone" value={formatPhoneInput(employee.phone)} />
        ) : null}
        <InfoRow label="Vínculo" value={EMPLOYMENT_TYPE_LABEL[employee.employmentType]} />
        <InfoRow label="Remuneração" value={PAYMENT_MODEL_LABEL[employee.paymentModel]} />
        {employee.paymentModel === "monthly" ? (
          <InfoRow label="Salário mensal" value={formatCurrency(employee.baseSalary)} />
        ) : (
          <InfoRow label="Valor da diária" value={formatCurrency(employee.dailyRate ?? 0)} />
        )}
      </div>

      <div className="space-y-2">
        <span className="text-sm font-medium text-foreground">Status</span>
        <div className="grid grid-cols-2 gap-2">
          {STATUS_OPTIONS.map((status) => {
            const selected = employee.status === status;
            return (
              <button
                key={status}
                type="button"
                aria-pressed={selected}
                onClick={() => persist({ ...employee, status })}
                className={
                  selected
                    ? "rounded-lg border border-primary bg-primary/5 py-2.5 text-sm font-semibold text-primary"
                    : "rounded-lg border border-border bg-card py-2.5 text-sm font-semibold text-foreground hover:border-primary/30"
                }
              >
                {status === "active" ? "Ativo" : "Inativo"}
              </button>
            );
          })}
        </div>
      </div>

      <Button
        variant="outline"
        className="w-full"
        nativeButton={false}
        render={<Link href={`/equipe/${employee.id}/editar`}>Editar funcionário</Link>}
      />

      <section aria-labelledby="employee-periods" className="space-y-2.5">
        <div className="flex items-center justify-between gap-3">
          <h2
            id="employee-periods"
            className="text-xs font-semibold tracking-wide text-muted-foreground uppercase"
          >
            Controle mensal
          </h2>
          <Button size="sm" type="button" onClick={() => setCreateDialogOpen(true)}>
            <Plus className="size-4" aria-hidden="true" />
            Novo período
          </Button>
        </div>

        <CreateWorkPeriodDialog
          employee={employee}
          open={createDialogOpen}
          onOpenChange={setCreateDialogOpen}
          onCreated={(workPeriod) => router.push(`/equipe/${employee.id}/periodos/${workPeriod.period}`)}
        />

        {workPeriods === undefined ? null : workPeriods.length === 0 ? (
          <EmptyState
            compact
            icon={Users}
            title="Nenhum período registrado"
            description="Crie o primeiro período para controlar os dias trabalhados."
          />
        ) : (
          <div className="divide-y divide-border rounded-xl border border-border bg-card">
            {workPeriods.map((workPeriod) => (
              <PeriodRow key={workPeriod.id} workPeriod={workPeriod} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
