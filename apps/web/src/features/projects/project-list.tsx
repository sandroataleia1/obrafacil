"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BrickWall, ChevronRight, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { formatCurrency } from "@/lib/currency";
import { formatDate } from "@/lib/date";
import { calculateBudgetTotals } from "@/features/budgets/prototype/budget-totals";
import { getBudget } from "@/features/budgets/prototype/budget-store";
import { listAllProjects } from "./prototype/project-store";
import { ProjectStatusBadge } from "./components/status-badge";
import type { Project } from "./types";

function ProjectCard({ project }: { project: Project }) {
  const budget = project.budgetId ? getBudget(project.budgetId) : null;
  const budgetTotal = budget ? calculateBudgetTotals(budget).total : null;

  return (
    <Link
      href={`/obras/${project.id}`}
      className="group flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:translate-y-px"
    >
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-semibold text-foreground">{project.name}</p>
          <ProjectStatusBadge status={project.status} />
        </div>
        <p className="text-xs text-muted-foreground">{project.customerName}</p>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium tabular-nums text-foreground">
            {budgetTotal !== null ? formatCurrency(budgetTotal) : "Sem orçamento vinculado"}
          </span>
          <span className="text-xs text-muted-foreground">{formatDate(project.updatedAt)}</span>
        </div>
      </div>
      <ChevronRight
        className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
        aria-hidden="true"
      />
    </Link>
  );
}

export function ProjectList() {
  const [projects, setProjects] = useState<Project[] | null>(null);

  useEffect(() => {
    // localStorage read after mount: server/hydration both render `null`
    // (loading) first, so there is no mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setProjects(listAllProjects());
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Obras</h1>
          <p className="text-sm text-muted-foreground">
            Acompanhe a execução de cada obra.
          </p>
        </div>
        <Button
          size="sm"
          nativeButton={false}
          render={
            <Link href="/obras/nova">
              <Plus className="size-4" aria-hidden="true" />
              Nova
            </Link>
          }
        />
      </div>

      {projects === null ? null : projects.length === 0 ? (
        <EmptyState
          icon={BrickWall}
          title="Nenhuma obra ainda"
          description="Crie uma obra manualmente ou a partir de um orçamento aprovado."
        />
      ) : (
        <div className="space-y-3">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      )}
    </div>
  );
}
