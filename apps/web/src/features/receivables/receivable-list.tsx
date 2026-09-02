"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  Pencil,
  Plus,
  Receipt as ReceiptIcon,
  Search,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { formatCurrency } from "@/lib/currency";
import { formatDate } from "@/lib/date";
import { cn } from "@/lib/utils";
import { listAllProjects } from "@/features/projects/prototype/project-store";
import { listAllCustomers } from "@/features/customers/prototype/customer-store";
import {
  calculateReceivableFinancials,
  describeDueDate,
  matchesReceivableStatusFilter,
} from "./receivable-status";
import { removeReceivable } from "./prototype/receivable";
import { listReceiptsByReceivable } from "./prototype/receipt-store";
import { calculateReceivableTotals } from "./prototype/receivable-totals";
import { useReceivables } from "./prototype/use-receivables";
import { ReceivableStatusBadge } from "./components/status-badge";
import {
  RECEIVABLE_STATUS_FILTERS,
  RECEIVABLE_STATUS_FILTER_LABEL,
  type Receivable,
  type ReceivableStatusFilter,
} from "./types";

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

interface RowActionsProps {
  receivable: Receivable;
  onDelete: (receivable: Receivable) => void;
}

function RowActions({ receivable, onDelete }: RowActionsProps) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      <Link
        href={`/financeiro/contas-a-receber/${receivable.id}`}
        aria-label="Ver conta"
        className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <Eye className="size-3.5" aria-hidden="true" />
      </Link>
      <Link
        href={`/financeiro/contas-a-receber/${receivable.id}/editar`}
        aria-label="Editar conta"
        className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <Pencil className="size-3.5" aria-hidden="true" />
      </Link>
      <button
        type="button"
        onClick={() => onDelete(receivable)}
        aria-label="Excluir conta"
        className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
      >
        <Trash2 className="size-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}

function ReceivableCard({
  receivable,
  customerName,
  projectName,
  onDelete,
}: {
  receivable: Receivable;
  customerName?: string;
  projectName?: string;
  onDelete: (receivable: Receivable) => void;
}) {
  const receipts = listReceiptsByReceivable(receivable.id);
  const { receivedAmount, outstandingAmount, isOverdue, displayStatus } =
    calculateReceivableFinancials(receivable, receipts);
  const dueHint = displayStatus === "received" ? null : describeDueDate(receivable.dueDate);

  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-semibold text-foreground">{receivable.description}</p>
          <ReceivableStatusBadge status={displayStatus} />
        </div>
        {customerName ? <p className="truncate text-xs text-muted-foreground">{customerName}</p> : null}
        {projectName ? <p className="truncate text-xs text-muted-foreground">{projectName}</p> : null}
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold tabular-nums text-foreground">
            {formatCurrency(receivable.amount)}
          </span>
          {displayStatus !== "received" ? (
            <span className="text-xs text-muted-foreground">
              {dueHint ?? `Vence ${formatDate(receivable.dueDate)}`}
            </span>
          ) : null}
        </div>
        {displayStatus === "partial" ? (
          <p className="text-[11px] text-muted-foreground/80">
            Recebido {formatCurrency(receivedAmount)} de {formatCurrency(receivable.amount)}
          </p>
        ) : null}
        {isOverdue && receivedAmount > 0 ? (
          <p className="text-[11px] text-destructive/80">Em aberto {formatCurrency(outstandingAmount)}</p>
        ) : null}
      </div>
      <RowActions receivable={receivable} onDelete={onDelete} />
    </div>
  );
}

const TABLE_ROW_GRID = "lg:grid lg:grid-cols-[minmax(0,1fr)_140px_120px_120px_112px] lg:items-center lg:gap-4";

function ReceivableTableRow({
  receivable,
  customerName,
  projectName,
  onDelete,
}: {
  receivable: Receivable;
  customerName?: string;
  projectName?: string;
  onDelete: (receivable: Receivable) => void;
}) {
  const receipts = listReceiptsByReceivable(receivable.id);
  const { displayStatus } = calculateReceivableFinancials(receivable, receipts);

  return (
    <div className={cn("flex items-center px-4 py-3.5", TABLE_ROW_GRID)}>
      <div className="min-w-0 space-y-0.5">
        <p className="truncate text-sm font-medium text-foreground">{receivable.description}</p>
        <p className="truncate text-xs text-muted-foreground">
          {[customerName, projectName].filter(Boolean).join(" · ")}
        </p>
      </div>
      <div>
        <ReceivableStatusBadge status={displayStatus} />
      </div>
      <span className="text-sm font-semibold tabular-nums text-foreground">
        {formatCurrency(receivable.amount)}
      </span>
      <span className="text-sm text-muted-foreground">{formatDate(receivable.dueDate)}</span>
      <div className="justify-self-end">
        <RowActions receivable={receivable} onDelete={onDelete} />
      </div>
    </div>
  );
}

function ReceivableTable({
  receivables,
  customers,
  projects,
  onDelete,
}: {
  receivables: Receivable[];
  customers: { id: string; name: string }[];
  projects: { id: string; name: string }[];
  onDelete: (receivable: Receivable) => void;
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
        {receivables.map((receivable) => (
          <ReceivableTableRow
            key={receivable.id}
            receivable={receivable}
            customerName={customers.find((customer) => customer.id === receivable.customerId)?.name}
            projectName={
              receivable.projectId
                ? projects.find((project) => project.id === receivable.projectId)?.name
                : undefined
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

export function ReceivableList() {
  const { receivables, refresh } = useReceivables();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ReceivableStatusFilter>("all");
  const [mobilePage, setMobilePage] = useState(0);
  const [desktopPage, setDesktopPage] = useState(0);
  const searchParams = useSearchParams();
  const projectId = searchParams.get("projectId");
  const projects = listAllProjects();
  const customers = listAllCustomers();
  const project = projectId ? projects.find((item) => item.id === projectId) : undefined;

  function handleDelete(receivable: Receivable) {
    const confirmed = window.confirm(
      `Remover a conta "${receivable.description}"? Esta ação não pode ser desfeita.`
    );
    if (!confirmed) return;
    const result = removeReceivable(receivable);
    if (!result.ok) {
      window.alert(result.error);
      return;
    }
    refresh();
  }

  const scoped = receivables
    ? projectId
      ? receivables.filter((receivable) => receivable.projectId === projectId)
      : receivables
    : [];

  const totals = calculateReceivableTotals(scoped, listReceiptsByReceivable);

  const normalizedSearch = normalize(search.trim());
  const filtered = scoped.filter((receivable) => {
    const { displayStatus } = calculateReceivableFinancials(
      receivable,
      listReceiptsByReceivable(receivable.id)
    );
    if (!matchesReceivableStatusFilter(displayStatus, statusFilter)) return false;
    if (normalizedSearch === "") return true;
    const customerName = customers.find((customer) => customer.id === receivable.customerId)?.name ?? "";
    return (
      normalize(receivable.description).includes(normalizedSearch) ||
      normalize(customerName).includes(normalizedSearch)
    );
  });

  function updateSearch(value: string) {
    setSearch(value);
    setMobilePage(0);
    setDesktopPage(0);
  }

  function updateStatusFilter(value: ReceivableStatusFilter) {
    setStatusFilter(value);
    setMobilePage(0);
    setDesktopPage(0);
  }

  const newHref = projectId
    ? `/financeiro/contas-a-receber/nova?projectId=${projectId}`
    : "/financeiro/contas-a-receber/nova";

  const mobileTotalPages = Math.max(1, Math.ceil(filtered.length / MOBILE_PAGE_SIZE));
  const desktopTotalPages = Math.max(1, Math.ceil(filtered.length / DESKTOP_PAGE_SIZE));
  const mobileReceivables = filtered.slice(
    mobilePage * MOBILE_PAGE_SIZE,
    mobilePage * MOBILE_PAGE_SIZE + MOBILE_PAGE_SIZE
  );
  const desktopReceivables = filtered.slice(
    desktopPage * DESKTOP_PAGE_SIZE,
    desktopPage * DESKTOP_PAGE_SIZE + DESKTOP_PAGE_SIZE
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Contas a receber
          </h1>
          <p className="text-sm text-muted-foreground">
            {project ? `Cobranças de ${project.name}` : "Acompanhe cobranças e recebimentos dos clientes."}
          </p>
        </div>
        <Button
          size="sm"
          nativeButton={false}
          render={
            <Link href={newHref}>
              <Plus className="size-4" aria-hidden="true" />
              Nova
            </Link>
          }
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            A receber
          </p>
          <p className="text-lg font-semibold tabular-nums text-foreground">
            {formatCurrency(totals.totalOutstanding)}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Vencido
          </p>
          <p className="text-lg font-semibold tabular-nums text-destructive">
            {formatCurrency(totals.overdueOutstanding)}
          </p>
        </div>
      </div>

      {receivables === undefined || scoped.length === 0 ? null : (
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
              placeholder="Buscar por descrição ou cliente"
              aria-label="Buscar por descrição ou cliente"
              className="w-full rounded-xl border border-border bg-card py-3 pr-4 pl-10 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {RECEIVABLE_STATUS_FILTERS.map((item) => (
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
                {RECEIVABLE_STATUS_FILTER_LABEL[item]}
              </button>
            ))}
          </div>
        </div>
      )}

      {receivables === undefined ? null : scoped.length === 0 ? (
        <EmptyState
          icon={ReceiptIcon}
          title="Nenhuma conta a receber"
          description="Cadastre cobranças e acompanhe os recebimentos dos clientes."
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={ReceiptIcon}
          title="Nenhuma conta encontrada"
          description="Ajuste a busca ou o filtro para ver outras contas."
        />
      ) : (
        <>
          <div className="space-y-3 lg:hidden">
            {mobileReceivables.map((receivable) => (
              <ReceivableCard
                key={receivable.id}
                receivable={receivable}
                customerName={customers.find((customer) => customer.id === receivable.customerId)?.name}
                projectName={
                  receivable.projectId
                    ? projects.find((item) => item.id === receivable.projectId)?.name
                    : undefined
                }
                onDelete={handleDelete}
              />
            ))}
            <Pagination page={mobilePage} totalPages={mobileTotalPages} onChange={setMobilePage} />
          </div>
          <div className="hidden space-y-3 lg:block">
            <ReceivableTable
              receivables={desktopReceivables}
              customers={customers}
              projects={projects}
              onDelete={handleDelete}
            />
            <Pagination page={desktopPage} totalPages={desktopTotalPages} onChange={setDesktopPage} />
          </div>
        </>
      )}

      {receivables !== undefined && scoped.length === 0 ? (
        <Button
          size="lg"
          className="w-full"
          nativeButton={false}
          render={<Link href={newHref}>Criar primeira conta</Link>}
        />
      ) : null}
    </div>
  );
}
