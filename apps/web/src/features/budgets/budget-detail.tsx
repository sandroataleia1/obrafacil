"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FileText, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { formatCurrency, parseCurrencyInput } from "@/lib/currency";
import { formatDate } from "@/lib/date";
import { CalculatedStageCard } from "./components/calculated-stage-card";
import { ManualStageCard } from "./components/manual-stage-card";
import { ManualStageForm } from "./components/manual-stage-form";
import { MarginControl } from "./components/margin-control";
import { MoneyField } from "./components/money-field";
import { StatusBadge } from "./components/status-badge";
import { calculateBudgetTotals, isCalculatedStage, isManualStage } from "./prototype/budget-totals";
import { useBudget } from "./prototype/use-budget";
import type { BudgetStage } from "./types";

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

export function BudgetDetail({ id }: { id: string }) {
  const { budget, persist } = useBudget(id);
  const [otherCostsInput, setOtherCostsInput] = useState("");
  const [discountInput, setDiscountInput] = useState("");
  const [addingStage, setAddingStage] = useState(false);

  useEffect(() => {
    if (budget) {
      // Seed the editable input strings once the budget loads from
      // localStorage. Safe post-mount update (see useBudget); only re-syncs
      // when a *different* budget loads, not on every persist() from editing.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOtherCostsInput(String(budget.otherCosts).replace(".", ","));
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDiscountInput(String(budget.discountAmount).replace(".", ","));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [budget?.id]);

  function updateStages(stages: BudgetStage[]) {
    if (!budget) return;
    persist({ ...budget, stages });
  }

  if (budget === undefined) return null;

  if (budget === null) {
    return (
      <EmptyState
        icon={FileText}
        title="Orçamento não encontrado"
        description="Ele pode ter sido removido ou o link está incorreto."
      />
    );
  }

  const totals = calculateBudgetTotals(budget);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {budget.name}
          </h1>
          <StatusBadge status={budget.status} />
        </div>
        {budget.projectReference ? (
          <p className="text-sm text-muted-foreground">{budget.projectReference}</p>
        ) : null}
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <InfoRow label="Cliente" value={budget.customerName} />
        <InfoRow label="Atualizado em" value={formatDate(budget.updatedAt)} />
        <div className="mt-2 border-t border-border pt-2">
          <InfoRow label="Valor" value={formatCurrency(totals.total)} emphasis />
        </div>
      </div>

      <div className="space-y-3">
        {budget.stages.map((stage) =>
          isCalculatedStage(stage) ? (
            <CalculatedStageCard
              key={stage.id}
              stage={stage}
              onUpdateLabor={(laborCost) =>
                updateStages(
                  budget.stages.map((s) => (s.id === stage.id ? { ...s, laborCost } : s))
                )
              }
              onRemove={() => updateStages(budget.stages.filter((s) => s.id !== stage.id))}
            />
          ) : isManualStage(stage) ? (
            <ManualStageCard
              key={stage.id}
              stage={stage}
              onUpdate={(update) =>
                updateStages(
                  budget.stages.map((s) => (s.id === stage.id ? { ...s, ...update } : s))
                )
              }
              onRemove={() => updateStages(budget.stages.filter((s) => s.id !== stage.id))}
            />
          ) : null
        )}

        {addingStage ? (
          <ManualStageForm
            onSave={(newStage) => {
              updateStages([
                ...budget.stages,
                { id: `stage-${Date.now()}`, kind: "manual", ...newStage },
              ]);
              setAddingStage(false);
            }}
            onCancel={() => setAddingStage(false)}
          />
        ) : (
          <button
            type="button"
            onClick={() => setAddingStage(true)}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border py-3 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
          >
            <Plus className="size-4" aria-hidden="true" />
            Adicionar etapa
          </button>
        )}
      </div>

      <div className="space-y-4 rounded-xl border border-border bg-card p-4">
        <InfoRow label="Custo de materiais" value={formatCurrency(totals.materialsCost)} />
        <InfoRow label="Mão de obra" value={formatCurrency(totals.laborCost)} />
        {totals.manualStagesTotal > 0 ? (
          <InfoRow label="Outras etapas" value={formatCurrency(totals.manualStagesTotal)} />
        ) : null}

        <MoneyField
          id="other-costs"
          label="Outros custos"
          value={otherCostsInput}
          onChange={(raw) => {
            setOtherCostsInput(raw);
            const parsed = parseCurrencyInput(raw);
            if (parsed !== null && parsed >= 0) {
              persist({ ...budget, otherCosts: parsed });
            }
          }}
        />

        <MarginControl
          value={budget.marginPercentage}
          onChange={(marginPercentage) => persist({ ...budget, marginPercentage })}
        />

        <MoneyField
          id="discount"
          label="Desconto"
          value={discountInput}
          onChange={(raw) => {
            setDiscountInput(raw);
            const parsed = parseCurrencyInput(raw);
            if (parsed !== null && parsed >= 0) {
              persist({ ...budget, discountAmount: parsed });
            }
          }}
        />

        <div className="space-y-1 border-t border-border pt-3">
          <InfoRow label="Total do orçamento" value={formatCurrency(totals.total)} emphasis />
        </div>
      </div>

      <Button
        size="lg"
        className="w-full"
        nativeButton={false}
        render={<Link href={`/proposta/${budget.proposalToken}`}>Visualizar proposta</Link>}
      />
    </div>
  );
}
