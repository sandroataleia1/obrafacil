"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Eye, Pencil, Plus, Search, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { formatCurrency } from "@/lib/currency";
import { cn } from "@/lib/utils";
import { calculatePeriodEstimate } from "./prototype/period-calculation";
import { formatPeriodShort } from "./prototype/period-label";
import { listWorkPeriodsByEmployee } from "./prototype/work-period-store";
import { useEmployees } from "./prototype/use-employees";
import { EmployeeStatusBadge } from "./components/status-badge";
import { EMPLOYEE_STATUS_LABEL, getWorkPeriodStatus, type Employee, type EmployeeStatus } from "./types";

type EmployeeStatusFilter = "all" | EmployeeStatus;

const STATUS_FILTERS: EmployeeStatusFilter[] = ["all", "active", "inactive"];

const STATUS_FILTER_LABEL: Record<EmployeeStatusFilter, string> = {
  all: "Todos",
  ...EMPLOYEE_STATUS_LABEL,
};

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function getPeriodSummary(employee: Employee): string {
  const periods = listWorkPeriodsByEmployee(employee.id);
  const latestPeriod = periods[0];

  if (!latestPeriod) return `${formatCurrency(employee.baseSalary)}/mês`;

  if (getWorkPeriodStatus(latestPeriod) === "closed") {
    return `${formatPeriodShort(latestPeriod.period)} fechado · ${formatCurrency(
      calculatePeriodEstimate(latestPeriod).estimatedPay
    )} previsto`;
  }

  return `${formatPeriodShort(latestPeriod.period)} · ${latestPeriod.workedDays} de ${latestPeriod.expectedDays} dias`;
}

interface RowActionsProps {
  employee: Employee;
}

function RowActions({ employee }: RowActionsProps) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      <Link
        href={`/equipe/${employee.id}`}
        aria-label={`Ver ${employee.name}`}
        className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <Eye className="size-3.5" aria-hidden="true" />
      </Link>
      <Link
        href={`/equipe/${employee.id}/editar`}
        aria-label={`Editar ${employee.name}`}
        className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <Pencil className="size-3.5" aria-hidden="true" />
      </Link>
    </div>
  );
}

function EmployeeCard({ employee }: { employee: Employee }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-semibold text-foreground">{employee.name}</p>
          {employee.status === "inactive" ? <EmployeeStatusBadge status="inactive" /> : null}
        </div>
        <p className="text-xs text-muted-foreground">{employee.role}</p>
        <p className="text-sm text-muted-foreground">{getPeriodSummary(employee)}</p>
      </div>
      <RowActions employee={employee} />
    </div>
  );
}

const TABLE_ROW_GRID = "lg:grid lg:grid-cols-[minmax(0,1fr)_120px_240px_88px] lg:items-center lg:gap-4";

function EmployeeTableRow({ employee }: { employee: Employee }) {
  return (
    <div className={cn("flex items-center px-4 py-3.5", TABLE_ROW_GRID)}>
      <div className="min-w-0 space-y-0.5">
        <p className="truncate text-sm font-medium text-foreground">{employee.name}</p>
        <p className="truncate text-xs text-muted-foreground">{employee.role}</p>
      </div>
      <div>
        <EmployeeStatusBadge status={employee.status} />
      </div>
      <span className="text-sm text-muted-foreground">{getPeriodSummary(employee)}</span>
      <div className="justify-self-end">
        <RowActions employee={employee} />
      </div>
    </div>
  );
}

function EmployeeTable({ employees }: { employees: Employee[] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div
        className={cn(
          "border-b border-border px-4 py-2.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase",
          TABLE_ROW_GRID
        )}
      >
        <span>Funcionário</span>
        <span>Status</span>
        <span>Período</span>
        <span className="justify-self-end">Ações</span>
      </div>
      <div className="divide-y divide-border">
        {employees.map((employee) => (
          <EmployeeTableRow key={employee.id} employee={employee} />
        ))}
      </div>
    </div>
  );
}

const MOBILE_PAGE_SIZE = 5;
const DESKTOP_PAGE_SIZE = 15;

function Pagination({
  page,
  totalPages,
  onChange,
  className,
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
  className?: string;
}) {
  if (totalPages <= 1) return null;

  return (
    <div className={cn("flex items-center justify-between gap-3", className)}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onChange(page - 1)}
        disabled={page === 0}
      >
        <ChevronLeft className="size-4" aria-hidden="true" />
        Anterior
      </Button>
      <span className="text-xs text-muted-foreground">
        Página {page + 1} de {totalPages}
      </span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onChange(page + 1)}
        disabled={page >= totalPages - 1}
      >
        Próxima
        <ChevronRight className="size-4" aria-hidden="true" />
      </Button>
    </div>
  );
}

export function EmployeeList() {
  const { employees } = useEmployees();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<EmployeeStatusFilter>("all");
  const [mobilePage, setMobilePage] = useState(0);
  const [desktopPage, setDesktopPage] = useState(0);

  const normalizedSearch = normalize(search.trim());
  const filtered = (employees ?? []).filter((employee) => {
    const matchesStatus = statusFilter === "all" || employee.status === statusFilter;
    const matchesSearch =
      normalizedSearch === "" || normalize(employee.name).includes(normalizedSearch);
    return matchesStatus && matchesSearch;
  });

  function updateSearch(value: string) {
    setSearch(value);
    setMobilePage(0);
    setDesktopPage(0);
  }

  function updateStatusFilter(value: EmployeeStatusFilter) {
    setStatusFilter(value);
    setMobilePage(0);
    setDesktopPage(0);
  }

  const mobileTotalPages = Math.max(1, Math.ceil(filtered.length / MOBILE_PAGE_SIZE));
  const desktopTotalPages = Math.max(1, Math.ceil(filtered.length / DESKTOP_PAGE_SIZE));
  const mobileEmployees = filtered.slice(
    mobilePage * MOBILE_PAGE_SIZE,
    mobilePage * MOBILE_PAGE_SIZE + MOBILE_PAGE_SIZE
  );
  const desktopEmployees = filtered.slice(
    desktopPage * DESKTOP_PAGE_SIZE,
    desktopPage * DESKTOP_PAGE_SIZE + DESKTOP_PAGE_SIZE
  );

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

      {employees === undefined || employees.length === 0 ? null : (
        <div className="space-y-3">
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              type="text"
              value={search}
              onChange={(event) => updateSearch(event.target.value)}
              placeholder="Buscar por nome do funcionário"
              aria-label="Buscar por nome do funcionário"
              className="w-full rounded-xl border border-border bg-card py-3 pr-4 pl-10 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {STATUS_FILTERS.map((item) => (
              <button
                key={item}
                type="button"
                aria-pressed={statusFilter === item}
                onClick={() => updateStatusFilter(item)}
                className={
                  statusFilter === item
                    ? "rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
                    : "rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:border-primary/30"
                }
              >
                {STATUS_FILTER_LABEL[item]}
              </button>
            ))}
          </div>
        </div>
      )}

      {employees === undefined ? null : employees.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Nenhum funcionário cadastrado"
          description="Adicione sua equipe para controlar os dias trabalhados."
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Nenhum funcionário encontrado"
          description="Ajuste a busca ou o filtro para ver outros funcionários."
        />
      ) : (
        <>
          <div className="space-y-3 lg:hidden">
            {mobileEmployees.map((employee) => (
              <EmployeeCard key={employee.id} employee={employee} />
            ))}
            <Pagination page={mobilePage} totalPages={mobileTotalPages} onChange={setMobilePage} />
          </div>
          <div className="hidden space-y-3 lg:block">
            <EmployeeTable employees={desktopEmployees} />
            <Pagination page={desktopPage} totalPages={desktopTotalPages} onChange={setDesktopPage} />
          </div>
        </>
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
