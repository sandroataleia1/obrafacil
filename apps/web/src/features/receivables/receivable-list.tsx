"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChevronRight, Plus, Receipt as ReceiptIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { formatCurrency } from "@/lib/currency";
import { formatDate } from "@/lib/date";
import { listAllProjects } from "@/features/projects/prototype/project-store";
import { listAllCustomers } from "@/features/customers/prototype/customer-store";
import {
  calculateReceivableFinancials,
  describeDueDate,
  matchesReceivableStatusFilter,
} from "./receivable-status";
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

function ReceivableRow({
  receivable,
  customerName,
  projectName,
}: {
  receivable: Receivable;
  customerName?: string;
  projectName?: string;
}) {
  const receipts = listReceiptsByReceivable(receivable.id);
  const { receivedAmount, outstandingAmount, isOverdue, displayStatus } =
    calculateReceivableFinancials(receivable, receipts);
  const dueHint = displayStatus === "received" ? null : describeDueDate(receivable.dueDate);

  return (
    <Link
      href={`/financeiro/contas-a-receber/${receivable.id}`}
      className="flex items-center gap-3 p-3.5 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="truncate text-sm font-medium text-foreground">{receivable.description}</p>
        {customerName ? (
          <p className="truncate text-xs text-muted-foreground">{customerName}</p>
        ) : null}
        {projectName ? (
          <p className="truncate text-xs text-muted-foreground">{projectName}</p>
        ) : null}
        {displayStatus !== "received" ? (
          <p className="text-xs text-muted-foreground">
            {dueHint ?? `Vence ${formatDate(receivable.dueDate)}`}
          </p>
        ) : null}
        {displayStatus === "partial" ? (
          <p className="text-[11px] text-muted-foreground/80">
            Recebido {formatCurrency(receivedAmount)} de {formatCurrency(receivable.amount)}
          </p>
        ) : null}
        {isOverdue && receivedAmount > 0 ? (
          <p className="text-[11px] text-destructive/80">
            Em aberto {formatCurrency(outstandingAmount)}
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className="text-sm font-semibold tabular-nums text-foreground">
          {formatCurrency(receivable.amount)}
        </span>
        <ReceivableStatusBadge status={displayStatus} />
      </div>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </Link>
  );
}

export function ReceivableList() {
  const { receivables } = useReceivables();
  const [filter, setFilter] = useState<ReceivableStatusFilter>("all");
  const searchParams = useSearchParams();
  const projectId = searchParams.get("projectId");
  const projects = listAllProjects();
  const customers = listAllCustomers();
  const project = projectId ? projects.find((item) => item.id === projectId) : undefined;

  const scoped = receivables
    ? projectId
      ? receivables.filter((receivable) => receivable.projectId === projectId)
      : receivables
    : [];

  const totals = calculateReceivableTotals(scoped, listReceiptsByReceivable);
  const filtered = scoped.filter((receivable) => {
    const { displayStatus } = calculateReceivableFinancials(
      receivable,
      listReceiptsByReceivable(receivable.id)
    );
    return matchesReceivableStatusFilter(displayStatus, filter);
  });

  const newHref = projectId
    ? `/financeiro/contas-a-receber/nova?projectId=${projectId}`
    : "/financeiro/contas-a-receber/nova";

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

      <div className="flex flex-wrap gap-2">
        {RECEIVABLE_STATUS_FILTERS.map((item) => (
          <button
            key={item}
            type="button"
            aria-pressed={filter === item}
            onClick={() => setFilter(item)}
            className={
              filter === item
                ? "rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
                : "rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:border-primary/30"
            }
          >
            {RECEIVABLE_STATUS_FILTER_LABEL[item]}
          </button>
        ))}
      </div>

      {receivables === undefined ? null : filtered.length === 0 ? (
        <EmptyState
          icon={ReceiptIcon}
          title={scoped.length === 0 ? "Nenhuma conta a receber" : "Nenhuma conta neste filtro"}
          description={
            scoped.length === 0
              ? "Cadastre cobranças e acompanhe os recebimentos dos clientes."
              : "Ajuste o filtro para ver outras contas."
          }
        />
      ) : (
        <div className="divide-y divide-border rounded-xl border border-border bg-card">
          {filtered.map((receivable) => (
            <ReceivableRow
              key={receivable.id}
              receivable={receivable}
              customerName={customers.find((customer) => customer.id === receivable.customerId)?.name}
              projectName={
                receivable.projectId
                  ? projects.find((item) => item.id === receivable.projectId)?.name
                  : undefined
              }
            />
          ))}
        </div>
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
