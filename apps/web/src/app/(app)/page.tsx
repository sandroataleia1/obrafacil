"use client";

import Link from "next/link";
import { Calculator, CalendarClock, FileText, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { currentUser } from "@/mocks/current-user";
import { useDashboardSummary } from "@/features/dashboard/prototype/use-dashboard-summary";
import {
  formatMaxDaysLateText,
  formatPendingApprovalSecondaryText,
} from "@/features/dashboard/prototype/dashboard-format";
import { AttentionList } from "@/features/dashboard/components/attention-list";
import { CashMovementChart } from "@/features/dashboard/components/cash-movement-chart";
import { ExecutivePanel } from "@/features/dashboard/components/executive-panel";
import { KpiCard } from "@/features/dashboard/components/kpi-card";

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
  const summary = useDashboardSummary();

  if (summary === undefined) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1">
          <h1 className="text-[1.75rem] font-semibold tracking-tight text-foreground sm:text-3xl">
            Olá, {currentUser.firstName}
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
