"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { ResponsiveDialog } from "@/components/shared/responsive-dialog";
import { formatCurrency } from "@/lib/currency";
import { todayIso } from "@/lib/date";
import { ISO_WEEKDAY_LABEL } from "../prototype/attendance";
import { findWorkPeriod, createWorkPeriodForEmployee } from "../prototype/work-period-store";
import { EMPLOYMENT_TYPE_LABEL, type Employee, type EmployeeWorkPeriod } from "../types";

/**
 * Single source of truth for the "Criar período" flow, used both from
 * the employee detail screen and from the Frequência overview row
 * (Demo-Ready 009B §20/§21) — both call the same
 * `createWorkPeriodForEmployee` helper, never two separate
 * assemblies of the same snapshot.
 */
export function CreateWorkPeriodDialog({
  employee,
  open,
  onOpenChange,
  defaultPeriod,
  onCreated,
}: {
  employee: Employee;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultPeriod?: string;
  onCreated: (workPeriod: EmployeeWorkPeriod) => void;
}) {
  const [period, setPeriod] = useState(() => defaultPeriod ?? todayIso().slice(0, 7));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPeriod(defaultPeriod ?? todayIso().slice(0, 7));
    setError(null);
  }, [open, defaultPeriod]);

  function handleCreate() {
    if (findWorkPeriod(employee.id, period)) {
      setError("Já existe um período criado para este mês.");
      return;
    }
    const workPeriod = createWorkPeriodForEmployee(employee, period);
    onOpenChange(false);
    onCreated(workPeriod);
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Criar período"
      description={`${employee.name} · ${EMPLOYMENT_TYPE_LABEL[employee.employmentType]}`}
      size="sm"
      footer={
        <>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" onClick={handleCreate}>
            Criar período
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="space-y-1.5">
          <label htmlFor="new-work-period" className="text-sm font-medium text-foreground">
            Período
          </label>
          <input
            id="new-work-period"
            type="month"
            value={period}
            onChange={(event) => setPeriod(event.target.value)}
            className="w-full rounded-xl border border-border bg-background px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
          />
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <div className="space-y-1 rounded-lg border border-border bg-muted/30 p-3 text-sm">
          {employee.paymentModel === "monthly" ? (
            <>
              <p className="text-foreground">Salário mensal: {formatCurrency(employee.baseSalary)}</p>
              <p className="text-muted-foreground">
                Escala: {(employee.workDays ?? []).map((day) => ISO_WEEKDAY_LABEL[day]).join(", ") || "não definida"}
              </p>
            </>
          ) : (
            <p className="text-foreground">Valor da diária: {formatCurrency(employee.dailyRate ?? 0)}</p>
          )}
        </div>
      </div>
    </ResponsiveDialog>
  );
}
