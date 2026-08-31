"use client";

import Link from "next/link";
import { ChevronRight, Plus, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { formatCurrency } from "@/lib/currency";
import { calculatePeriodEstimate } from "./prototype/period-calculation";
import { formatPeriodShort } from "./prototype/period-label";
import { listWorkPeriodsByEmployee } from "./prototype/work-period-store";
import { useEmployees } from "./prototype/use-employees";
import { EmployeeStatusBadge } from "./components/status-badge";
import { getWorkPeriodStatus, type Employee } from "./types";

function EmployeeCard({ employee }: { employee: Employee }) {
  const periods = listWorkPeriodsByEmployee(employee.id);
  const latestPeriod = periods[0];

  return (
    <Link
      href={`/equipe/${employee.id}`}
      className="group flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:translate-y-px"
    >
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-semibold text-foreground">{employee.name}</p>
          {employee.status === "inactive" ? <EmployeeStatusBadge status="inactive" /> : null}
        </div>
        <p className="text-xs text-muted-foreground">{employee.role}</p>
        {latestPeriod ? (
          getWorkPeriodStatus(latestPeriod) === "closed" ? (
            <p className="text-sm text-muted-foreground">
              {formatPeriodShort(latestPeriod.period)} fechado ·{" "}
              <span className="font-medium text-foreground">
                {formatCurrency(calculatePeriodEstimate(latestPeriod).estimatedPay)}
              </span>{" "}
              previsto
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              {formatPeriodShort(latestPeriod.period)} · {latestPeriod.workedDays} de{" "}
              {latestPeriod.expectedDays} dias
            </p>
          )
        ) : (
          <p className="text-sm text-muted-foreground">{formatCurrency(employee.baseSalary)}/mês</p>
        )}
      </div>
      <ChevronRight
        className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
        aria-hidden="true"
      />
    </Link>
  );
}

export function EmployeeList() {
  const { employees } = useEmployees();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Equipe</h1>
          <p className="text-sm text-muted-foreground">
            Funcionários e controle de dias trabalhados.
          </p>
        </div>
        <Button
          size="sm"
          nativeButton={false}
          render={
            <Link href="/equipe/novo">
              <Plus className="size-4" aria-hidden="true" />
              Novo
            </Link>
          }
        />
      </div>

      {employees === undefined ? null : employees.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Nenhum funcionário cadastrado"
          description="Adicione sua equipe para controlar os dias trabalhados."
        />
      ) : (
        <div className="space-y-3">
          {employees.map((employee) => (
            <EmployeeCard key={employee.id} employee={employee} />
          ))}
        </div>
      )}

      {employees !== undefined && employees.length === 0 ? (
        <Button
          size="lg"
          className="w-full"
          nativeButton={false}
          render={<Link href="/equipe/novo">Adicionar primeiro funcionário</Link>}
        />
      ) : null}
    </div>
  );
}
