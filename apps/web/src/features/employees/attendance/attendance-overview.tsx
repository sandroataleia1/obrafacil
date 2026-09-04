"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Search, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { todayIso } from "@/lib/date";
import { AttendanceIndicatorsBar } from "./attendance-indicators";
import { AttendanceOverviewRowDesktop, AttendanceOverviewRowMobile } from "./attendance-overview-row";
import { formatPeriodLabel } from "../prototype/period-label";
import { useEmployees } from "../prototype/use-employees";
import { useAllWorkPeriods } from "../prototype/use-work-periods";
import {
  buildAttendanceIndicators,
  buildOverviewRows,
  shiftPeriod,
} from "../prototype/attendance-overview";
import { getWorkPeriodStatus, type EmploymentType } from "../types";

type TypeFilter = "all" | EmploymentType;

const TYPE_FILTER_LABEL: Record<TypeFilter, string> = {
  all: "Todos",
  employee: "Funcionários",
  contractor: "Prestadores",
};

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

export function AttendanceOverview() {
  const { employees, refresh: refreshEmployees } = useEmployees();
  const { workPeriods, refresh: refreshWorkPeriods } = useAllWorkPeriods();
  const [period, setPeriod] = useState(() => todayIso().slice(0, 7));
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);

  function refresh() {
    refreshEmployees();
    refreshWorkPeriods();
  }

  if (employees === undefined || workPeriods === undefined) return null;

  if (employees.length === 0) {
    return (
      <div className="space-y-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Frequência</h1>
          <p className="text-sm text-muted-foreground">
            Acompanhe os dias trabalhados, faltas e pendências da equipe.
          </p>
        </div>
        <EmptyState
          icon={Users}
          title="Cadastre um colaborador para começar."
          description="Ainda não há ninguém na Equipe."
        />
        <Button
          size="lg"
          className="w-full"
          nativeButton={false}
          render={<Link href="/equipe/novo">Novo colaborador</Link>}
        />
      </div>
    );
  }

  const normalizedSearch = normalize(search.trim());
  const activeEmployees = employees.filter((employee) => showInactive || employee.status === "active");
  const filteredEmployees = activeEmployees.filter((employee) => {
    const matchesType = typeFilter === "all" || employee.employmentType === typeFilter;
    const matchesSearch =
      normalizedSearch === "" ||
      normalize(employee.name).includes(normalizedSearch) ||
      normalize(employee.role).includes(normalizedSearch);
    return matchesType && matchesSearch;
  });

  const rows = buildOverviewRows(filteredEmployees, workPeriods, period);
  const indicators = buildAttendanceIndicators(buildOverviewRows(activeEmployees, workPeriods, period));
  const allClosed =
    rows.length > 0 && rows.every((row) => row.workPeriod !== null && getWorkPeriodStatus(row.workPeriod) === "closed");

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Frequência</h1>
        <p className="text-sm text-muted-foreground">
          Acompanhe os dias trabalhados, faltas e pendências da equipe.
        </p>
      </div>

      <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-3">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setPeriod((current) => shiftPeriod(current, -1))}
          aria-label="Mês anterior"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
        </Button>
        <div className="flex items-center gap-2">
          <span className="hidden text-sm font-semibold text-foreground sm:inline">
            {formatPeriodLabel(period)}
          </span>
          <input
            type="month"
            value={period}
            onChange={(event) => event.target.value && setPeriod(event.target.value)}
            aria-label="Selecionar período"
            className="rounded-lg border border-border bg-card px-2 py-1 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
          />
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setPeriod((current) => shiftPeriod(current, 1))}
          aria-label="Próximo mês"
        >
          <ChevronRight className="size-4" aria-hidden="true" />
        </Button>
      </div>

      <AttendanceIndicatorsBar indicators={indicators} />

      <div className="space-y-3">
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por nome ou cargo"
            aria-label="Buscar por nome ou cargo"
            className="w-full rounded-xl border border-border bg-card py-3 pr-4 pl-10 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            {(["all", "employee", "contractor"] as const).map((item) => (
              <button
                key={item}
                type="button"
                aria-pressed={typeFilter === item}
                onClick={() => setTypeFilter(item)}
                className={
                  typeFilter === item
                    ? "rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
                    : "rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:border-primary/30"
                }
              >
                {TYPE_FILTER_LABEL[item]}
              </button>
            ))}
          </div>
          <button
            type="button"
            aria-pressed={showInactive}
            onClick={() => setShowInactive((current) => !current)}
            className={
              showInactive
                ? "rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
                : "rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:border-primary/30"
            }
          >
            Mostrar inativos
          </button>
        </div>
      </div>

      {allClosed ? (
        <p className="rounded-xl border border-border bg-muted/40 px-4 py-2.5 text-sm text-muted-foreground">
          Todos os períodos deste mês estão fechados.
        </p>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Nenhum colaborador encontrado"
          description="Ajuste a busca ou o filtro para ver outros colaboradores."
        />
      ) : (
        <>
          <div className="space-y-3 lg:hidden">
            {rows.map(({ employee, workPeriod }) => (
              <AttendanceOverviewRowMobile
                key={employee.id}
                employee={employee}
                workPeriod={workPeriod}
                period={period}
                onPeriodCreated={refresh}
              />
            ))}
          </div>
          <div className="hidden overflow-x-auto rounded-xl border border-border bg-card p-4 lg:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs font-medium text-muted-foreground">
                  <th className="pb-2 pr-4 font-medium">Colaborador</th>
                  <th className="pb-2 pr-4 font-medium">Vínculo</th>
                  <th className="pb-2 pr-4 font-medium">Frequência</th>
                  <th className="pb-2 pr-4 font-medium">Pendências</th>
                  <th className="pb-2 pr-4 font-medium">Valor previsto</th>
                  <th className="pb-2 pr-4 font-medium">Situação</th>
                  <th className="pb-2 font-medium">Ação</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ employee, workPeriod }) => (
                  <AttendanceOverviewRowDesktop
                    key={employee.id}
                    employee={employee}
                    workPeriod={workPeriod}
                    period={period}
                    onPeriodCreated={refresh}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
