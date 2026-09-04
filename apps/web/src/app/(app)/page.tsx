"use client";

import {
  AlertTriangle,
  BrickWall,
  Calculator,
  CalendarClock,
  FileText,
  Plus,
  TrendingUp,
  Wallet,
} from "lucide-react";

import { ActionCard } from "@/components/shared/action-card";
import { formatCurrency } from "@/lib/currency";
import { currentUser } from "@/mocks/current-user";
import { useDashboardSummary } from "@/features/dashboard/prototype/use-dashboard-summary";
import {
  formatMaxDaysLateText,
  formatPendingApprovalSecondaryText,
  formatRealizedCostSecondaryText,
} from "@/features/dashboard/prototype/dashboard-format";
import { AttentionList } from "@/features/dashboard/components/attention-list";
import { CashMovementChart } from "@/features/dashboard/components/cash-movement-chart";
import { FinancialComparisonChart } from "@/features/dashboard/components/financial-comparison-chart";
import { KpiCard } from "@/features/dashboard/components/kpi-card";
import { ProjectHealthList } from "@/features/dashboard/components/project-health-list";

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

export default function HomePage() {
  const summary = useDashboardSummary();

  if (summary === undefined) return null;

  const isCompletelyEmpty =
    summary.projectsInProgress === 0 &&
    summary.budgetedInProjects === 0 &&
    summary.totalRealizedCost === 0 &&
    summary.overduePayablesTotal === 0 &&
    summary.projectsLate === 0 &&
    summary.pendingApprovalBudgetsCount === 0 &&
    summary.attentionItems.length === 0;

  return (
    <div className="space-y-10">
      <div className="space-y-1.5">
        <h1 className="text-[1.75rem] font-semibold tracking-tight text-foreground sm:text-3xl">
          Olá, {currentUser.firstName}
        </h1>
        <p className="text-sm text-muted-foreground">
          O que você deseja fazer?
        </p>
      </div>

      <section aria-labelledby="metricas-executivas" className="space-y-2.5">
        <SectionLabel id="metricas-executivas">Métricas</SectionLabel>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <KpiCard
            icon={BrickWall}
            label="Obras em andamento"
            value={String(summary.projectsInProgress)}
          />
          <KpiCard
            icon={CalendarClock}
            label="Obras atrasadas"
            value={String(summary.projectsLate)}
            secondaryText={formatMaxDaysLateText(summary.maxProjectDaysLate)}
            tone={summary.projectsLate > 0 ? "warning" : "neutral"}
          />
          <KpiCard
            icon={FileText}
            label="Aguardando aprovação"
            value={String(summary.pendingApprovalBudgetsCount)}
            secondaryText={formatPendingApprovalSecondaryText(summary.pendingApprovalBudgetsAmount)}
          />
          <KpiCard
            icon={Wallet}
            label="Orçado em obras"
            value={formatCurrency(summary.budgetedInProjects)}
          />
          <KpiCard
            icon={TrendingUp}
            label="Custo realizado"
            value={formatCurrency(summary.totalRealizedCost)}
            secondaryText={formatRealizedCostSecondaryText(
              summary.currentMonthRealizedCost,
              summary.previousMonthRealizedCost,
              summary.realizedCostMonthVariationPercent
            )}
          />
          <KpiCard
            icon={AlertTriangle}
            label="A pagar vencido"
            value={formatCurrency(summary.overduePayablesTotal)}
            tone={summary.overduePayablesTotal > 0 ? "critical" : "neutral"}
          />
        </div>
      </section>

      <section aria-labelledby="desempenho-financeiro" className="space-y-2.5">
        <SectionLabel id="desempenho-financeiro">Desempenho financeiro</SectionLabel>
        <div className="flex flex-col gap-6 lg:grid lg:grid-cols-2">
          <div className="order-2 space-y-1.5 lg:order-1">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Desempenho financeiro por obra</h3>
              <p className="text-xs text-muted-foreground">Orçado, realizado e comprometido</p>
            </div>
            <FinancialComparisonChart data={summary.financialComparison} />
          </div>
          <div className="order-1 space-y-1.5 lg:order-2">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Movimentação financeira</h3>
              <p className="text-xs text-muted-foreground">Recebido × pago nos últimos 6 meses</p>
            </div>
            <CashMovementChart data={summary.monthlyCashMovement} />
          </div>
        </div>
      </section>

      <div className="space-y-10 lg:grid lg:grid-cols-3 lg:items-start lg:gap-8 lg:space-y-0">
        <div className="space-y-10 lg:col-span-2">
          <section aria-labelledby="saude-obras" className="space-y-2.5">
            <SectionLabel id="saude-obras">Saúde das obras</SectionLabel>
            <ProjectHealthList highlights={summary.projectHealthHighlights} />
          </section>

          <section aria-labelledby="precisa-atencao" className="space-y-2.5 lg:hidden">
            <SectionLabel id="precisa-atencao">Precisa de atenção</SectionLabel>
            <AttentionList items={summary.attentionItems} />
          </section>

          <div>
            <ActionCard
              href="/calcular"
              variant="primary"
              icon={Calculator}
              title="Calcular materiais"
              description="Calcule parede, piso, concreto, pintura e muito mais em poucos toques."
              cta="Calcular agora"
            />

            <div className="mt-3 grid grid-cols-2 gap-3">
              <ActionCard href="/orcamentos/novo" icon={Plus} title="Novo orçamento" />
              {isCompletelyEmpty ? (
                <ActionCard href="/obras/nova" icon={BrickWall} title="Nova obra" />
              ) : (
                <ActionCard href="/obras" icon={BrickWall} title="Minhas obras" />
              )}
            </div>
          </div>
        </div>

        <div className="hidden space-y-8 lg:block">
          <section aria-labelledby="precisa-atencao-desktop" className="space-y-2.5">
            <SectionLabel id="precisa-atencao-desktop">Precisa de atenção</SectionLabel>
            <AttentionList items={summary.attentionItems} />
          </section>
        </div>
      </div>
    </div>
  );
}
