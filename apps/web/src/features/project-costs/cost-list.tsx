"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Receipt } from "lucide-react";

import { BackHeader } from "@/components/shared/back-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { formatCurrency } from "@/lib/currency";
import { formatDate } from "@/lib/date";
import { calculateBudgetTotals } from "@/features/budgets/prototype/budget-totals";
import { getBudget } from "@/features/budgets/prototype/budget-store";
import { useProject } from "@/features/projects/prototype/use-project";
import { sumCosts, sumCostsByCategory } from "./prototype/cost-totals";
import { useProjectCosts } from "./prototype/use-project-costs";
import { PROJECT_COST_CATEGORY_LABEL, type ProjectCost } from "./types";

function CostRow({ cost }: { cost: ProjectCost }) {
  const href =
    cost.originType === "payable" && cost.originId
      ? `/financeiro/contas-a-pagar/${cost.originId}`
      : `/obras/${cost.projectId}/custos/${cost.id}`;

  return (
    <Link
      href={href}
      className="flex items-center gap-3 p-3.5 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            {formatDate(cost.date)}
          </span>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            {PROJECT_COST_CATEGORY_LABEL[cost.category]}
          </span>
        </div>
        <p className="truncate text-sm font-medium text-foreground">{cost.description}</p>
        {cost.supplier ? (
          <p className="truncate text-xs text-muted-foreground">{cost.supplier}</p>
        ) : null}
        {cost.originType === "payable" ? (
          <p className="text-[11px] text-muted-foreground/70">Conta a pagar</p>
        ) : null}
      </div>
      <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
        {formatCurrency(cost.amount)}
      </span>
    </Link>
  );
}

export function CostList({ projectId }: { projectId: string }) {
  const router = useRouter();
  const { project } = useProject(projectId);
  const { costs } = useProjectCosts(projectId);

  if (project === undefined) return null;

  if (project === null) {
    return (
      <EmptyState
        icon={Receipt}
        title="Obra não encontrada"
        description="Ela pode ter sido removida ou o link está incorreto."
      />
    );
  }

  const budget = project?.budgetId ? getBudget(project.budgetId) : null;
  const budgetTotal = budget ? calculateBudgetTotals(budget).total : null;
  const totalCost = costs ? sumCosts(costs) : 0;
  const categoryTotals = costs ? sumCostsByCategory(costs) : [];
  const percentageOfBudget =
    budgetTotal !== null && budgetTotal > 0 ? Math.round((totalCost / budgetTotal) * 100) : null;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <BackHeader
            title="Custos da obra"
            onBack={() => router.push(`/obras/${projectId}`)}
          />
          <p className="pl-11 text-sm text-muted-foreground">
            {project ? project.name : ""}
          </p>
        </div>
        <Button
          size="sm"
          className="mt-1"
          nativeButton={false}
          render={
            <Link href={`/obras/${projectId}/custos/novo`}>
              <Plus className="size-4" aria-hidden="true" />
              Registrar
            </Link>
          }
        />
      </div>

      <div className="space-y-1 rounded-xl border border-border bg-card p-4">
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Custos registrados
        </p>
        <p className="text-2xl font-semibold tabular-nums text-foreground">
          {formatCurrency(totalCost)}
        </p>
        {budgetTotal !== null ? (
          <p className="text-sm text-muted-foreground">
            de {formatCurrency(budgetTotal)} orçados
            {percentageOfBudget !== null
              ? ` · ${percentageOfBudget}% do orçamento já registrado como custo`
              : ""}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">Sem orçamento vinculado</p>
        )}
      </div>

      {categoryTotals.length > 0 ? (
        <div className="space-y-2 rounded-xl border border-border bg-card p-4">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Por categoria
          </p>
          <div className="space-y-1.5">
            {categoryTotals.map(({ category, total }) => (
              <div key={category} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {PROJECT_COST_CATEGORY_LABEL[category]}
                </span>
                <span className="font-medium tabular-nums text-foreground">
                  {formatCurrency(total)}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {costs === undefined ? null : costs.length === 0 ? (
        <div className="space-y-3">
          <EmptyState
            icon={Receipt}
            title="Nenhum custo registrado"
            description="Registre materiais, serviços e outras despesas da obra."
          />
          <Button
            size="lg"
            className="w-full"
            nativeButton={false}
            render={
              <Link href={`/obras/${projectId}/custos/novo`}>Registrar primeiro custo</Link>
            }
          />
        </div>
      ) : (
        <div className="divide-y divide-border rounded-xl border border-border bg-card">
          {costs.map((cost) => (
            <CostRow key={cost.id} cost={cost} />
          ))}
        </div>
      )}
    </div>
  );
}
