import Link from "next/link";
import { AlertTriangle, CalendarClock, FileText, type LucideIcon } from "lucide-react";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/currency";
import {
  formatMaxDaysLateText,
  formatOverduePayablesCountText,
  formatOverdueReceivablesCountText,
  formatPendingApprovalSecondaryText,
} from "@/features/dashboard/prototype/dashboard-format";
import type { KpiTone } from "./kpi-card";

const TONE_ICON_CLASSES: Record<KpiTone, string> = {
  neutral: "text-muted-foreground",
  warning: "text-amber-600 dark:text-amber-400",
  critical: "text-destructive",
};

interface SummaryCardProps {
  icon: LucideIcon;
  title: string;
  value: string;
  context: string;
  tone: KpiTone;
  href: string;
}

function SummaryCard({ icon: Icon, title, value, context, tone, href }: SummaryCardProps) {
  return (
    <Link href={href} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xl">
      <Card size="sm" className="gap-1 p-3 transition-colors hover:border-primary/30 hover:ring-primary/30">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Icon className={cn("size-3.5 shrink-0", TONE_ICON_CLASSES[tone])} aria-hidden="true" />
          <span className="text-xs leading-snug font-medium">{title}</span>
        </div>
        <p className="text-base leading-tight font-semibold tabular-nums text-foreground">{value}</p>
        <p className="truncate text-xs text-muted-foreground">{context}</p>
      </Card>
    </Link>
  );
}

/** Four compact category summaries — deliberately smaller/quieter than
 * the 6 main KPIs (they answer "which module needs a look", the KPIs
 * already answered "how many"). Every number here is read straight
 * from `DashboardSummary`, never recomputed. */
export function AttentionSummary({
  projectsLate,
  maxProjectDaysLate,
  overduePayablesCount,
  overduePayablesTotal,
  pendingApprovalBudgetsCount,
  pendingApprovalBudgetsAmount,
  overdueReceivablesCount,
  overdueReceivablesTotal,
}: {
  projectsLate: number;
  maxProjectDaysLate: number | null;
  overduePayablesCount: number;
  overduePayablesTotal: number;
  pendingApprovalBudgetsCount: number;
  pendingApprovalBudgetsAmount: number;
  overdueReceivablesCount: number;
  overdueReceivablesTotal: number;
}) {
  return (
    <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
      <SummaryCard
        icon={CalendarClock}
        title="Obras atrasadas"
        value={String(projectsLate)}
        context={formatMaxDaysLateText(maxProjectDaysLate)}
        tone={projectsLate > 0 ? "warning" : "neutral"}
        href="/obras"
      />
      <SummaryCard
        icon={AlertTriangle}
        title="Contas a pagar vencidas"
        value={formatOverduePayablesCountText(overduePayablesCount)}
        context={`${formatCurrency(overduePayablesTotal)} a pagar`}
        tone={overduePayablesCount > 0 ? "critical" : "neutral"}
        href="/financeiro/contas-a-pagar"
      />
      <SummaryCard
        icon={FileText}
        title="Orçamentos aguardando aprovação"
        value={String(pendingApprovalBudgetsCount)}
        context={formatPendingApprovalSecondaryText(pendingApprovalBudgetsAmount)}
        tone="neutral"
        href="/orcamentos"
      />
      <SummaryCard
        icon={AlertTriangle}
        title="Contas a receber vencidas"
        value={formatOverdueReceivablesCountText(overdueReceivablesCount)}
        context={`${formatCurrency(overdueReceivablesTotal)} a receber`}
        tone={overdueReceivablesCount > 0 ? "warning" : "neutral"}
        href="/financeiro/contas-a-receber"
      />
    </div>
  );
}
