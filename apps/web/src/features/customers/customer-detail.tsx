"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BrickWall, ChevronRight, FileText, Plus, Users } from "lucide-react";

import { BackHeader } from "@/components/shared/back-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { formatCurrency } from "@/lib/currency";
import { formatPhoneInput } from "@/lib/phone";
import { calculateBudgetTotals } from "@/features/budgets/prototype/budget-totals";
import { listAllBudgets } from "@/features/budgets/prototype/budget-store";
import { StatusBadge } from "@/features/budgets/components/status-badge";
import type { Budget } from "@/features/budgets/types";
import { listProjectsByCustomer } from "@/features/projects/prototype/project-store";
import { ProjectStatusBadge } from "@/features/projects/components/status-badge";
import type { Project } from "@/features/projects/types";
import { useCustomer } from "./prototype/use-customer";

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground">{value}</span>
    </div>
  );
}

function BudgetRow({ budget }: { budget: Budget }) {
  const { total } = calculateBudgetTotals(budget);
  return (
    <Link
      href={`/orcamentos/${budget.id}`}
      className="flex items-center gap-3 p-3.5 transition-colors hover:bg-muted/50"
    >
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium text-foreground">{budget.name}</p>
          <StatusBadge status={budget.status} />
        </div>
        <p className="text-sm font-semibold text-foreground">{formatCurrency(total)}</p>
      </div>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </Link>
  );
}

function ProjectRow({ project }: { project: Project }) {
  return (
    <Link
      href={`/obras/${project.id}`}
      className="flex items-center gap-3 p-3.5 transition-colors hover:bg-muted/50"
    >
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium text-foreground">{project.name}</p>
          <ProjectStatusBadge status={project.status} />
        </div>
        {project.reference ? (
          <p className="text-xs text-muted-foreground">{project.reference}</p>
        ) : null}
      </div>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </Link>
  );
}

export function CustomerDetail({ id }: { id: string }) {
  const router = useRouter();
  const { customer } = useCustomer(id);
  const [budgets, setBudgets] = useState<Budget[] | null>(null);
  const [projects, setProjects] = useState<Project[] | null>(null);

  useEffect(() => {
    // Safe post-mount reads — see useCustomer for the hydration reasoning.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBudgets(listAllBudgets().filter((budget) => budget.customerId === id));
    setProjects(listProjectsByCustomer(id));
  }, [id]);

  if (customer === undefined) return null;

  if (customer === null) {
    return (
      <EmptyState
        icon={Users}
        title="Cliente não encontrado"
        description="Ele pode ter sido removido ou o link está incorreto."
      />
    );
  }

  return (
    <div className="space-y-6">
      <BackHeader title={customer.name} onBack={() => router.push("/clientes")} />

      <div className="rounded-xl border border-border bg-card p-4">
        <InfoRow label="Telefone" value={formatPhoneInput(customer.phone)} />
        {customer.email ? <InfoRow label="E-mail" value={customer.email} /> : null}
        {customer.document ? <InfoRow label="Documento" value={customer.document} /> : null}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Button
          variant="outline"
          size="lg"
          nativeButton={false}
          render={
            <Link href={`/orcamentos/novo?customerId=${customer.id}`}>
              <Plus className="size-4" aria-hidden="true" />
              Novo orçamento
            </Link>
          }
        />
        <Button
          variant="outline"
          size="lg"
          nativeButton={false}
          render={
            <Link href={`/obras/nova?customerId=${customer.id}`}>
              <Plus className="size-4" aria-hidden="true" />
              Nova obra
            </Link>
          }
        />
      </div>

      <section aria-labelledby="customer-budgets" className="space-y-2.5">
        <h2
          id="customer-budgets"
          className="text-xs font-semibold tracking-wide text-muted-foreground uppercase"
        >
          Orçamentos
        </h2>
        {budgets === null ? null : budgets.length === 0 ? (
          <EmptyState
            compact
            icon={FileText}
            title="Nenhum orçamento ainda"
            description="Os orçamentos criados para este cliente aparecerão aqui."
          />
        ) : (
          <div className="divide-y divide-border rounded-xl border border-border bg-card">
            {budgets.map((budget) => (
              <BudgetRow key={budget.id} budget={budget} />
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="customer-projects" className="space-y-2.5">
        <h2
          id="customer-projects"
          className="text-xs font-semibold tracking-wide text-muted-foreground uppercase"
        >
          Obras
        </h2>
        {projects === null ? null : projects.length === 0 ? (
          <EmptyState
            compact
            icon={BrickWall}
            title="Nenhuma obra ainda"
            description="As obras deste cliente aparecerão aqui."
          />
        ) : (
          <div className="divide-y divide-border rounded-xl border border-border bg-card">
            {projects.map((project) => (
              <ProjectRow key={project.id} project={project} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
