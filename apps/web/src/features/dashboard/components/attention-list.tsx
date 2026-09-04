import Link from "next/link";
import { AlertTriangle, CalendarClock, Clock, FileText, TrendingUp, type LucideIcon } from "lucide-react";

import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { formatCurrency } from "@/lib/currency";
import { formatDate } from "@/lib/date";
import type { DashboardAttentionItem, DashboardAttentionType } from "@/features/dashboard/prototype/dashboard-summary";

const ATTENTION_ICON: Record<DashboardAttentionType, LucideIcon> = {
  "payable-overdue": AlertTriangle,
  "receivable-overdue": AlertTriangle,
  "project-over-budget": TrendingUp,
  "project-late": CalendarClock,
  "project-start-late": CalendarClock,
  "budget-pending": FileText,
  "budget-unlinked": FileText,
  "payable-upcoming": Clock,
  "receivable-upcoming": Clock,
};

const ATTENTION_MAX_VISIBLE = 4;

function AttentionCard({ item }: { item: DashboardAttentionItem }) {
  const Icon = ATTENTION_ICON[item.type];
  return (
    <Link href={item.href} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xl">
      <Card size="sm" className="flex-row items-start gap-3 p-3.5 transition-colors hover:border-primary/30 hover:ring-primary/30">
        <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="text-sm leading-snug font-medium text-foreground">{item.title}</p>
          {item.description ? (
            <p className="text-xs leading-snug text-muted-foreground">{item.description}</p>
          ) : null}
          <div className="flex items-center gap-3 pt-0.5">
            {item.amount !== undefined ? (
              <span className="text-sm font-semibold tabular-nums text-foreground">
                {formatCurrency(item.amount)}
              </span>
            ) : null}
            {item.dueDate ? (
              <span className="text-xs text-muted-foreground">{formatDate(item.dueDate)}</span>
            ) : null}
          </div>
        </div>
      </Card>
    </Link>
  );
}

/** `items` arrives already deduplicated, prioritized and ordered by
 * `dashboard-summary.ts` — this component only slices for display and
 * never reorders/recalculates. Titles get up to 2 lines instead of a
 * single truncated one — a name like "Muro e Portão Ribeiro" must stay
 * readable. */
export function AttentionList({ items }: { items: DashboardAttentionItem[] }) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title="Nada pedindo atenção agora"
        description="Contas vencidas, orçamentos parados e obras fora do orçamento vão aparecer aqui."
      />
    );
  }

  const visible = items.slice(0, ATTENTION_MAX_VISIBLE);
  const hiddenCount = items.length - visible.length;

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
        {visible.map((item) => (
          <AttentionCard key={item.id} item={item} />
        ))}
      </div>
      {hiddenCount > 0 ? (
        <p className="px-1 text-xs text-muted-foreground">
          Mais {hiddenCount} pendência{hiddenCount === 1 ? "" : "s"}
        </p>
      ) : null}
    </div>
  );
}
