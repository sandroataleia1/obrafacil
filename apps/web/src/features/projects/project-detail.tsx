"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, FileText, Receipt } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { formatCurrency } from "@/lib/currency";
import { formatDate } from "@/lib/date";
import { calculateBudgetTotals } from "@/features/budgets/prototype/budget-totals";
import { getBudget } from "@/features/budgets/prototype/budget-store";
import { sumCosts } from "@/features/project-costs/prototype/cost-totals";
import { useProjectCosts } from "@/features/project-costs/prototype/use-project-costs";
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
  const budgetTotal = budget ? calculateBudgetTotals(budget).total : null;
  const registeredCost = costs ? sumCosts(costs) : 0;
  const budgetBalance = budgetTotal !== null ? budgetTotal - registeredCost : null;

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

      <div className="rounded-xl border border-border bg-card p-4">
        <InfoRow label="Atualizado em" value={formatDate(project.updatedAt)} />
        {budgetTotal !== null ? (
          <>
            <div className="mt-2 border-t border-border pt-2">
              <InfoRow label="Valor do orçamento" value={formatCurrency(budgetTotal)} emphasis />
            </div>
            <InfoRow label="Custos registrados" value={formatCurrency(registeredCost)} />
            <InfoRow
              label="Diferença para o orçamento"
              value={formatCurrency(budgetBalance ?? 0)}
              negative={(budgetBalance ?? 0) < 0}
            />
          </>
        ) : (
          <div className="mt-2 border-t border-border pt-2">
            <InfoRow label="Custos registrados" value={formatCurrency(registeredCost)} emphasis />
          </div>
        )}
      </div>

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
    </div>
  );
}
