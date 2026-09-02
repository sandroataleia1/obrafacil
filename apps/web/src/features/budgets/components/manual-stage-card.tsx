"use client";

import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/currency";
import { ManualStageForm } from "./manual-stage-form";
import type { ManualBudgetStage } from "../types";

interface ManualStageCardProps {
  stage: ManualBudgetStage;
  onUpdate: (stage: { name: string; value: number }) => void;
  onRemove: () => void;
  /** Terminal (approved/rejected) Budgets are read-only: no edit/remove
   * controls, just the decided values. */
  readOnly?: boolean;
}

export function ManualStageCard({ stage, onUpdate, onRemove, readOnly }: ManualStageCardProps) {
  const [editing, setEditing] = useState(false);

  if (editing && !readOnly) {
    return (
      <ManualStageForm
        initial={stage}
        onSave={(update) => {
          onUpdate(update);
          setEditing(false);
        }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <Card size="sm">
      <CardContent className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{stage.name}</p>
          <p className="text-sm font-medium text-foreground">
            {formatCurrency(stage.value)}
          </p>
        </div>
        {readOnly ? null : (
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => setEditing(true)}
              aria-label="Editar etapa"
              className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Pencil className="size-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={onRemove}
              aria-label="Remover etapa"
              className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="size-3.5" aria-hidden="true" />
            </button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
