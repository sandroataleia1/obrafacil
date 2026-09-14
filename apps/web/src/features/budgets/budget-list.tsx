"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { FileText, Plus, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { PageTitle } from "@/components/shared/page-title";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api-client";
import { decimalStringToBrlDisplay } from "@/lib/currency";
import { cn } from "@/lib/utils";
import { useAuth } from "@/features/auth/auth-provider";
import { listBudgets } from "./budgets-client";
import { Pagination } from "./components/pagination";
import { StatusBadge } from "./components/status-badge";
import type { BudgetListItem, BudgetPaginationResponse, BudgetStatus } from "./types";

const PER_PAGE = 15;
const SEARCH_DEBOUNCE_MS = 300;

type LoadStatus = "loading" | "success" | "error";

const STATUS_FILTER_OPTIONS: { value: BudgetStatus | ""; label: string }[] = [
  { value: "", label: "Todos" },
  { value: "draft", label: "Rascunhos" },
  { value: "pending_approval", label: "Aguardando aprovação" },
  { value: "approved", label: "Aprovados" },
  { value: "rejected", label: "Recusados" },
];

/** `updated_at` -> a short Brazilian date, never through `lib/date`'s
 * `formatDate` (which expects a date-only "YYYY-MM-DD" string, not a
 * full ISO instant). */
function updatedDisplay(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("pt-BR");
}

/**
 * `margin_percentage` is a raw decimal string ("22.5000") from the API.
 * A comma-swap keeps every digit exactly as the server sent it — never
 * routed through `Number()`, which could lose trailing zeros. Renders
 * "—" whenever either margin field is `null` (§ never invent a 0%
 * margin the API didn't send).
 */
function marginDisplay(item: BudgetListItem): string {
  if (item.margin_amount === null || item.margin_percentage === null) return "—";
  return `${item.margin_percentage.replace(".", ",")}%`;
}

function BudgetCard({ budget }: { budget: BudgetListItem }) {
  return (
    <Link
      href={`/orcamentos/${budget.id}`}
      className="group flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:translate-y-px"
    >
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-semibold text-foreground">{budget.number}</p>
          <StatusBadge status={budget.status} />
        </div>
        <p className="truncate text-sm text-foreground">{budget.title}</p>
        <p className="truncate text-xs text-muted-foreground">{budget.customer.name}</p>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="text-base font-semibold tabular-nums text-foreground">
            {decimalStringToBrlDisplay(budget.total)}
          </span>
          <span>{updatedDisplay(budget.updated_at)}</span>
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Margem {marginDisplay(budget)}</span>
        </div>
      </div>
    </Link>
  );
}

const TABLE_ROW_GRID =
  "lg:grid lg:grid-cols-[minmax(0,1fr)_160px_120px_110px_120px_100px] lg:items-center lg:gap-4";

function BudgetTableRow({ budget }: { budget: BudgetListItem }) {
  return (
    <Link
      href={`/orcamentos/${budget.id}`}
      className={cn(
        "group flex items-center px-4 py-3.5 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
        TABLE_ROW_GRID
      )}
    >
      <div className="min-w-0 space-y-0.5">
        <p className="truncate text-sm font-medium text-foreground">{budget.number}</p>
        <p className="truncate text-xs text-muted-foreground">{budget.title}</p>
      </div>
      <span className="truncate text-sm text-muted-foreground">{budget.customer.name}</span>
      <div>
        <StatusBadge status={budget.status} />
      </div>
      <span className="text-sm font-semibold tabular-nums text-foreground">
        {decimalStringToBrlDisplay(budget.total)}
      </span>
      <span className="text-sm tabular-nums text-muted-foreground">{marginDisplay(budget)}</span>
      <span className="text-sm text-muted-foreground">{updatedDisplay(budget.updated_at)}</span>
    </Link>
  );
}

function BudgetTable({ budgets }: { budgets: BudgetListItem[] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div
        className={cn(
          "border-b border-border px-4 py-2.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase",
          TABLE_ROW_GRID
        )}
      >
        <span>Orçamento</span>
        <span>Cliente</span>
        <span>Status</span>
        <span>Valor</span>
        <span>Margem</span>
        <span>Atualizado</span>
      </div>
      <div className="divide-y divide-border">
        {budgets.map((budget) => (
          <BudgetTableRow key={budget.id} budget={budget} />
        ))}
      </div>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-3" role="status" aria-busy="true">
      <span className="sr-only">Carregando orçamentos</span>
      {[0, 1, 2, 3].map((index) => (
        <Skeleton key={index} className="h-24 rounded-xl" />
      ))}
    </div>
  );
}

interface LoadedList {
  companyId: string | undefined;
  response: BudgetPaginationResponse;
}

export function BudgetList() {
  const auth = useAuth();
  const activeCompanyId = auth.activeCompany?.id;

  const [status, setStatus] = useState<LoadStatus>("loading");
  const [loaded, setLoaded] = useState<LoadedList | null>(null);
  const [errorCompanyId, setErrorCompanyId] = useState<string | undefined>(undefined);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<BudgetStatus | "">("");
  const [page, setPage] = useState(1);

  const requestSequence = useRef(0);
  const activeCompanyIdRef = useRef(activeCompanyId);
  useEffect(() => {
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
      const result = await listBudgets({
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
  const meta = currentResponse?.meta;
  const isCurrentTenant = currentResponse !== null;
  // §Tenant safety: an error resolved for a since-departed company must
  // never render — mirrors `ServiceOrderList`'s equivalent gate. Without
  // this, a stale "error" status can flash for one render under the new
  // company before its own request even fires/resolves.
  const isErrorForCurrentTenant = status === "error" && errorCompanyId === activeCompanyId;
  const isFiltered = search !== "" || statusFilter !== "";
  const isEmptyOverall = isCurrentTenant && status === "success" && items.length === 0 && !isFiltered && page === 1;
  const isEmptySearch = isCurrentTenant && status === "success" && items.length === 0 && !isEmptyOverall;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <PageTitle icon={FileText}>Orçamentos</PageTitle>
          <p className="text-sm text-muted-foreground">
            Acompanhe e crie propostas para seus clientes.
          </p>
        </div>
        <Button
          size="sm"
          nativeButton={false}
          render={
            <Link href="/orcamentos/novo">
              <Plus className="size-4" aria-hidden="true" />
              Novo orçamento
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
            placeholder="Buscar por número, título, referência ou cliente"
            aria-label="Buscar por número, título, referência ou cliente"
            className="w-full rounded-xl border border-border bg-card py-3 pr-4 pl-10 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {STATUS_FILTER_OPTIONS.map((option) => (
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
            Não foi possível carregar os orçamentos agora.
          </p>
          <Button type="button" onClick={() => void load()}>
            Tentar novamente
          </Button>
        </div>
      ) : !isCurrentTenant || status === "loading" ? (
        <ListSkeleton />
      ) : isEmptyOverall ? (
        <EmptyState
          icon={FileText}
          title="Nenhum orçamento cadastrado"
          description="Crie seu primeiro orçamento para começar a enviar propostas."
        />
      ) : isEmptySearch ? (
        <EmptyState
          icon={FileText}
          title="Nenhum orçamento encontrado"
          description="Ajuste a busca ou o filtro para ver outros orçamentos."
        />
      ) : (
        <>
          <div className="space-y-3 lg:hidden">
            {items.map((budget) => (
              <BudgetCard key={budget.id} budget={budget} />
            ))}
          </div>
          <div className="hidden lg:block">
            <BudgetTable budgets={items} />
          </div>
          <Pagination
            page={(meta?.current_page ?? page) - 1}
            totalPages={meta?.last_page ?? 1}
            totalItems={meta?.total ?? 0}
            pageSize={meta?.per_page ?? PER_PAGE}
            itemLabel="orçamentos"
            ariaLabel="Paginação de orçamentos"
            onChange={(nextPage) => setPage(nextPage + 1)}
          />
        </>
      )}
    </div>
  );
}
