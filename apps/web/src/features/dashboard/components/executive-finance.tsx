import Link from "next/link";
import { Receipt } from "lucide-react";

import { Card } from "@/components/ui/card";
import { formatCurrency } from "@/lib/currency";
import type { CompanyFinanceFacts } from "@/features/analytics/types";

/**
 * `pendingPayables`/`overduePayables` are mutually exclusive
 * (Demo-Ready 010A) — "A pagar em aberto" is their sum; "Vencidas" is
 * `overduePayables` alone, never combined with overdue Receivables
 * (Demo-Ready 010B §4). Custos realizados nas obras is labelled to
 * make its scope explicit — administrative Payables without a
 * `projectId` are not included, so this is never "despesas totais da
 * empresa" (Demo-Ready 010B §6).
 */
export function ExecutiveFinance({
  finance,
  realizedProjectCosts,
}: {
  finance: CompanyFinanceFacts;
  realizedProjectCosts: number;
}) {
  const openPayables = finance.pendingPayables + finance.overduePayables;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Link href="/financeiro/contas-a-receber" className="block rounded-xl">
          <Card size="sm" className="gap-1 p-3 transition-colors hover:border-primary/30">
            <span className="text-xs font-medium text-muted-foreground">Recebido</span>
            <p className="text-lg leading-tight font-semibold tabular-nums text-foreground">
              {formatCurrency(finance.receivedRevenue)}
            </p>
          </Card>
        </Link>
        <Link href="/financeiro/contas-a-receber" className="block rounded-xl">
          <Card size="sm" className="gap-1 p-3 transition-colors hover:border-primary/30">
            <span className="text-xs font-medium text-muted-foreground">A receber</span>
            <p className="text-lg leading-tight font-semibold tabular-nums text-foreground">
              {formatCurrency(finance.outstandingReceivables)}
            </p>
          </Card>
        </Link>
        <Link href="/financeiro/contas-a-pagar" className="block rounded-xl">
          <Card size="sm" className="gap-1 p-3 transition-colors hover:border-primary/30">
            <span className="text-xs font-medium text-muted-foreground">A pagar em aberto</span>
            <p className="text-lg leading-tight font-semibold tabular-nums text-foreground">
              {formatCurrency(openPayables)}
            </p>
          </Card>
        </Link>
        <Link href="/financeiro/contas-a-pagar" className="block rounded-xl">
          <Card size="sm" className="gap-1 p-3 transition-colors hover:border-primary/30">
            <span className="text-xs font-medium text-muted-foreground">Vencidas</span>
            <p
              className={
                finance.overduePayables > 0
                  ? "text-lg leading-tight font-semibold tabular-nums text-destructive"
                  : "text-lg leading-tight font-semibold tabular-nums text-foreground"
              }
            >
              {formatCurrency(finance.overduePayables)}
            </p>
          </Card>
        </Link>
      </div>

      <Card size="sm" className="flex-row items-center justify-between gap-3 p-3">
        <div className="flex items-center gap-2">
          <Receipt className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="text-sm text-muted-foreground">Custos realizados nas obras</span>
        </div>
        <span className="text-sm font-semibold tabular-nums text-foreground">
          {formatCurrency(realizedProjectCosts)}
        </span>
      </Card>
    </div>
  );
}
