"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Eye, Pencil, Plus, Receipt, Search, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { formatCurrency } from "@/lib/currency";
import { formatDate } from "@/lib/date";
import { cn } from "@/lib/utils";
import { listAllProjects } from "@/features/projects/prototype/project-store";
import { describeDueDate, getPayableOriginLabel, getPayableStatus, matchesStatusFilter } from "./payable-status";
import { removePayable } from "./prototype/payable";
import { usePayables } from "./prototype/use-payables";
import { PayableStatusBadge } from "./components/status-badge";
import {
  PAYABLE_STATUS_FILTERS,
  PAYABLE_STATUS_FILTER_LABEL,
  type Payable,
  type PayableStatusFilter,
} from "./types";

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

interface RowActionsProps {
  payable: Payable;
  onDelete: (payable: Payable) => void;
}

function RowActions({ payable, onDelete }: RowActionsProps) {
  const status = getPayableStatus(payable);
  return (
    <div className="flex shrink-0 items-center gap-1">
      <Link
        href={`/financeiro/contas-a-pagar/${payable.id}`}
        aria-label="Ver conta"
        className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <Eye className="size-3.5" aria-hidden="true" />
      </Link>
      {status !== "paid" ? (
        <>
          <Link
            href={`/financeiro/contas-a-pagar/${payable.id}/editar`}
            aria-label="Editar conta"
            className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Pencil className="size-3.5" aria-hidden="true" />
          </Link>
          <button
            type="button"
            onClick={() => onDelete(payable)}
            aria-label="Excluir conta"
            className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="size-3.5" aria-hidden="true" />
          </button>
        </>
      ) : null}
    </div>
  );
}

function OriginBadge({ payable }: { payable: Payable }) {
  const label = getPayableOriginLabel(payable);
  if (!label) return null;
  return (
    <span className="inline-flex shrink-0 items-center rounded-full border border-border px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
      {label}
    </span>
  );
}

function PayableCard({
  payable,
  projectName,
  onDelete,
}: {
  payable: Payable;
  projectName?: string;
  onDelete: (payable: Payable) => void;
}) {
  const status = getPayableStatus(payable);
  const dueHint = status === "paid" ? null : describeDueDate(payable.dueDate);

  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-semibold text-foreground">
            {payable.supplier ?? payable.description}
          </p>
          <PayableStatusBadge status={status} />
          <OriginBadge payable={payable} />
        </div>
        {payable.supplier ? (
          <p className="truncate text-xs text-muted-foreground">{payable.description}</p>
        ) : null}
        {projectName ? <p className="truncate text-xs text-muted-foreground">{projectName}</p> : null}
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold tabular-nums text-foreground">
            {formatCurrency(payable.amount)}
          </span>
          <span className="text-xs text-muted-foreground">
            {status === "paid"
              ? `Pago em ${formatDate(payable.paidAt!)}`
              : dueHint ?? `Vence ${formatDate(payable.dueDate)}`}
          </span>
        </div>
      </div>
      <RowActions payable={payable} onDelete={onDelete} />
    </div>
  );
}

const TABLE_ROW_GRID = "lg:grid lg:grid-cols-[minmax(0,1fr)_140px_120px_120px_112px] lg:items-center lg:gap-4";

function PayableTableRow({
  payable,
  projectName,
  onDelete,
}: {
  payable: Payable;
  projectName?: string;
  onDelete: (payable: Payable) => void;
}) {
  const status = getPayableStatus(payable);

  return (
    <div className={cn("flex items-center px-4 py-3.5", TABLE_ROW_GRID)}>
      <div className="min-w-0 space-y-0.5">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium text-foreground">
            {payable.supplier ?? payable.description}
          </p>
          <OriginBadge payable={payable} />
        </div>
        {payable.supplier ? (
          <p className="truncate text-xs text-muted-foreground">{payable.description}</p>
        ) : projectName ? (
          <p className="truncate text-xs text-muted-foreground">{projectName}</p>
        ) : null}
      </div>
      <div>
        <PayableStatusBadge status={status} />
      </div>
      <span className="text-sm font-semibold tabular-nums text-foreground">
        {formatCurrency(payable.amount)}
      </span>
      <span className="text-sm text-muted-foreground">
        {status === "paid" ? formatDate(payable.paidAt!) : formatDate(payable.dueDate)}
      </span>
      <div className="justify-self-end">
        <RowActions payable={payable} onDelete={onDelete} />
      </div>
    </div>
  );
}

function PayableTable({
  payables,
  projects,
  onDelete,
}: {
  payables: Payable[];
  projects: { id: string; name: string }[];
  onDelete: (payable: Payable) => void;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div
        className={cn(
          "border-b border-border px-4 py-2.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase",
          TABLE_ROW_GRID
        )}
      >
        <span>Conta</span>
        <span>Status</span>
        <span>Valor</span>
        <span>Vencimento</span>
        <span className="justify-self-end">Ações</span>
      </div>
      <div className="divide-y divide-border">
        {payables.map((payable) => (
          <PayableTableRow
            key={payable.id}
            payable={payable}
            projectName={
              payable.projectId ? projects.find((project) => project.id === payable.projectId)?.name : undefined
            }
            onDelete={onDelete}
          />
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

export function PayableList() {
  const { payables, refresh } = usePayables();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<PayableStatusFilter>("all");
  const [mobilePage, setMobilePage] = useState(0);
  const [desktopPage, setDesktopPage] = useState(0);
  const projects = listAllProjects();

  function handleDelete(payable: Payable) {
    const confirmed = window.confirm(
      `Remover a conta "${payable.description}"? Esta ação não pode ser desfeita.`
    );
    if (!confirmed) return;
    const result = removePayable(payable);
    if (!result.ok) {
      window.alert(result.error);
      return;
    }
    refresh();
  }

  const openTotal = payables
    ? payables
        .filter((payable) => getPayableStatus(payable) === "pending" || getPayableStatus(payable) === "overdue")
        .reduce((total, payable) => total + payable.amount, 0)
    : 0;
  const overdueTotal = payables
    ? payables
        .filter((payable) => getPayableStatus(payable) === "overdue")
        .reduce((total, payable) => total + payable.amount, 0)
    : 0;

  const normalizedSearch = normalize(search.trim());
  const filtered = (payables ?? []).filter((payable) => {
    if (!matchesStatusFilter(payable, statusFilter)) return false;
    if (normalizedSearch === "") return true;
    return (
      normalize(payable.description).includes(normalizedSearch) ||
      (payable.supplier ? normalize(payable.supplier).includes(normalizedSearch) : false)
    );
  });

  function updateSearch(value: string) {
    setSearch(value);
    setMobilePage(0);
    setDesktopPage(0);
  }

  function updateStatusFilter(value: PayableStatusFilter) {
    setStatusFilter(value);
    setMobilePage(0);
    setDesktopPage(0);
  }

  const mobileTotalPages = Math.max(1, Math.ceil(filtered.length / MOBILE_PAGE_SIZE));
  const desktopTotalPages = Math.max(1, Math.ceil(filtered.length / DESKTOP_PAGE_SIZE));
  const mobilePayables = filtered.slice(
    mobilePage * MOBILE_PAGE_SIZE,
    mobilePage * MOBILE_PAGE_SIZE + MOBILE_PAGE_SIZE
  );
  const desktopPayables = filtered.slice(
    desktopPage * DESKTOP_PAGE_SIZE,
    desktopPage * DESKTOP_PAGE_SIZE + DESKTOP_PAGE_SIZE
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Contas a pagar</h1>
          <p className="text-sm text-muted-foreground">Acompanhe contas e vencimentos da empresa.</p>
        </div>
        <Button
          size="sm"
          nativeButton={false}
          render={
            <Link href="/financeiro/contas-a-pagar/nova">
              <Plus className="size-4" aria-hidden="true" />
              Nova
            </Link>
          }
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Em aberto</p>
          <p className="text-lg font-semibold tabular-nums text-foreground">{formatCurrency(openTotal)}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Vencidas</p>
          <p className="text-lg font-semibold tabular-nums text-destructive">{formatCurrency(overdueTotal)}</p>
        </div>
      </div>

      {payables === undefined || payables.length === 0 ? null : (
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
              placeholder="Buscar por descrição ou fornecedor"
              aria-label="Buscar por descrição ou fornecedor"
              className="w-full rounded-xl border border-border bg-card py-3 pr-4 pl-10 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {PAYABLE_STATUS_FILTERS.map((item) => (
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
                {PAYABLE_STATUS_FILTER_LABEL[item]}
              </button>
            ))}
          </div>
        </div>
      )}

      {payables === undefined ? null : payables.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="Nenhuma conta a pagar"
          description="Cadastre contas de materiais, serviços e despesas administrativas."
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="Nenhuma conta encontrada"
          description="Ajuste a busca ou o filtro para ver outras contas."
        />
      ) : (
        <>
          <div className="space-y-3 lg:hidden">
            {mobilePayables.map((payable) => (
              <PayableCard
                key={payable.id}
                payable={payable}
                projectName={
                  payable.projectId ? projects.find((project) => project.id === payable.projectId)?.name : undefined
                }
                onDelete={handleDelete}
              />
            ))}
            <Pagination page={mobilePage} totalPages={mobileTotalPages} onChange={setMobilePage} />
          </div>
          <div className="hidden space-y-3 lg:block">
            <PayableTable payables={desktopPayables} projects={projects} onDelete={handleDelete} />
            <Pagination page={desktopPage} totalPages={desktopTotalPages} onChange={setDesktopPage} />
          </div>
        </>
      )}

      {payables !== undefined && payables.length === 0 ? (
        <Button
          size="lg"
          className="w-full"
          nativeButton={false}
          render={<Link href="/financeiro/contas-a-pagar/nova">Criar primeira conta</Link>}
        />
      ) : null}
    </div>
  );
}
