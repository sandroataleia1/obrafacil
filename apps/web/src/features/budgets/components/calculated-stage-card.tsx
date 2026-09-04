"use client";

import { useEffect, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { MoneyField } from "@/components/shared/money-field";
import { Card } from "@/components/ui/card";
import { ConfirmActionDialog } from "@/components/shared/confirm-action-dialog";
import { ResponsiveDialog } from "@/components/shared/responsive-dialog";
import { formatCurrency, parseCurrencyInput } from "@/lib/currency";
import { formatInteger } from "@/lib/decimal";
import type { CalculatedBudgetStage } from "../types";

interface CalculatedStageCardProps {
  stage: CalculatedBudgetStage;
  onUpdateLabor: (laborCost: number) => void;
  onRemove: () => void;
  /** Terminal (approved/rejected) Budgets are read-only: no edit/remove
   * controls, just the decided values. */
  readOnly?: boolean;
}

function EditLaborCostDialog({
  stage,
  open,
  onOpenChange,
  onSave,
}: {
  stage: CalculatedBudgetStage;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (laborCost: number) => void;
}) {
  const [laborInput, setLaborInput] = useState(String(stage.laborCost).replace(".", ","));

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLaborInput(String(stage.laborCost).replace(".", ","));
  }, [open, stage.laborCost]);

  function handleSave() {
    const parsed = parseCurrencyInput(laborInput);
    if (parsed === null || parsed < 0) return;
    onSave(parsed);
    onOpenChange(false);
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Editar mão de obra"
      description={stage.name}
      size="sm"
      footer={
        <>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" onClick={handleSave}>
            Salvar
          </Button>
        </>
      }
    >
      <MoneyField id={`labor-${stage.id}`} label="Mão de obra" value={laborInput} onChange={setLaborInput} />
    </ResponsiveDialog>
  );
}

export function CalculatedStageCard({
  stage,
  onUpdateLabor,
  onRemove,
  readOnly,
}: CalculatedStageCardProps) {
  const [editOpen, setEditOpen] = useState(false);
  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false);

  const subtotal = stage.materialsCost + stage.laborCost;

  return (
    <>
      <Card className="space-y-3">
        <div className="flex items-start justify-between gap-3 px-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">{stage.name}</p>
            <p className="text-xs text-muted-foreground">{stage.item.materialName}</p>
            <p className="mt-1 text-sm text-foreground">
              <span className="font-semibold">{formatInteger(stage.item.quantity)}</span>{" "}
              {stage.item.unit}
            </p>
          </div>
          {readOnly ? null : (
            <button
              type="button"
              onClick={() => setRemoveConfirmOpen(true)}
              aria-label="Remover etapa"
              className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="size-3.5" aria-hidden="true" />
            </button>
          )}
        </div>

        <div className="space-y-2 border-t border-border px-4 pt-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Materiais</span>
            <span className="font-medium text-foreground">
              {formatCurrency(stage.materialsCost)}
            </span>
          </div>

          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Mão de obra</span>
            <span className="inline-flex items-center gap-2">
              <span className="font-medium text-foreground">
                {formatCurrency(stage.laborCost)}
              </span>
              {readOnly ? null : (
                <button
                  type="button"
                  onClick={() => setEditOpen(true)}
                  aria-label="Editar mão de obra"
                  className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <Pencil className="size-3" aria-hidden="true" />
                </button>
              )}
            </span>
          </div>

          <div className="flex items-center justify-between border-t border-border pt-2 text-sm">
            <span className="font-medium text-foreground">Subtotal</span>
            <span className="font-semibold text-foreground">{formatCurrency(subtotal)}</span>
          </div>
        </div>
      </Card>

      <EditLaborCostDialog stage={stage} open={editOpen} onOpenChange={setEditOpen} onSave={onUpdateLabor} />

      <ConfirmActionDialog
        open={removeConfirmOpen}
        onOpenChange={setRemoveConfirmOpen}
        title="Remover etapa?"
        description={`Remover a etapa "${stage.name}"? Os custos de materiais e mão de obra serão retirados do orçamento.`}
        confirmLabel="Remover"
        destructive
        onConfirm={() => {
          onRemove();
          setRemoveConfirmOpen(false);
        }}
      />
    </>
  );
}
