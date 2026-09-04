"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, Plus } from "lucide-react";

import { BackHeader } from "@/components/shared/back-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { FileText } from "lucide-react";
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
import { updateProjectDetails } from "./prototype/project";
import { createProjectId, saveProject } from "./prototype/project-store";
import { useProject } from "./prototype/use-project";
import type { Project } from "./types";

export function ProjectForm({ projectId }: { projectId?: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedCustomerId = searchParams.get("customerId") ?? "";
  const isEditing = Boolean(projectId);

  const { project: existingProject } = useProject(projectId ?? "");

  const [pendingProject, setPendingProject] = useState<
    PendingProject | null | undefined
  >(undefined);
  const [customers, setCustomers] = useState<Customer[]>([]);

  const [name, setName] = useState("");
  const [customerId, setCustomerId] = useState(preselectedCustomerId);
  const [reference, setReference] = useState("");
  const [address, setAddress] = useState("");
  const [expectedStartDate, setExpectedStartDate] = useState("");
  const [expectedEndDate, setExpectedEndDate] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Safe post-mount reads — same hydration reasoning as useBudget.
    const pending = isEditing ? null : getPendingProject();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPendingProject(pending);
    setCustomers(listAllCustomers());

    if (pending) {
      setName(pending.budgetName);
      setCustomerId(pending.customerId);
      setReference(pending.reference ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!existingProject) return;
    // Seed the form once the existing project loads from localStorage.
    // Safe post-mount update (see useProject); only runs when the
    // record becomes available.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setName(existingProject.name);
    setCustomerId(existingProject.customerId);
    setReference(existingProject.reference ?? "");
    setAddress(existingProject.address ?? "");
    setExpectedStartDate(existingProject.expectedStartDate ?? "");
    setExpectedEndDate(existingProject.expectedEndDate ?? "");
  }, [existingProject]);

  const fromBudget = Boolean(pendingProject) || (isEditing && Boolean(existingProject?.budgetId));
  const canSubmit = name.trim() !== "" && customerId !== "";

  function handleSubmit() {
    if (!canSubmit) return;

    if (isEditing && existingProject) {
      const result = updateProjectDetails(existingProject, {
        name,
        customerId,
        reference,
        address,
        expectedStartDate,
        expectedEndDate,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError(null);
      router.push(`/obras/${existingProject.id}`);
      return;
    }

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
      expectedEndDate: expectedEndDate || undefined,
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

  if (isEditing && existingProject === undefined) return null;

  if (isEditing && existingProject === null) {
    return (
      <div className="space-y-6">
        <BackHeader title="Obra não encontrada" onBack={() => router.push("/obras")} />
        <EmptyState
          icon={FileText}
          title="Obra não encontrada"
          description="Ela pode ter sido removida ou o link está incorreto."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-6">
      <div className="space-y-1">
        <BackHeader
          title={isEditing ? "Editar obra" : "Nova obra"}
          onBack={() => router.push(isEditing && existingProject ? `/obras/${existingProject.id}` : "/obras")}
        />
        <p className="pl-11 text-sm text-muted-foreground">
          {isEditing
            ? "Corrija o nome, o cliente ou o endereço da obra."
            : "Informe o essencial para começar a acompanhar a execução."}
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
              {pendingProject?.customerName ?? existingProject?.customerName}
            </div>
            {isEditing ? (
              <p className="text-xs text-muted-foreground">
                Esta obra está vinculada a um orçamento e não pode trocar de cliente.
              </p>
            ) : null}
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

        <div className="space-y-1.5">
          <label htmlFor="project-end-date" className="text-sm font-medium text-foreground">
            Data prevista de conclusão <span className="text-muted-foreground">(opcional)</span>
          </label>
          <input
            id="project-end-date"
            type="date"
            value={expectedEndDate}
            onChange={(event) => setExpectedEndDate(event.target.value)}
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
          />
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>

      <Button
        type="button"
        size="lg"
        onClick={handleSubmit}
        disabled={!canSubmit}
        className="w-full"
      >
        {isEditing ? "Salvar alterações" : "Criar obra"}
      </Button>
    </div>
  );
}
