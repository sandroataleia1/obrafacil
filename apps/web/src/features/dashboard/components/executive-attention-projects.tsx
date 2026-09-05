import Link from "next/link";
import { AlertTriangle, ChevronRight } from "lucide-react";

import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { formatCurrency } from "@/lib/currency";
import type { ProjectAttentionEntry } from "@/features/dashboard/prototype/project-priority";

const REASON_LABEL: Record<ProjectAttentionEntry["reason"], string> = {
  "over-budget": "Orçamento ultrapassado",
  "overdue-payables": "Contas a pagar vencidas",
  "overdue-receivables": "Recebíveis vencidos",
  "pending-materials": "Materiais pendentes",
};

const MAX_VISIBLE = 5;

/**
 * `financialConsumptionPercent` only ever appears as informational
 * context here — it never determines whether a project is in this
 * list (see `project-priority.ts`), and the label is always "do
 * orçamento consumido", never "progresso"/"execução" (Demo-Ready
 * 010B §10/§13).
 */
function AttentionProjectCard({ entry }: { entry: ProjectAttentionEntry }) {
  const { facts } = entry;
  const signals: string[] = [];

  if (facts.budget.financialConsumptionPercent !== null) {
    signals.push(`${Math.round(facts.budget.financialConsumptionPercent * 100)}% do orçamento consumido`);
  }
  if (facts.payables.overdue > 0) {
    signals.push(`${formatCurrency(facts.payables.overdue)} em contas vencidas`);
  }
  if (facts.receivables.overdue > 0) {
    signals.push(`${formatCurrency(facts.receivables.overdue)} a receber vencido`);
  }
  if (facts.materials.pendingToBuyCount > 0) {
    const count = facts.materials.pendingToBuyCount;
    signals.push(`${count} material${count === 1 ? "" : "is"} pendente${count === 1 ? "" : "s"} de compra`);
  }
  if (facts.materials.pendingToReceiveCount > 0) {
    const count = facts.materials.pendingToReceiveCount;
    signals.push(`${count} pendente${count === 1 ? "" : "s"} de recebimento`);
  }

  return (
    <Link
      href={`/obras/${entry.projectId}`}
      className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Card size="sm" className="flex-row items-start gap-3 p-3.5 transition-colors hover:border-primary/30">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="text-sm leading-snug font-medium text-foreground">{entry.projectName}</p>
          <p className="text-xs leading-snug text-muted-foreground">{REASON_LABEL[entry.reason]}</p>
          <ul className="space-y-0.5 pt-1">
            {signals.slice(0, 3).map((signal) => (
              <li key={signal} className="text-xs text-muted-foreground">
                {signal}
              </li>
            ))}
          </ul>
        </div>
        <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </Card>
    </Link>
  );
}

export function ExecutiveAttentionProjects({ entries }: { entries: ProjectAttentionEntry[] }) {
  if (entries.length === 0) {
    return (
      <EmptyState
        compact
        icon={AlertTriangle}
        title="Nenhuma obra precisa de atenção agora."
        description="Orçamento estourado, contas vencidas e materiais pendentes vão aparecer aqui."
      />
    );
  }

  const visible = entries.slice(0, MAX_VISIBLE);
  const hiddenCount = entries.length - visible.length;

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
        {visible.map((entry) => (
          <AttentionProjectCard key={entry.projectId} entry={entry} />
        ))}
      </div>
      {hiddenCount > 0 ? (
        <p className="px-1 text-xs text-muted-foreground">
          Mais {hiddenCount} obra{hiddenCount === 1 ? "" : "s"} precisando de atenção
        </p>
      ) : null}
    </div>
  );
}
