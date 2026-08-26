"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BrickWall } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDecimal, formatInteger } from "@/lib/decimal";
import { customers } from "@/mocks/customers";
import { DEFAULT_MARGIN_PERCENTAGE } from "@/mocks/pricing";
import {
  clearPendingBudgetItem,
  getPendingBudgetItem,
  type PendingBudgetItem,
} from "./prototype/pending-budget-item";
import { pendingItemToStage } from "./prototype/pending-item-pricing";
import { createBudgetId, saveBudget } from "./prototype/budget-store";
import type { Budget } from "./types";

export function BudgetForm() {
  const router = useRouter();

  const [pendingItem, setPendingItem] = useState<PendingBudgetItem | null | undefined>(
    undefined
  );
  const [name, setName] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [reference, setReference] = useState("");

  useEffect(() => {
    // sessionStorage read after mount: server/hydration both render
    // `undefined` first, so there is no mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPendingItem(getPendingBudgetItem());
  }, []);

  const canSubmit = name.trim() !== "" && customerId !== "";

  function handleSubmit() {
    if (!canSubmit) return;

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
      otherCosts: 0,
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

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Novo orçamento
        </h1>
        <p className="text-sm text-muted-foreground">
          Informe o essencial para criar a proposta.
        </p>
      </div>

      {pendingItem ? (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <BrickWall className="size-4.5" aria-hidden="true" />
            </span>
            <div className="min-w-0 space-y-1">
              <p className="text-xs font-semibold tracking-wide text-primary uppercase">
                Item adicionado do cálculo
              </p>
              <p className="text-sm font-medium text-foreground">
                {pendingItem.title}
              </p>
              <p className="text-xs text-muted-foreground">
                {pendingItem.materialName}
              </p>
              <p className="text-sm text-foreground">
                <span className="font-semibold">
                  {formatInteger(pendingItem.quantity)}
                </span>{" "}
                {pendingItem.unit} · {formatDecimal(pendingItem.netAreaM2)} m²
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

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
      </div>

      <Button
        type="button"
        size="lg"
        onClick={handleSubmit}
        disabled={!canSubmit}
        className="w-full"
      >
        Criar orçamento
      </Button>
    </div>
  );
}
