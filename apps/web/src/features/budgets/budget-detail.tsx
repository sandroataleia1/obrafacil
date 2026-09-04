"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, Copy, FileText, Plus, Send, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmActionDialog } from "@/components/shared/confirm-action-dialog";
import { ResponsiveDialog } from "@/components/shared/responsive-dialog";
import { formatCurrency, parseCurrencyInput } from "@/lib/currency";
import { formatDate } from "@/lib/date";
import { parseDecimalInput } from "@/lib/decimal";
import { setPendingProject } from "@/features/projects/prototype/pending-project";
import { AdditionalField } from "./components/additional-field";
import { CalculatedStageCard } from "./components/calculated-stage-card";
import { ManualStageCard } from "./components/manual-stage-card";
import { ManualStageForm } from "./components/manual-stage-form";
import { MoneyField } from "@/components/shared/money-field";
import { StatusBadge } from "./components/status-badge";
import { removeBudget, submitBudgetForApproval, updateBudgetComposition } from "./prototype/budget";
import { calculateBudgetTotals, isCalculatedStage, isManualStage } from "./prototype/budget-totals";
import { useBudget } from "./prototype/use-budget";
import { BUDGET_STATUS_LABEL, type BudgetStage } from "./types";

const EDITABLE_STATUSES = new Set(["draft", "pending_approval"]);

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
  const router = useRouter();
  const { budget, refresh } = useBudget(id);
  const [additionalInput, setAdditionalInput] = useState("");
  const [discountInput, setDiscountInput] = useState("");
  const [addingStage, setAddingStage] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [submitConfirmOpen, setSubmitConfirmOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  useEffect(() => {
    if (budget) {
      // Seed the editable input strings once the budget loads from
      // localStorage. Safe post-mount update (see useBudget); only re-syncs
      // when a *different* budget loads, not on every persist() from editing.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAdditionalInput(String(budget.marginPercentage).replace(".", ","));
      setDiscountInput(String(budget.discountAmount).replace(".", ","));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [budget?.id]);

  function updateStages(stages: BudgetStage[]) {
    if (!budget) return;
    const result = updateBudgetComposition(budget, { stages });
    if (!result.ok) {
      window.alert(result.error);
      return;
    }
    refresh();
  }

  function handleConfirmSubmitForApproval() {
    if (!budget) return;
    const result = submitBudgetForApproval(budget);
    if (!result.ok) {
      window.alert(result.error);
      return;
    }
    setSubmitConfirmOpen(false);
    refresh();
  }

  async function handleCopyLink() {
    if (!budget) return;
    const url = `${window.location.origin}/proposta/${budget.proposalToken}`;
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(url);
      } else {
        window.prompt("Copie o link da proposta:", url);
      }
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      window.prompt("Copie o link da proposta:", url);
    }
  }

  function handleConfirmDelete() {
    if (!budget) return;
    const result = removeBudget(budget);
    if (!result.ok) {
      window.alert(result.error);
      return;
    }
    router.push("/orcamentos");
  }

  function handleCreateProject() {
    if (!budget) return;
    setPendingProject({
      budgetId: budget.id,
      budgetName: budget.name,
      budgetTotal: calculateBudgetTotals(budget).total,
      customerId: budget.customerId,
      customerName: budget.customerName,
      reference: budget.projectReference,
    });
    router.push("/obras/nova");
  }

  if (budget === undefined) return null;

  if (budget === null) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => router.push("/orcamentos")}
          className="-ml-1.5 flex items-center gap-1 rounded-lg py-1.5 pr-3 pl-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          Voltar
        </button>
        <EmptyState
          icon={FileText}
          title="Orçamento não encontrado"
          description="Ele pode ter sido removido ou o link está incorreto."
        />
      </div>
    );
  }

  const totals = calculateBudgetTotals(budget);
  const isComposable = EDITABLE_STATUSES.has(budget.status);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => router.push("/orcamentos")}
          className="-ml-1.5 flex items-center gap-1 rounded-lg py-1.5 pr-3 pl-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          Voltar
        </button>
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
              readOnly={!isComposable}
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
              readOnly={!isComposable}
              onUpdate={(update) =>
                updateStages(
                  budget.stages.map((s) => (s.id === stage.id ? { ...s, ...update } : s))
                )
              }
              onRemove={() => updateStages(budget.stages.filter((s) => s.id !== stage.id))}
            />
          ) : null
        )}

        {!isComposable ? null : (
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

      <ResponsiveDialog open={addingStage} onOpenChange={setAddingStage} title="Adicionar etapa" size="sm">
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
      </ResponsiveDialog>

      <div className="space-y-4 rounded-xl border border-border bg-card p-4">
        <InfoRow label="Custo de materiais" value={formatCurrency(totals.materialsCost)} />
        <InfoRow label="Mão de obra" value={formatCurrency(totals.laborCost)} />
        {totals.manualStagesTotal > 0 ? (
          <InfoRow label="Outras etapas" value={formatCurrency(totals.manualStagesTotal)} />
        ) : null}

        {isComposable ? (
          <>
            <AdditionalField
              id="additional"
              value={additionalInput}
              onChange={(raw) => {
                setAdditionalInput(raw);
                const parsed = parseDecimalInput(raw);
                if (parsed !== null && parsed >= 0) {
                  const result = updateBudgetComposition(budget, { marginPercentage: parsed });
                  if (result.ok) refresh();
                }
              }}
            />

            <MoneyField
              id="discount"
              label="Desconto"
              value={discountInput}
              onChange={(raw) => {
                setDiscountInput(raw);
                const parsed = parseCurrencyInput(raw);
                if (parsed !== null && parsed >= 0) {
                  const result = updateBudgetComposition(budget, { discountAmount: parsed });
                  if (result.ok) refresh();
                }
              }}
            />
          </>
        ) : (
          <>
            <InfoRow label="Adicional" value={`${budget.marginPercentage}%`} />
            {budget.discountAmount > 0 ? (
              <InfoRow label="Desconto" value={`-${formatCurrency(budget.discountAmount)}`} />
            ) : null}
          </>
        )}

        <div className="space-y-1 border-t border-border pt-3">
          <InfoRow label="Total do orçamento" value={formatCurrency(totals.total)} emphasis />
        </div>
      </div>

      <div className="space-y-2">
        {budget.status === "draft" ? (
          <>
            <Button type="button" size="lg" className="w-full" onClick={() => setSubmitConfirmOpen(true)}>
              <Send className="size-4" aria-hidden="true" />
              Disponibilizar para aprovação
            </Button>
            <Button
              variant="outline"
              className="w-full"
              nativeButton={false}
              render={<Link href={`/orcamentos/${budget.id}/editar`}>Editar</Link>}
            />
          </>
        ) : EDITABLE_STATUSES.has(budget.status) ? (
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link href={`/orcamentos/${budget.id}/editar`}>Editar</Link>}
            />
            <Button type="button" variant="outline" onClick={handleCopyLink}>
              <Copy className="size-4" aria-hidden="true" />
              {linkCopied ? "Link copiado" : "Copiar link"}
            </Button>
          </div>
        ) : (
          <Button type="button" variant="outline" className="w-full" onClick={handleCopyLink}>
            <Copy className="size-4" aria-hidden="true" />
            {linkCopied ? "Link copiado" : "Copiar link"}
          </Button>
        )}

        <Button
          size="lg"
          variant="outline"
          className="w-full"
          nativeButton={false}
          render={<Link href={`/proposta/${budget.proposalToken}`}>Visualizar proposta</Link>}
        />
      </div>

      {budget.status === "approved" ? (
        budget.projectId ? (
          <Button
            variant="outline"
            size="lg"
            className="w-full"
            nativeButton={false}
            render={<Link href={`/obras/${budget.projectId}`}>Abrir obra</Link>}
          />
        ) : (
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="w-full"
            onClick={handleCreateProject}
          >
            Criar obra
          </Button>
        )
      ) : null}

      {EDITABLE_STATUSES.has(budget.status) ? (
        <Button type="button" variant="destructive" className="w-full" onClick={() => setDeleteConfirmOpen(true)}>
          <Trash2 className="size-4" aria-hidden="true" />
          Excluir
        </Button>
      ) : null}

      <ConfirmActionDialog
        open={submitConfirmOpen}
        onOpenChange={setSubmitConfirmOpen}
        title="Disponibilizar para aprovação?"
        confirmLabel="Disponibilizar"
        onConfirm={handleConfirmSubmitForApproval}
      >
        <div className="space-y-1 rounded-lg border border-border bg-muted/30 p-3 text-sm">
          <p className="text-foreground">Cliente: {budget.customerName}</p>
          <p className="text-foreground">Valor total: {formatCurrency(totals.total)}</p>
          <p className="text-muted-foreground">
            {BUDGET_STATUS_LABEL[budget.status]} → {BUDGET_STATUS_LABEL.pending_approval}
          </p>
        </div>
      </ConfirmActionDialog>

      <ConfirmActionDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="Excluir orçamento?"
        description={`Excluir o orçamento "${budget.name}"? Esta ação não pode ser desfeita.`}
        confirmLabel="Excluir"
        destructive
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}
