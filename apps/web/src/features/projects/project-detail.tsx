"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ChevronLeft, ChevronRight, FileText, Info, Receipt } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { formatCurrency } from "@/lib/currency";
import { formatDate } from "@/lib/date";
import { calculateBudgetTotals } from "@/features/budgets/prototype/budget-totals";
import { getBudget } from "@/features/budgets/prototype/budget-store";
import { sumCosts } from "@/features/project-costs/prototype/cost-totals";
import { useProjectCosts } from "@/features/project-costs/prototype/use-project-costs";
import { PROJECT_COST_CATEGORY_LABEL } from "@/features/project-costs/types";
import { listPayablesByProject } from "@/features/payables/prototype/payable-store";
import type { Payable } from "@/features/payables/types";
import { buildProjectManagementSummary } from "./prototype/project-summary";
import { PROJECT_STATUS_LABEL, type ProjectStatus } from "./types";
import { ProjectStatusBadge } from "./components/status-badge";
import { useProject } from "./prototype/use-project";

const STATUS_OPTIONS: ProjectStatus[] = ["planning", "in_progress", "paused", "completed"];

function InfoRow({
  label,
  value,
  emphasis,
  negative,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
  negative?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className={emphasis ? "text-base font-semibold text-foreground" : "text-sm text-muted-foreground"}>
        {label}
      </span>
      <span
        className={
          negative
            ? emphasis
              ? "text-xl font-semibold tabular-nums text-destructive"
              : "text-sm font-medium tabular-nums text-destructive"
            : emphasis
              ? "text-xl font-semibold tabular-nums text-foreground"
              : "text-sm font-medium tabular-nums text-foreground"
        }
      >
        {value}
      </span>
    </div>
  );
}

export function ProjectDetail({ id }: { id: string }) {
  const router = useRouter();
  const { project, persist } = useProject(id);
  const { costs } = useProjectCosts(id);
  const [payables, setPayables] = useState<Payable[] | undefined>(undefined);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPayables(listPayablesByProject(id));
  }, [id]);

  if (project === undefined) return null;

  if (project === null) {
    return (
      <EmptyState
        icon={FileText}
        title="Obra não encontrada"
        description="Ela pode ter sido removida ou o link está incorreto."
      />
    );
  }

  const budget = project.budgetId ? getBudget(project.budgetId) : null;
  const registeredCost = costs ? sumCosts(costs) : 0;
  const summary =
    costs !== undefined && payables !== undefined
      ? buildProjectManagementSummary({ project, budget, costs, payables })
      : null;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => router.push("/obras")}
            aria-label="Voltar"
            className="flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronLeft className="size-5" aria-hidden="true" />
          </button>
          <h1 className="min-w-0 truncate text-2xl font-semibold tracking-tight text-foreground">
            {project.name}
          </h1>
          <ProjectStatusBadge status={project.status} />
        </div>
        <div className="pl-11">
          <p className="text-sm text-muted-foreground">{project.customerName}</p>
          {project.reference ? (
            <p className="text-sm text-muted-foreground">{project.reference}</p>
          ) : null}
          {project.address ? (
            <p className="text-sm text-muted-foreground">{project.address}</p>
          ) : null}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">Atualizado em {formatDate(project.updatedAt)}</p>

      <section aria-labelledby="project-summary" className="space-y-2.5">
        <h2
          id="project-summary"
          className="text-xs font-semibold tracking-wide text-muted-foreground uppercase"
        >
          Visão geral
        </h2>
        <div className="rounded-xl border border-border bg-card p-4">
          {summary === null ? (
            <InfoRow label="Custo realizado" value={formatCurrency(registeredCost)} emphasis />
          ) : (
            <>
              {summary.referenceAmount !== null ? (
                <InfoRow
                  label="Valor do orçamento"
                  value={formatCurrency(summary.referenceAmount)}
                  emphasis
                />
              ) : null}
              <div className={summary.referenceAmount !== null ? "mt-2 border-t border-border pt-2" : undefined}>
                <InfoRow
                  label="Custo realizado"
                  value={formatCurrency(summary.realizedCost)}
                  emphasis={summary.referenceAmount === null}
                />
              </div>
              {summary.pendingPayables > 0 ? (
                <InfoRow
                  label="Compromissos (contas a pagar)"
                  value={formatCurrency(summary.pendingPayables)}
                />
              ) : null}
              {summary.referenceAmount !== null ? (
                <InfoRow
                  label="Diferença para o orçamento"
                  value={formatCurrency(summary.remainingAgainstBudget ?? 0)}
                  negative={(summary.remainingAgainstBudget ?? 0) < 0}
                />
              ) : null}
              {summary.referenceAmount !== null && summary.pendingPayables > 0 ? (
                <InfoRow
                  label="Diferença após compromissos"
                  value={formatCurrency(summary.committedRemainingAgainstBudget ?? 0)}
                  negative={(summary.committedRemainingAgainstBudget ?? 0) < 0}
                />
              ) : null}
            </>
          )}
        </div>
      </section>

      {summary && summary.alerts.length > 0 ? (
        <div className="space-y-2">
          {summary.alerts.map((alert, index) => {
            const Icon = alert.severity === "info" ? Info : AlertTriangle;
            const className =
              alert.severity === "critical"
                ? "flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
                : alert.severity === "warning"
                  ? "flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-700 dark:text-amber-400"
                  : "flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground";
            return (
              <div key={index} className={className}>
                <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span>{alert.message}</span>
              </div>
            );
          })}
        </div>
      ) : null}

      <div className="space-y-2">
        <span className="text-sm font-medium text-foreground">Status</span>
        <div className="grid grid-cols-2 gap-2">
          {STATUS_OPTIONS.map((status) => {
            const selected = project.status === status;
            return (
              <button
                key={status}
                type="button"
                aria-pressed={selected}
                onClick={() => persist({ ...project, status })}
                className={
                  selected
                    ? "rounded-lg border border-primary bg-primary/5 py-2.5 text-sm font-semibold text-primary"
                    : "rounded-lg border border-border bg-card py-2.5 text-sm font-semibold text-foreground hover:border-primary/30"
                }
              >
                {PROJECT_STATUS_LABEL[status]}
              </button>
            );
          })}
        </div>
      </div>

      <section aria-labelledby="project-budget" className="space-y-2.5">
        <h2
          id="project-budget"
          className="text-xs font-semibold tracking-wide text-muted-foreground uppercase"
        >
          Orçamento
        </h2>
        {budget ? (
          <Link
            href={`/orcamentos/${budget.id}`}
            className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/30"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">{budget.name}</p>
              <p className="text-sm font-semibold text-foreground">
                {formatCurrency(calculateBudgetTotals(budget).total)}
              </p>
            </div>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </Link>
        ) : (
          <EmptyState
            icon={FileText}
            title="Sem orçamento vinculado"
            description="Esta obra foi criada manualmente."
          />
        )}
      </section>

      <section aria-labelledby="project-costs" className="space-y-2.5">
        <h2
          id="project-costs"
          className="text-xs font-semibold tracking-wide text-muted-foreground uppercase"
        >
          Custos da obra
        </h2>
        {costs === undefined ? null : costs.length > 0 ? (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
            <div>
              <p className="text-xs text-muted-foreground">Registrado</p>
              <p className="text-lg font-semibold tabular-nums text-foreground">
                {formatCurrency(registeredCost)}
              </p>
            </div>
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link href={`/obras/${project.id}/custos`}>Ver custos</Link>}
            />
          </div>
        ) : (
          <div className="space-y-3">
            <EmptyState
              compact
              icon={Receipt}
              title="Nenhum custo registrado"
              description="Registre materiais, serviços e outras despesas da obra."
            />
            <Button
              variant="outline"
              className="w-full"
              nativeButton={false}
              render={
                <Link href={`/obras/${project.id}/custos/novo`}>Registrar custo</Link>
              }
            />
          </div>
        )}
      </section>

      {summary && summary.costsByCategory.length > 0 ? (
        <section aria-labelledby="project-costs-by-category" className="space-y-2.5">
          <h2
            id="project-costs-by-category"
            className="text-xs font-semibold tracking-wide text-muted-foreground uppercase"
          >
            Custos por categoria
          </h2>
          <div className="divide-y divide-border rounded-xl border border-border bg-card px-4">
            {summary.costsByCategory.map((entry) => (
              <div key={entry.category} className="flex items-center justify-between py-2.5">
                <span className="text-sm text-muted-foreground">
                  {PROJECT_COST_CATEGORY_LABEL[entry.category]}
                </span>
                <span className="text-sm font-medium tabular-nums text-foreground">
                  {formatCurrency(entry.amount)}
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {summary ? (
        <section aria-labelledby="project-financial" className="space-y-2.5">
          <h2
            id="project-financial"
            className="text-xs font-semibold tracking-wide text-muted-foreground uppercase"
          >
            Financeiro
          </h2>
          <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
            <div className="flex gap-6">
              <div>
                <p className="text-xs text-muted-foreground">Pendentes</p>
                <p className="text-sm font-semibold tabular-nums text-foreground">
                  {formatCurrency(summary.pendingPayables)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Vencidas</p>
                <p
                  className={
                    summary.overduePayables > 0
                      ? "text-sm font-semibold tabular-nums text-destructive"
                      : "text-sm font-semibold tabular-nums text-foreground"
                  }
                >
                  {formatCurrency(summary.overduePayables)}
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link href="/financeiro/contas-a-pagar">Ver contas</Link>}
            />
          </div>
        </section>
      ) : null}
    </div>
  );
}
