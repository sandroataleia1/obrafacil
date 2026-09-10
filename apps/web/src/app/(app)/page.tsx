"use client";

import Link from "next/link";
import { Calculator, CalendarClock, FileText, House, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-provider";
import { useDashboardSummary } from "@/features/dashboard/prototype/use-dashboard-summary";
import {
  formatMaxDaysLateText,
  formatPendingApprovalSecondaryText,
} from "@/features/dashboard/prototype/dashboard-format";
import { AttentionList } from "@/features/dashboard/components/attention-list";
import { CashMovementChart } from "@/features/dashboard/components/cash-movement-chart";
import { ExecutivePanel } from "@/features/dashboard/components/executive-panel";
import { KpiCard } from "@/features/dashboard/components/kpi-card";
import { SupplySummary } from "@/features/dashboard/components/supply-summary";
import { useDashboardSupplySummary } from "@/features/stock/prototype/use-dashboard-supply-summary";

function SectionLabel({ children, id }: { children: string; id: string }) {
  return (
    <h2
      id={id}
      className="text-xs font-semibold tracking-wide text-muted-foreground uppercase"
    >
      {children}
    </h2>
  );
}

function HeaderActions() {
  return (
    <>
      {/* Desktop: compact buttons beside the greeting */}
      <div className="hidden shrink-0 items-center gap-2 lg:flex">
        <Button size="sm" variant="ghost" nativeButton={false} render={<Link href="/calcular"><Calculator className="size-3.5" aria-hidden="true" />Calcular materiais</Link>} />
        <Button size="sm" variant="outline" nativeButton={false} render={<Link href="/orcamentos/novo"><FileText className="size-3.5" aria-hidden="true" />Novo orçamento</Link>} />
        <Button size="sm" nativeButton={false} render={<Link href="/obras/nova"><Plus className="size-3.5" aria-hidden="true" />Nova obra</Link>} />
      </div>

      {/* Mobile/tablet: compact, two rows, no big banner */}
      <div className="grid grid-cols-2 gap-2 lg:hidden">
        <Button size="sm" nativeButton={false} className="w-full" render={<Link href="/obras/nova"><Plus className="size-3.5" aria-hidden="true" />Nova obra</Link>} />
        <Button size="sm" variant="outline" className="w-full" nativeButton={false} render={<Link href="/orcamentos/novo"><FileText className="size-3.5" aria-hidden="true" />Novo orçamento</Link>} />
        <Button size="sm" variant="ghost" className="col-span-2 w-full" nativeButton={false} render={<Link href="/calcular"><Calculator className="size-3.5" aria-hidden="true" />Calcular materiais</Link>} />
      </div>
    </>
  );
}

export default function HomePage() {
  const auth = useAuth();
  const summary = useDashboardSummary();
  const supplySummary = useDashboardSupplySummary();

  if (summary === undefined || supplySummary === undefined || auth.user === null) return null;

  const firstName = auth.user.name.trim().split(/\s+/)[0] ?? auth.user.name;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1">
          <h1 className="flex items-center gap-2 text-[1.75rem] font-semibold tracking-tight text-foreground sm:text-3xl">
            <House className="size-6 shrink-0 text-muted-foreground" aria-hidden="true" />
            Olá, {firstName}
          </h1>
          <p className="text-sm text-muted-foreground">
            Acompanhe a situação das suas obras e finanças.
          </p>
        </div>
        <HeaderActions />
      </div>

      <ExecutivePanel />

      <section aria-labelledby="metricas-executivas" className="space-y-2.5">
        <SectionLabel id="metricas-executivas">Métricas</SectionLabel>
        <div className="grid grid-cols-2 gap-2.5">
          <KpiCard
            icon={CalendarClock}
            label="Obras atrasadas"
            value={String(summary.projectsLate)}
            secondaryText={formatMaxDaysLateText(summary.maxProjectDaysLate)}
            tone={summary.projectsLate > 0 ? "warning" : "neutral"}
          />
          <KpiCard
            icon={FileText}
            label="Orçamentos aguardando aprovação"
            value={String(summary.pendingApprovalBudgetsCount)}
            secondaryText={formatPendingApprovalSecondaryText(summary.pendingApprovalBudgetsAmount)}
          />
        </div>
      </section>

      <section aria-labelledby="suprimentos" className="space-y-2.5">
        <SectionLabel id="suprimentos">Suprimentos</SectionLabel>
        <SupplySummary
          missingToPurchaseCount={supplySummary.missingToPurchaseCount}
          pendingReceiptCount={supplySummary.pendingReceiptCount}
        />
      </section>

      <section aria-labelledby="atencao-agora" className="space-y-2.5">
        <SectionLabel id="atencao-agora">Atenção agora</SectionLabel>
        <AttentionList items={summary.attentionItems} />
      </section>

      <section aria-labelledby="movimentacao-financeira" className="space-y-2.5">
        <SectionLabel id="movimentacao-financeira">Movimentação financeira</SectionLabel>
        <div className="mx-auto w-full lg:max-w-2xl">
          <CashMovementChart
            data={summary.monthlyCashMovement}
            receivedTotal={summary.receivedLast6Months}
            paidTotal={summary.paidLast6Months}
          />
        </div>
      </section>
    </div>
  );
}
