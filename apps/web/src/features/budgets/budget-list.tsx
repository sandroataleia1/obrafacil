"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, FileText, Plus, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/currency";
import { formatDate } from "@/lib/date";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/shared/empty-state";
import { calculateBudgetTotals } from "./prototype/budget-totals";
import { listAllBudgets } from "./prototype/budget-store";
import { StatusBadge } from "./components/status-badge";
import { BUDGET_STATUS_LABEL, type Budget, type BudgetStatus } from "./types";

type BudgetStatusFilter = "all" | BudgetStatus;

const STATUS_FILTERS: BudgetStatusFilter[] = [
  "all",
  "draft",
  "pending_approval",
  "approved",
  "rejected",
];

const STATUS_FILTER_LABEL: Record<BudgetStatusFilter, string> = {
  all: "Todos",
  ...BUDGET_STATUS_LABEL,
};

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function BudgetCard({ budget }: { budget: Budget }) {
  const { total } = calculateBudgetTotals(budget);

  return (
    <Link
      href={`/orcamentos/${budget.id}`}
      className="group flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:translate-y-px"
    >
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-semibold text-foreground">
            {budget.name}
          </p>
          <StatusBadge status={budget.status} />
        </div>
        <p className="text-xs text-muted-foreground">{budget.customerName}</p>
        <div className="flex items-center justify-between">
          <span className="text-base font-semibold tabular-nums text-foreground">
            {formatCurrency(total)}
          </span>
          <span className="text-xs text-muted-foreground">
            {formatDate(budget.updatedAt)}
          </span>
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

function BudgetTableRow({ budget }: { budget: Budget }) {
  const { total } = calculateBudgetTotals(budget);

  return (
    <Link
      href={`/orcamentos/${budget.id}`}
      className={cn(
        "group flex items-center px-4 py-3.5 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
        TABLE_ROW_GRID
      )}
    >
      <div className="min-w-0 space-y-0.5">
        <p className="truncate text-sm font-medium text-foreground">{budget.name}</p>
        <p className="truncate text-xs text-muted-foreground">{budget.customerName}</p>
      </div>
      <div>
        <StatusBadge status={budget.status} />
      </div>
      <span className="text-sm font-semibold tabular-nums text-foreground">
        {formatCurrency(total)}
      </span>
      <span className="text-sm text-muted-foreground">{formatDate(budget.updatedAt)}</span>
      <ChevronRight
        className="size-4 shrink-0 justify-self-end text-muted-foreground transition-transform group-hover:translate-x-0.5"
        aria-hidden="true"
      />
    </Link>
  );
}

function BudgetTable({ budgets }: { budgets: Budget[] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div
        className={cn(
          "border-b border-border px-4 py-2.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase",
          TABLE_ROW_GRID
        )}
      >
        <span>Orçamento</span>
        <span>Status</span>
        <span>Valor</span>
        <span>Atualizado</span>
        <span />
      </div>
      <div className="divide-y divide-border">
        {budgets.map((budget) => (
          <BudgetTableRow key={budget.id} budget={budget} />
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

export function BudgetList() {
  const [budgets, setBudgets] = useState<Budget[] | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<BudgetStatusFilter>("all");
  const [mobilePage, setMobilePage] = useState(0);
  const [desktopPage, setDesktopPage] = useState(0);

  useEffect(() => {
    // localStorage read after mount: server/hydration both render `null`
    // (loading) first, so there is no mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBudgets(listAllBudgets());
  }, []);

  const normalizedSearch = normalize(search.trim());
  const filtered = (budgets ?? []).filter((budget) => {
    const matchesStatus = statusFilter === "all" || budget.status === statusFilter;
    const matchesSearch =
      normalizedSearch === "" || normalize(budget.name).includes(normalizedSearch);
    return matchesStatus && matchesSearch;
  });

  function updateSearch(value: string) {
    setSearch(value);
    setMobilePage(0);
    setDesktopPage(0);
  }

  function updateStatusFilter(value: BudgetStatusFilter) {
    setStatusFilter(value);
    setMobilePage(0);
    setDesktopPage(0);
  }

  const mobileTotalPages = Math.max(1, Math.ceil(filtered.length / MOBILE_PAGE_SIZE));
  const desktopTotalPages = Math.max(1, Math.ceil(filtered.length / DESKTOP_PAGE_SIZE));
  const mobileBudgets = filtered.slice(
    mobilePage * MOBILE_PAGE_SIZE,
    mobilePage * MOBILE_PAGE_SIZE + MOBILE_PAGE_SIZE
  );
  const desktopBudgets = filtered.slice(
    desktopPage * DESKTOP_PAGE_SIZE,
    desktopPage * DESKTOP_PAGE_SIZE + DESKTOP_PAGE_SIZE
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Orçamentos
          </h1>
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
              Novo
            </Link>
          }
        />
      </div>

      {budgets === null || budgets.length === 0 ? null : (
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
              placeholder="Buscar por nome do orçamento"
              aria-label="Buscar por nome do orçamento"
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

      {budgets === null ? null : budgets.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Nenhum orçamento ainda"
          description="Crie seu primeiro orçamento para começar a enviar propostas."
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Nenhum orçamento encontrado"
          description="Ajuste a busca ou o filtro para ver outros orçamentos."
        />
      ) : (
        <>
          <div className="space-y-3 lg:hidden">
            {mobileBudgets.map((budget) => (
              <BudgetCard key={budget.id} budget={budget} />
            ))}
            <Pagination page={mobilePage} totalPages={mobileTotalPages} onChange={setMobilePage} />
          </div>
          <div className="hidden space-y-3 lg:block">
            <BudgetTable budgets={desktopBudgets} />
            <Pagination page={desktopPage} totalPages={desktopTotalPages} onChange={setDesktopPage} />
          </div>
        </>
      )}
    </div>
  );
}
