"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { BackHeader } from "@/components/shared/back-header";
import { Button } from "@/components/ui/button";
import { MoneyField } from "@/components/shared/money-field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { parseCurrencyInput } from "@/lib/currency";
import { listAllCustomers } from "@/features/customers/prototype/customer-store";
import type { Customer } from "@/features/customers/types";
import { getProject, listProjectsByCustomer } from "@/features/projects/prototype/project-store";
import type { Project } from "@/features/projects/types";
import { createReceivable, updateReceivable } from "./prototype/receivable";
import { listReceiptsByReceivable } from "./prototype/receipt-store";
import { useReceivable } from "./prototype/use-receivable";

const NO_PROJECT = "none";

export function ReceivableForm({ receivableId }: { receivableId?: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const lockedProjectId = searchParams.get("projectId");

  const { receivable: existingReceivable } = useReceivable(receivableId ?? "");
  const isEditing = Boolean(receivableId);

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [lockedProject, setLockedProject] = useState<Project | null | undefined>(undefined);
  const [hasReceipts, setHasReceipts] = useState(false);

  const [description, setDescription] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [projectId, setProjectId] = useState(NO_PROJECT);
  const [amountInput, setAmountInput] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCustomers(listAllCustomers());
    if (lockedProjectId) {
      const project = getProject(lockedProjectId);
      setLockedProject(project);
      if (project) {
        setCustomerId(project.customerId);
        setProjectId(project.id);
      }
    } else {
      setLockedProject(null);
    }
  }, [lockedProjectId]);

  useEffect(() => {
    if (!existingReceivable) return;
    // Seed the form once the existing receivable loads from localStorage.
    // Safe post-mount update (see useReceivable); only runs once the
    // record becomes available.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDescription(existingReceivable.description);
    setCustomerId(existingReceivable.customerId);
    setProjectId(existingReceivable.projectId ?? NO_PROJECT);
    setAmountInput(String(existingReceivable.amount).replace(".", ","));
    setDueDate(existingReceivable.dueDate);
    setNotes(existingReceivable.notes ?? "");
    setHasReceipts(listReceiptsByReceivable(existingReceivable.id).length > 0);
  }, [existingReceivable]);

  const isProjectLocked = Boolean(lockedProject);
  const fieldsLockedByReceipts = isEditing && hasReceipts;
  const projectsForCustomer = customerId ? listProjectsByCustomer(customerId) : [];

  function handleCustomerChange(value: string) {
    setCustomerId(value);
    // Reset the Obra selection if it no longer belongs to the newly
    // chosen customer, so an inconsistent pair can never be submitted.
    if (projectId !== NO_PROJECT) {
      const stillValid = listProjectsByCustomer(value).some((project) => project.id === projectId);
      if (!stillValid) setProjectId(NO_PROJECT);
    }
  }

  function handleSubmit() {
    const amount = parseCurrencyInput(amountInput);
    if (amount === null || amount <= 0) {
      setError("Informe um valor maior que zero.");
      return;
    }

    const input = {
      description,
      customerId,
      projectId: projectId === NO_PROJECT ? undefined : projectId,
      amount,
      dueDate,
      notes,
    };

    const result = existingReceivable
      ? updateReceivable(existingReceivable, input)
      : createReceivable(input);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setError(null);
    router.push(`/financeiro/contas-a-receber/${result.receivable.id}`);
  }

  if (isEditing && existingReceivable === undefined) return null;

  if (isEditing && existingReceivable === null) {
    return (
      <div className="space-y-6">
        <BackHeader
          title="Conta não encontrada"
          onBack={() => router.push("/financeiro/contas-a-receber")}
        />
        <p className="pl-11 text-sm text-muted-foreground">
          Ela pode ter sido removida ou o link está incorreto.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-6">
      <div className="space-y-1">
        <BackHeader
          title={isEditing ? "Editar conta" : "Nova conta a receber"}
          onBack={() =>
            router.push(
              existingReceivable
                ? `/financeiro/contas-a-receber/${existingReceivable.id}`
                : "/financeiro/contas-a-receber"
            )
          }
        />
      </div>

      <div className="space-y-4">
        {fieldsLockedByReceipts ? (
          <p className="text-sm text-muted-foreground">
            Cliente, obra e valor não podem ser alterados após um recebimento registrado.
          </p>
        ) : null}

        <div className="space-y-1.5">
          <label htmlFor="receivable-description" className="text-sm font-medium text-foreground">
            Descrição
          </label>
          <input
            id="receivable-description"
            type="text"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Entrada, parcela 2, medição..."
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
          />
        </div>

        <div className="space-y-1.5">
          <span className="text-sm font-medium text-foreground">Cliente</span>
          {isProjectLocked || fieldsLockedByReceipts ? (
            <div className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-base text-foreground">
              {customers.find((customer) => customer.id === customerId)?.name ?? "—"}
            </div>
          ) : (
            <Select value={customerId} onValueChange={(value) => handleCustomerChange(value ?? "")}>
              <SelectTrigger className="h-12 w-full px-4 text-base">
                <SelectValue placeholder="Selecione um cliente">
                  {(value: string | null) =>
                    customers.find((customer) => customer.id === value)?.name ?? "Selecione um cliente"
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
          )}
        </div>

        <div className="space-y-1.5">
          <span className="text-sm font-medium text-foreground">
            Obra <span className="text-muted-foreground">(opcional)</span>
          </span>
          {isProjectLocked ? (
            <div className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-base text-foreground">
              {lockedProject?.name ?? "—"}
            </div>
          ) : fieldsLockedByReceipts ? (
            <div className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-base text-foreground">
              {projectId === NO_PROJECT
                ? "Sem obra vinculada"
                : (projectsForCustomer.find((project) => project.id === projectId)?.name ??
                  "Sem obra vinculada")}
            </div>
          ) : (
            <Select value={projectId} onValueChange={(value) => setProjectId(value ?? NO_PROJECT)}>
              <SelectTrigger className="h-12 w-full px-4 text-base" disabled={!customerId}>
                <SelectValue placeholder="Sem obra vinculada">
                  {(value: string | null) =>
                    value && value !== NO_PROJECT
                      ? (projectsForCustomer.find((project) => project.id === value)?.name ??
                        "Sem obra vinculada")
                      : "Sem obra vinculada"
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_PROJECT}>Sem obra vinculada</SelectItem>
                {projectsForCustomer.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {!customerId && !isProjectLocked && !fieldsLockedByReceipts ? (
            <p className="text-xs text-muted-foreground">Selecione um cliente para escolher a obra.</p>
          ) : null}
        </div>

        {fieldsLockedByReceipts ? (
          <div className="space-y-1.5">
            <span className="text-sm font-medium text-foreground">Valor</span>
            <div className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-xl font-semibold text-foreground">
              {amountInput ? `R$ ${amountInput}` : "—"}
            </div>
          </div>
        ) : (
          <MoneyField id="receivable-amount" label="Valor" value={amountInput} onChange={setAmountInput} />
        )}

        <div className="space-y-1.5">
          <label htmlFor="receivable-due-date" className="text-sm font-medium text-foreground">
            Vencimento
          </label>
          <input
            id="receivable-due-date"
            type="date"
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="receivable-notes" className="text-sm font-medium text-foreground">
            Observação <span className="text-muted-foreground">(opcional)</span>
          </label>
          <input
            id="receivable-notes"
            type="text"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Detalhes adicionais"
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
          />
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>

      <Button type="button" size="lg" onClick={handleSubmit} className="w-full">
        {isEditing ? "Salvar alterações" : "Criar conta"}
      </Button>
    </div>
  );
}
