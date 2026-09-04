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

const ATTENTION_MAX_VISIBLE = 5;

function AttentionRow({ item }: { item: DashboardAttentionItem }) {
  const Icon = ATTENTION_ICON[item.type];
  return (
    <Link
      href={item.href}
      className="flex items-center gap-3 p-3.5 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{item.title}</p>
        {item.description ? (
          <p className="truncate text-xs text-muted-foreground">{item.description}</p>
        ) : null}
      </div>
      <div className="shrink-0 text-right">
        {item.amount !== undefined ? (
          <p className="text-sm font-semibold tabular-nums text-foreground">
            {formatCurrency(item.amount)}
          </p>
        ) : null}
        {item.dueDate ? (
          <p className="text-xs text-muted-foreground">{formatDate(item.dueDate)}</p>
        ) : null}
      </div>
    </Link>
  );
}

/** `items` arrives already deduplicated, prioritized and ordered by
 * `dashboard-summary.ts` — this component only slices for display and
 * never reorders/recalculates. */
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
      <Card size="sm" className="divide-y divide-border py-0">
        {visible.map((item) => (
          <AttentionRow key={item.id} item={item} />
        ))}
      </Card>
      {hiddenCount > 0 ? (
        <p className="px-1 text-xs text-muted-foreground">
          +{hiddenCount} outra{hiddenCount === 1 ? "" : "s"} pendência{hiddenCount === 1 ? "" : "s"}
        </p>
      ) : null}
    </div>
  );
}
