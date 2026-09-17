"use client";

/**
 * FRONTEND-PROJECTS-01 §26-30/§61 TR1-TR2. Mirrors
 * `features/service-orders/service-order-list.tsx`'s tenant-safety/
 * server-pagination/late-request discipline exactly — GET /api/v1/projects
 * is the sole source of truth, never localStorage, never client-side
 * filter()/slice() over a locally-held array.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { Building2, ChevronLeft, ChevronRight, Eye, Plus, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { PageTitle } from "@/components/shared/page-title";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api-client";
import { decimalStringToBrlDisplay } from "@/lib/currency";
import { cn } from "@/lib/utils";
import { useAuth } from "@/features/auth/auth-provider";
import { listProjects } from "./projects-client";
import { ProjectStatusBadge } from "./components/status-badge";
import { PROJECT_STATUS_FILTER_OPTIONS } from "./types";
import type { ProjectListItem, ProjectPaginationResponse, ProjectStatus } from "./types";

const PER_PAGE = 15;
const SEARCH_DEBOUNCE_MS = 300;

type LoadStatus = "loading" | "success" | "error";

function sourceBudgetDisplay(sourceBudget: ProjectListItem["source_budget"]): string {
  if (!sourceBudget) return "Sem orçamento de origem";
  return `${sourceBudget.number} · ${decimalStringToBrlDisplay(sourceBudget.total)}`;
}

function updatedAtDisplay(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("pt-BR");
}

interface RowActionsProps {
  project: ProjectListItem;
}

function RowActions({ project }: RowActionsProps) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      <Link
        href={`/obras/${project.id}`}
        aria-label={`Ver ${project.number}`}
        className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <Eye className="size-3.5" aria-hidden="true" />
      </Link>
    </div>
  );
}

function ProjectCard({ project }: { project: ProjectListItem }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-semibold text-foreground">{project.number}</p>
          <ProjectStatusBadge status={project.status} />
        </div>
        <p className="truncate text-sm text-foreground">{project.name}</p>
        <p className="truncate text-xs text-muted-foreground">{project.customer.name}</p>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="truncate">{sourceBudgetDisplay(project.source_budget)}</span>
          <span>{updatedAtDisplay(project.updated_at)}</span>
        </div>
      </div>
      <RowActions project={project} />
    </div>
  );
}

const GRID_COLS = "grid-cols-[100px_minmax(0,1fr)_minmax(0,1fr)_130px_108px_100px_48px] items-center gap-3";

function ProjectRow({ project }: { project: ProjectListItem }) {
  return (
    <div className={cn("grid items-center px-4 py-3.5", GRID_COLS)}>
      <span className="text-sm font-medium text-foreground">{project.number}</span>
      <span className="truncate text-sm text-foreground">{project.name}</span>
      <span className="truncate text-sm text-muted-foreground">{project.customer.name}</span>
      <span className="truncate text-sm text-muted-foreground">{sourceBudgetDisplay(project.source_budget)}</span>
      <ProjectStatusBadge status={project.status} />
      <span className="truncate text-sm text-muted-foreground">{updatedAtDisplay(project.updated_at)}</span>
      <div className="justify-self-end">
        <RowActions project={project} />
      </div>
    </div>
  );
}

function ProjectTable({ projects }: { projects: ProjectListItem[] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div
        className={cn(
          "grid border-b border-border px-4 py-2.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase",
          GRID_COLS
        )}
      >
        <span>Obra</span>
        <span>Nome</span>
        <span>Cliente</span>
        <span>Orçamento de origem</span>
        <span>Status</span>
        <span>Atualizado</span>
        <span className="justify-self-end">Ações</span>
      </div>
      <div className="divide-y divide-border">
        {projects.map((project) => (
          <ProjectRow key={project.id} project={project} />
        ))}
      </div>
    </div>
  );
}

function Pagination({ page, lastPage, onChange }: { page: number; lastPage: number; onChange: (page: number) => void }) {
  if (lastPage <= 1) return null;

  return (
    <div className="flex items-center justify-between gap-3">
      <Button type="button" variant="outline" size="sm" onClick={() => onChange(page - 1)} disabled={page <= 1}>
        <ChevronLeft className="size-4" aria-hidden="true" />
        Anterior
      </Button>
      <span className="text-xs text-muted-foreground">
        Página {page} de {lastPage}
      </span>
      <Button type="button" variant="outline" size="sm" onClick={() => onChange(page + 1)} disabled={page >= lastPage}>
        Próxima
        <ChevronRight className="size-4" aria-hidden="true" />
      </Button>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-3" role="status" aria-busy="true">
      <span className="sr-only">Carregando obras</span>
      {[0, 1, 2, 3].map((index) => (
        <Skeleton key={index} className="h-24 rounded-xl" />
      ))}
    </div>
  );
}

interface LoadedList {
  companyId: string | undefined;
  response: ProjectPaginationResponse;
}

export function ProjectList() {
  const auth = useAuth();
  const activeCompanyId = auth.activeCompany?.id;

  const [status, setStatus] = useState<LoadStatus>("loading");
  const [loaded, setLoaded] = useState<LoadedList | null>(null);
  const [errorCompanyId, setErrorCompanyId] = useState<string | undefined>(undefined);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | "">("");
  const [page, setPage] = useState(1);

  const requestSequence = useRef(0);
  const activeCompanyIdRef = useRef(activeCompanyId);
  // FRONTEND-PROJECTS-01A §21: useLayoutEffect (not useEffect) closes
  // the exact ownership window for `load()`'s own promise continuation
  // — render is already protected by `loaded.companyId ===
  // activeCompanyId`, but the live ref still gates which callback is
  // allowed to write `loaded`/`errorCompanyId` at all.
  useLayoutEffect(() => {
    activeCompanyIdRef.current = activeCompanyId;
  }, [activeCompanyId]);
  const previousCompanyIdRef = useRef(activeCompanyId);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const load = useCallback(async () => {
    const isCompanySwitch = previousCompanyIdRef.current !== activeCompanyId;
    previousCompanyIdRef.current = activeCompanyId;
    const effectivePage = isCompanySwitch ? 1 : page;
    if (isCompanySwitch) {
      setPage(1);
    }

    const requestId = ++requestSequence.current;
    const requestCompanyId = activeCompanyId;
    setStatus("loading");
    try {
      const result = await listProjects({
        search: search || undefined,
        page: effectivePage,
        perPage: PER_PAGE,
        status: statusFilter || undefined,
      });
      if (requestSequence.current !== requestId) return;
      if (activeCompanyIdRef.current !== requestCompanyId) return;
      setLoaded({ companyId: requestCompanyId, response: result });
      setStatus("success");
    } catch (error) {
      if (requestSequence.current !== requestId) return;
      if (activeCompanyIdRef.current !== requestCompanyId) return;
      if (error instanceof ApiError && error.status === 401) {
        void auth.refresh();
        return;
      }
      setStatus("error");
      setErrorCompanyId(requestCompanyId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, page, statusFilter, activeCompanyId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const currentResponse = loaded && loaded.companyId === activeCompanyId ? loaded.response : null;
  const items = currentResponse?.data ?? [];
  const lastPage = currentResponse?.meta.last_page ?? 1;
  const isCurrentTenant = currentResponse !== null;
  const isErrorForCurrentTenant = status === "error" && errorCompanyId === activeCompanyId;
  const isFiltered = search !== "" || statusFilter !== "";
  const isEmptyOverall = isCurrentTenant && status === "success" && items.length === 0 && !isFiltered && page === 1;
  const isEmptySearch = isCurrentTenant && status === "success" && items.length === 0 && !isEmptyOverall;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <PageTitle icon={Building2}>Obras</PageTitle>
          <p className="text-sm text-muted-foreground">Acompanhe suas obras em andamento.</p>
        </div>
        <Button
          size="sm"
          nativeButton={false}
          render={
            <Link href="/obras/nova">
              <Plus className="size-4" aria-hidden="true" />
              Nova obra
            </Link>
          }
        />
      </div>

      <div className="space-y-3">
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            type="text"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Buscar por obra, cliente ou número"
            aria-label="Buscar obras"
            className="w-full rounded-xl border border-border bg-card py-3 pr-4 pl-10 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {PROJECT_STATUS_FILTER_OPTIONS.map((option) => (
            <button
              key={option.value || "all"}
              type="button"
              onClick={() => {
                setStatusFilter(option.value);
                setPage(1);
              }}
              aria-pressed={statusFilter === option.value}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors",
                statusFilter === option.value
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-card text-muted-foreground"
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {isErrorForCurrentTenant ? (
        <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-6 text-center">
          <p role="alert" className="text-sm text-muted-foreground">
            Não foi possível carregar as obras agora.
          </p>
          <Button type="button" onClick={() => void load()}>
            Tentar novamente
          </Button>
        </div>
      ) : !isCurrentTenant || status === "loading" ? (
        <ListSkeleton />
      ) : isEmptyOverall ? (
        <EmptyState icon={Building2} title="Nenhuma obra ainda" description="Crie sua primeira obra para começar a acompanhar a execução." />
      ) : isEmptySearch ? (
        <EmptyState icon={Building2} title="Nenhuma obra encontrada" description="Ajuste a busca ou os filtros para ver outras obras." />
      ) : (
        <>
          <div className="space-y-3 lg:hidden">
            {items.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
          <div className="hidden lg:block">
            <ProjectTable projects={items} />
          </div>
          <Pagination page={currentResponse?.meta.current_page ?? page} lastPage={lastPage} onChange={setPage} />
        </>
      )}
    </div>
  );
}
