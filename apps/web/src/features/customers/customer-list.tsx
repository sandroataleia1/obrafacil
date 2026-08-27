"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, Phone, Plus, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { formatPhoneInput } from "@/lib/phone";
import { listAllBudgets } from "@/features/budgets/prototype/budget-store";
import { listAllProjects } from "@/features/projects/prototype/project-store";
import { listAllCustomers } from "./prototype/customer-store";
import type { Customer } from "./types";

function CustomerCard({ customer }: { customer: Customer }) {
  const budgetsCount = listAllBudgets().filter(
    (budget) => budget.customerId === customer.id
  ).length;
  const projectsCount = listAllProjects().filter(
    (project) => project.customerId === customer.id
  ).length;

  return (
    <Link
      href={`/clientes/${customer.id}`}
      className="group flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:translate-y-px"
    >
      <div className="min-w-0 flex-1 space-y-1.5">
        <p className="truncate text-sm font-semibold text-foreground">{customer.name}</p>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Phone className="size-3.5" aria-hidden="true" />
          {formatPhoneInput(customer.phone)}
        </div>
        <p className="text-xs text-muted-foreground">
          {budgetsCount} {budgetsCount === 1 ? "orçamento" : "orçamentos"} ·{" "}
          {projectsCount} {projectsCount === 1 ? "obra" : "obras"}
        </p>
      </div>
      <ChevronRight
        className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
        aria-hidden="true"
      />
    </Link>
  );
}

export function CustomerList() {
  const [customers, setCustomers] = useState<Customer[] | null>(null);

  useEffect(() => {
    // localStorage read after mount: server/hydration both render `null`
    // (loading) first, so there is no mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCustomers(listAllCustomers());
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Clientes
          </h1>
          <p className="text-sm text-muted-foreground">
            Pessoas e empresas para quem você trabalha.
          </p>
        </div>
        <Button
          size="sm"
          nativeButton={false}
          render={
            <Link href="/clientes/novo">
              <Plus className="size-4" aria-hidden="true" />
              Novo
            </Link>
          }
        />
      </div>

      {customers === null ? null : customers.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Nenhum cliente ainda"
          description="Cadastre seu primeiro cliente para criar orçamentos e obras."
        />
      ) : (
        <div className="space-y-3">
          {customers.map((customer) => (
            <CustomerCard key={customer.id} customer={customer} />
          ))}
        </div>
      )}
    </div>
  );
}
