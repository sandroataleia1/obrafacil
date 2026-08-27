"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, FileText } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { formatCurrency } from "@/lib/currency";
import { formatDate } from "@/lib/date";
import { calculateBudgetTotals } from "@/features/budgets/prototype/budget-totals";
import { getBudget } from "@/features/budgets/prototype/budget-store";
import { PROJECT_STATUS_LABEL, type ProjectStatus } from "./types";
import { ProjectStatusBadge } from "./components/status-badge";
import { useProject } from "./prototype/use-project";

const STATUS_OPTIONS: ProjectStatus[] = ["planning", "in_progress", "paused", "completed"];

function InfoRow({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className={emphasis ? "text-base font-semibold text-foreground" : "text-sm text-muted-foreground"}>
        {label}
      </span>
      <span
        className={
          emphasis
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
        <div className="mt-2 border-t border-border pt-2">
          <InfoRow
            label="Valor orçado"
            value={budgetTotal !== null ? formatCurrency(budgetTotal) : "Sem orçamento vinculado"}
            emphasis
          />
        </div>
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
    </div>
  );
}
