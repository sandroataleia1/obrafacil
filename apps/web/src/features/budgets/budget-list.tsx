"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, FileText, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/currency";
import { formatDate } from "@/lib/date";
import { EmptyState } from "@/components/shared/empty-state";
import { calculateBudgetTotals } from "./prototype/budget-totals";
import { listAllBudgets } from "./prototype/budget-store";
import { StatusBadge } from "./components/status-badge";
import type { Budget } from "./types";

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

export function BudgetList() {
  const [budgets, setBudgets] = useState<Budget[] | null>(null);

  useEffect(() => {
    // localStorage read after mount: server/hydration both render `null`
    // (loading) first, so there is no mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBudgets(listAllBudgets());
  }, []);

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

      {budgets === null ? null : budgets.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Nenhum orçamento ainda"
          description="Crie seu primeiro orçamento para começar a enviar propostas."
        />
      ) : (
        <div className="space-y-3">
          {budgets.map((budget) => (
            <BudgetCard key={budget.id} budget={budget} />
          ))}
        </div>
      )}
    </div>
  );
}
