"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight, Plus, Receipt } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { formatCurrency } from "@/lib/currency";
import { formatDate } from "@/lib/date";
import { listAllProjects } from "@/features/projects/prototype/project-store";
import { describeDueDate, getPayableStatus, matchesStatusFilter } from "./payable-status";
import { usePayables } from "./prototype/use-payables";
import { PayableStatusBadge } from "./components/status-badge";
import {
  PAYABLE_STATUS_FILTERS,
  PAYABLE_STATUS_FILTER_LABEL,
  type Payable,
  type PayableStatusFilter,
} from "./types";

function PayableRow({ payable, projectName }: { payable: Payable; projectName?: string }) {
  const status = getPayableStatus(payable);
  const dueHint = status === "paid" ? null : describeDueDate(payable.dueDate);

  return (
    <Link
      href={`/financeiro/contas-a-pagar/${payable.id}`}
      className="flex items-center gap-3 p-3.5 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="truncate text-sm font-medium text-foreground">
          {payable.supplier ?? payable.description}
        </p>
        {payable.supplier ? (
          <p className="truncate text-xs text-muted-foreground">{payable.description}</p>
        ) : null}
        {projectName ? (
          <p className="truncate text-xs text-muted-foreground">{projectName}</p>
        ) : null}
        <p className="text-xs text-muted-foreground">
          {status === "paid" ? `Pago em ${formatDate(payable.paidAt!)}` : dueHint ?? `Vence ${formatDate(payable.dueDate)}`}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className="text-sm font-semibold tabular-nums text-foreground">
          {formatCurrency(payable.amount)}
        </span>
        <PayableStatusBadge status={status} />
      </div>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </Link>
  );
}

export function PayableList() {
  const { payables } = usePayables();
  const [filter, setFilter] = useState<PayableStatusFilter>("all");
  const projects = listAllProjects();

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

  const filtered = payables ? payables.filter((payable) => matchesStatusFilter(payable, filter)) : [];

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

      <div className="flex flex-wrap gap-2">
        {PAYABLE_STATUS_FILTERS.map((item) => (
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
            {PAYABLE_STATUS_FILTER_LABEL[item]}
          </button>
        ))}
      </div>

      {payables === undefined ? null : filtered.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title={payables.length === 0 ? "Nenhuma conta a pagar" : "Nenhuma conta neste filtro"}
          description={
            payables.length === 0
              ? "Cadastre contas de materiais, serviços e despesas administrativas."
              : "Ajuste o filtro para ver outras contas."
          }
        />
      ) : (
        <div className="divide-y divide-border rounded-xl border border-border bg-card">
          {filtered.map((payable) => (
            <PayableRow
              key={payable.id}
              payable={payable}
              projectName={
                payable.projectId
                  ? projects.find((project) => project.id === payable.projectId)?.name
                  : undefined
              }
            />
          ))}
        </div>
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
