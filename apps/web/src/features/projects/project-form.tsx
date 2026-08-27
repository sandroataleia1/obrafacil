"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, Plus } from "lucide-react";

import { BackHeader } from "@/components/shared/back-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCurrency } from "@/lib/currency";
import { getBudget, saveBudget } from "@/features/budgets/prototype/budget-store";
import { listAllCustomers } from "@/features/customers/prototype/customer-store";
import type { Customer } from "@/features/customers/types";
import {
  clearPendingProject,
  getPendingProject,
  type PendingProject,
} from "./prototype/pending-project";
import { createProjectId, saveProject } from "./prototype/project-store";
import type { Project } from "./types";

export function ProjectForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedCustomerId = searchParams.get("customerId") ?? "";

  const [pendingProject, setPendingProject] = useState<
    PendingProject | null | undefined
  >(undefined);
  const [customers, setCustomers] = useState<Customer[]>([]);

  const [name, setName] = useState("");
  const [customerId, setCustomerId] = useState(preselectedCustomerId);
  const [reference, setReference] = useState("");
  const [address, setAddress] = useState("");
  const [expectedStartDate, setExpectedStartDate] = useState("");

  useEffect(() => {
    // Safe post-mount reads — same hydration reasoning as useBudget.
    const pending = getPendingProject();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPendingProject(pending);
    setCustomers(listAllCustomers());

    if (pending) {
      setName(pending.budgetName);
      setCustomerId(pending.customerId);
      setReference(pending.reference ?? "");
    }
  }, []);

  const fromBudget = Boolean(pendingProject);
  const canSubmit = name.trim() !== "" && customerId !== "";

  function handleSubmit() {
    if (!canSubmit) return;

    const customer = customers.find((item) => item.id === customerId);
    if (!customer) return;

    const now = new Date().toISOString().slice(0, 10);
    const project: Project = {
      id: createProjectId(),
      name: name.trim(),
      customerId: customer.id,
      customerName: customer.name,
      reference: reference.trim() || undefined,
      address: address.trim() || undefined,
      status: "planning",
      budgetId: pendingProject?.budgetId,
      expectedStartDate: expectedStartDate || undefined,
      createdAt: now,
      updatedAt: now,
    };

    saveProject(project);

    if (pendingProject) {
      const budget = getBudget(pendingProject.budgetId);
      if (budget) {
        saveBudget({ ...budget, projectId: project.id, updatedAt: now });
      }
      clearPendingProject();
    }

    router.push(`/obras/${project.id}`);
  }

  return (
    <div className="space-y-6 pb-6">
      <div className="space-y-1">
        <BackHeader title="Nova obra" onBack={() => router.push("/obras")} />
        <p className="pl-11 text-sm text-muted-foreground">
          Informe o essencial para começar a acompanhar a execução.
        </p>
      </div>

      {pendingProject ? (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <CheckCircle2 className="size-4.5" aria-hidden="true" />
            </span>
            <div className="min-w-0 space-y-1">
              <p className="text-xs font-semibold tracking-wide text-primary uppercase">
                Orçamento aprovado
              </p>
              <p className="text-sm font-medium text-foreground">
                {pendingProject.budgetName}
              </p>
              <p className="text-sm text-foreground">
                {formatCurrency(pendingProject.budgetTotal)}
              </p>
              <p className="text-xs text-muted-foreground">
                Cliente: {pendingProject.customerName}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="project-name" className="text-sm font-medium text-foreground">
            Nome da obra
          </label>
          <input
            id="project-name"
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Casa Oliveira"
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
          />
        </div>

        {fromBudget ? (
          <div className="space-y-1.5">
            <span className="text-sm font-medium text-foreground">Cliente</span>
            <div className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-base text-foreground">
              {pendingProject?.customerName}
            </div>
          </div>
        ) : (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground">Cliente</span>
              <Link
                href="/clientes/novo?returnTo=/obras/nova"
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                <Plus className="size-3" aria-hidden="true" />
                Novo cliente
              </Link>
            </div>
            <Select value={customerId} onValueChange={(value) => setCustomerId(value ?? "")}>
              <SelectTrigger className="h-12 w-full px-4 text-base">
                <SelectValue placeholder="Selecione um cliente">
                  {(value: string | null) =>
                    customers.find((customer) => customer.id === value)?.name ??
                    "Selecione um cliente"
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {customers.map((customer) => (
                  <SelectItem key={customer.id} value={customer.id}>
                    {customer.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="space-y-1.5">
          <label
            htmlFor="project-reference"
            className="text-sm font-medium text-foreground"
          >
            Referência / descrição <span className="text-muted-foreground">(opcional)</span>
          </label>
          <input
            id="project-reference"
            type="text"
            value={reference}
            onChange={(event) => setReference(event.target.value)}
            placeholder="Construção residencial"
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="project-address" className="text-sm font-medium text-foreground">
            Endereço da obra <span className="text-muted-foreground">(opcional)</span>
          </label>
          <input
            id="project-address"
            type="text"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            placeholder="Rua das Flores, 120 - São Paulo/SP"
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="project-start-date" className="text-sm font-medium text-foreground">
            Data prevista de início <span className="text-muted-foreground">(opcional)</span>
          </label>
          <input
            id="project-start-date"
            type="date"
            value={expectedStartDate}
            onChange={(event) => setExpectedStartDate(event.target.value)}
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      <Button
        type="button"
        size="lg"
        onClick={handleSubmit}
        disabled={!canSubmit}
        className="w-full"
      >
        Criar obra
      </Button>
    </div>
  );
}
