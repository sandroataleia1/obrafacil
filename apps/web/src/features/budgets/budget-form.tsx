"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BackHeader } from "@/components/shared/back-header";
import { EmptyState } from "@/components/shared/empty-state";
import { FileText } from "lucide-react";
import { listAllCustomers } from "@/features/customers/prototype/customer-store";
import type { Customer } from "@/features/customers/types";
import { DEFAULT_MARGIN_PERCENTAGE } from "@/mocks/pricing";
import { PendingItemPreview } from "./components/pending-item-preview";
import {
  clearPendingBudgetItem,
  getPendingBudgetItem,
  type PendingBudgetItem,
} from "./prototype/pending-budget-item";
import { pendingItemToStage } from "./prototype/pending-item-pricing";
import { createBudgetId, saveBudget } from "./prototype/budget-store";
import { updateBudgetDetails } from "./prototype/budget";
import { useBudget } from "./prototype/use-budget";
import type { Budget } from "./types";

const EDITABLE_STATUSES = new Set(["draft", "pending_approval"]);

export function BudgetForm({ budgetId }: { budgetId?: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedCustomerId = searchParams.get("customerId") ?? "";
  const isEditing = Boolean(budgetId);

  const { budget: existingBudget } = useBudget(budgetId ?? "");

  const [pendingItem, setPendingItem] = useState<PendingBudgetItem | null | undefined>(
    undefined
  );
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [name, setName] = useState("");
  const [customerId, setCustomerId] = useState(preselectedCustomerId);
  const [reference, setReference] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // sessionStorage/localStorage read after mount: server/hydration both
    // render `undefined`/`[]` first, so there is no mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPendingItem(getPendingBudgetItem());
    setCustomers(listAllCustomers());
  }, []);

  useEffect(() => {
    if (!existingBudget) return;
    // Seed the form once the existing budget loads from localStorage.
    // Safe post-mount update (see useBudget); only runs once the record
    // becomes available.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setName(existingBudget.name);
    setCustomerId(existingBudget.customerId);
    setReference(existingBudget.projectReference ?? "");
  }, [existingBudget]);

  const canSubmit = name.trim() !== "" && customerId !== "";

  function handleSubmit() {
    if (!canSubmit) return;

    if (isEditing && existingBudget) {
      const result = updateBudgetDetails(existingBudget, {
        name,
        customerId,
        projectReference: reference,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError(null);
      router.push(`/orcamentos/${existingBudget.id}`);
      return;
    }

    const customer = customers.find((item) => item.id === customerId);
    if (!customer) return;

    const now = new Date().toISOString().slice(0, 10);
    const id = createBudgetId(name);

    const budget: Budget = {
      id,
      name: name.trim(),
      customerId: customer.id,
      customerName: customer.name,
      projectReference: reference.trim() || undefined,
      status: "draft",
      stages: pendingItem ? [pendingItemToStage(pendingItem)] : [],
      marginPercentage: DEFAULT_MARGIN_PERCENTAGE,
      discountAmount: 0,
      proposalToken: id,
      createdAt: now,
      updatedAt: now,
    };

    saveBudget(budget);
    clearPendingBudgetItem();
    router.push(`/orcamentos/${id}`);
  }

  if (isEditing && existingBudget === undefined) return null;

  if (isEditing && existingBudget === null) {
    return (
      <div className="space-y-6">
        <BackHeader title="Orçamento não encontrado" onBack={() => router.push("/orcamentos")} />
        <EmptyState
          icon={FileText}
          title="Orçamento não encontrado"
          description="Ele pode ter sido removido ou o link está incorreto."
        />
      </div>
    );
  }

  if (isEditing && existingBudget && !EDITABLE_STATUSES.has(existingBudget.status)) {
    return (
      <div className="space-y-6">
        <BackHeader
          title="Orçamento decidido"
          onBack={() => router.push(`/orcamentos/${existingBudget.id}`)}
        />
        <p className="pl-11 text-sm text-muted-foreground">
          Orçamentos aprovados ou recusados não podem ser editados. O histórico é preservado.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {isEditing ? "Editar orçamento" : "Novo orçamento"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {isEditing
            ? "Corrija o nome, o cliente ou a referência da obra."
            : "Informe o essencial para criar a proposta."}
        </p>
      </div>

      {!isEditing && pendingItem ? <PendingItemPreview item={pendingItem} /> : null}

      <div className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="budget-name" className="text-sm font-medium text-foreground">
            Nome do orçamento
          </label>
          <input
            id="budget-name"
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Casa Oliveira"
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
          />
        </div>

        <div className="space-y-1.5">
          <span className="text-sm font-medium text-foreground">Cliente</span>
          <Select
            value={customerId}
            onValueChange={(value) => setCustomerId(value ?? "")}
          >
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

        <div className="space-y-1.5">
          <label
            htmlFor="budget-reference"
            className="text-sm font-medium text-foreground"
          >
            Obra <span className="text-muted-foreground">(opcional)</span>
          </label>
          <input
            id="budget-reference"
            type="text"
            value={reference}
            onChange={(event) => setReference(event.target.value)}
            placeholder="Construção residencial"
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
        {isEditing ? "Salvar alterações" : "Criar orçamento"}
      </Button>
    </div>
  );
}
