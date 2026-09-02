"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BrickWall, ChevronLeft, ChevronRight, Plus, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { formatCurrency } from "@/lib/currency";
import { formatDate } from "@/lib/date";
import { cn } from "@/lib/utils";
import { calculateBudgetTotals } from "@/features/budgets/prototype/budget-totals";
import { getBudget } from "@/features/budgets/prototype/budget-store";
import { listAllProjects } from "./prototype/project-store";
import { ProjectStatusBadge } from "./components/status-badge";
import { PROJECT_STATUS_LABEL, type Project, type ProjectStatus } from "./types";

type ProjectStatusFilter = "all" | ProjectStatus;

const STATUS_FILTERS: ProjectStatusFilter[] = [
  "all",
  "planning",
  "in_progress",
  "paused",
  "completed",
];

const STATUS_FILTER_LABEL: Record<ProjectStatusFilter, string> = {
  all: "Todos",
  ...PROJECT_STATUS_LABEL,
};

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function getProjectBudgetTotal(project: Project): number | null {
  const budget = project.budgetId ? getBudget(project.budgetId) : null;
  return budget ? calculateBudgetTotals(budget).total : null;
}

function ProjectCard({ project }: { project: Project }) {
  const budgetTotal = getProjectBudgetTotal(project);

  return (
    <Link
      href={`/obras/${project.id}`}
      className="group flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:translate-y-px"
    >
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-semibold text-foreground">{project.name}</p>
          <ProjectStatusBadge status={project.status} />
        </div>
        <p className="text-xs text-muted-foreground">{project.customerName}</p>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium tabular-nums text-foreground">
            {budgetTotal !== null ? formatCurrency(budgetTotal) : "Sem orçamento vinculado"}
          </span>
          <span className="text-xs text-muted-foreground">{formatDate(project.updatedAt)}</span>
        </div>
      </div>
      <ChevronRight
        className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
        aria-hidden="true"
      />
    </Link>
  );
}

const TABLE_ROW_GRID = "lg:grid lg:grid-cols-[minmax(0,1fr)_150px_140px_110px_20px] lg:items-center lg:gap-4";

function ProjectTableRow({ project }: { project: Project }) {
  const budgetTotal = getProjectBudgetTotal(project);

  return (
    <Link
      href={`/obras/${project.id}`}
      className={cn(
        "group flex items-center px-4 py-3.5 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
        TABLE_ROW_GRID
      )}
    >
      <div className="min-w-0 space-y-0.5">
        <p className="truncate text-sm font-medium text-foreground">{project.name}</p>
        <p className="truncate text-xs text-muted-foreground">{project.customerName}</p>
      </div>
      <div>
        <ProjectStatusBadge status={project.status} />
      </div>
      <span className="text-sm font-semibold tabular-nums text-foreground">
        {budgetTotal !== null ? formatCurrency(budgetTotal) : "—"}
      </span>
      <span className="text-sm text-muted-foreground">{formatDate(project.updatedAt)}</span>
      <ChevronRight
        className="size-4 shrink-0 justify-self-end text-muted-foreground transition-transform group-hover:translate-x-0.5"
        aria-hidden="true"
      />
    </Link>
  );
}

function ProjectTable({ projects }: { projects: Project[] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div
        className={cn(
          "border-b border-border px-4 py-2.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase",
          TABLE_ROW_GRID
        )}
      >
        <span>Obra</span>
        <span>Status</span>
        <span>Valor</span>
        <span>Atualizado</span>
        <span />
      </div>
      <div className="divide-y divide-border">
        {projects.map((project) => (
          <ProjectTableRow key={project.id} project={project} />
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

export function ProjectList() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ProjectStatusFilter>("all");
  const [mobilePage, setMobilePage] = useState(0);
  const [desktopPage, setDesktopPage] = useState(0);

  useEffect(() => {
    // localStorage read after mount: server/hydration both render `null`
    // (loading) first, so there is no mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setProjects(listAllProjects());
  }, []);

  const normalizedSearch = normalize(search.trim());
  const filtered = (projects ?? []).filter((project) => {
    const matchesStatus = statusFilter === "all" || project.status === statusFilter;
    const matchesSearch =
      normalizedSearch === "" || normalize(project.name).includes(normalizedSearch);
    return matchesStatus && matchesSearch;
  });

  function updateSearch(value: string) {
    setSearch(value);
    setMobilePage(0);
    setDesktopPage(0);
  }

  function updateStatusFilter(value: ProjectStatusFilter) {
    setStatusFilter(value);
    setMobilePage(0);
    setDesktopPage(0);
  }

  const mobileTotalPages = Math.max(1, Math.ceil(filtered.length / MOBILE_PAGE_SIZE));
  const desktopTotalPages = Math.max(1, Math.ceil(filtered.length / DESKTOP_PAGE_SIZE));
  const mobileProjects = filtered.slice(
    mobilePage * MOBILE_PAGE_SIZE,
    mobilePage * MOBILE_PAGE_SIZE + MOBILE_PAGE_SIZE
  );
  const desktopProjects = filtered.slice(
    desktopPage * DESKTOP_PAGE_SIZE,
    desktopPage * DESKTOP_PAGE_SIZE + DESKTOP_PAGE_SIZE
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Obras</h1>
          <p className="text-sm text-muted-foreground">
            Acompanhe a execução de cada obra.
          </p>
        </div>
        <Button
          size="sm"
          nativeButton={false}
          render={
            <Link href="/obras/nova">
              <Plus className="size-4" aria-hidden="true" />
              Nova
            </Link>
          }
        />
      </div>

      {projects === null || projects.length === 0 ? null : (
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
              placeholder="Buscar por nome da obra"
              aria-label="Buscar por nome da obra"
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

      {projects === null ? null : projects.length === 0 ? (
        <EmptyState
          icon={BrickWall}
          title="Nenhuma obra ainda"
          description="Crie uma obra manualmente ou a partir de um orçamento aprovado."
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={BrickWall}
          title="Nenhuma obra encontrada"
          description="Ajuste a busca ou o filtro para ver outras obras."
        />
      ) : (
        <>
          <div className="space-y-3 lg:hidden">
            {mobileProjects.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
            <Pagination page={mobilePage} totalPages={mobileTotalPages} onChange={setMobilePage} />
          </div>
          <div className="hidden space-y-3 lg:block">
            <ProjectTable projects={desktopProjects} />
            <Pagination page={desktopPage} totalPages={desktopTotalPages} onChange={setDesktopPage} />
          </div>
        </>
      )}
    </div>
  );
}
