"use client";

import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";

import { MoneyField } from "@/components/shared/money-field";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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

export function CalculatedStageCard({
  stage,
  onUpdateLabor,
  onRemove,
  readOnly,
}: CalculatedStageCardProps) {
  const [editing, setEditing] = useState(false);
  const [laborInput, setLaborInput] = useState(String(stage.laborCost).replace(".", ","));

  const subtotal = stage.materialsCost + stage.laborCost;

  function handleSave() {
    const parsed = parseCurrencyInput(laborInput);
    if (parsed === null || parsed < 0) return;
    onUpdateLabor(parsed);
    setEditing(false);
  }

  return (
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
            onClick={onRemove}
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

        {editing && !readOnly ? (
          <div className="space-y-2 pt-1">
            <MoneyField
              id={`labor-${stage.id}`}
              label="Mão de obra"
              value={laborInput}
              onChange={setLaborInput}
            />
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setEditing(false)}
                className="flex-1"
              >
                Cancelar
              </Button>
              <Button type="button" size="sm" onClick={handleSave} className="flex-1">
                Salvar
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Mão de obra</span>
            <span className="inline-flex items-center gap-2">
              <span className="font-medium text-foreground">
                {formatCurrency(stage.laborCost)}
              </span>
              {readOnly ? null : (
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  aria-label="Editar mão de obra"
                  className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <Pencil className="size-3" aria-hidden="true" />
                </button>
              )}
            </span>
          </div>
        )}

        <div className="flex items-center justify-between border-t border-border pt-2 text-sm">
          <span className="font-medium text-foreground">Subtotal</span>
          <span className="font-semibold text-foreground">{formatCurrency(subtotal)}</span>
        </div>
      </div>
    </Card>
  );
}
