"use client";

import { useState } from "react";

import { MoneyField } from "@/components/shared/money-field";
import { Button } from "@/components/ui/button";
import { parseCurrencyInput } from "@/lib/currency";
import type { ManualBudgetStage } from "../types";

interface ManualStageFormProps {
  initial?: ManualBudgetStage;
  onSave: (stage: { name: string; value: number }) => void;
  onCancel: () => void;
}

export function ManualStageForm({ initial, onSave, onCancel }: ManualStageFormProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [value, setValue] = useState(
    initial ? String(initial.value).replace(".", ",") : ""
  );

  const parsedValue = parseCurrencyInput(value);
  const canSave = name.trim() !== "" && parsedValue !== null && parsedValue > 0;

  function handleSave() {
    if (!canSave || parsedValue === null) return;
    onSave({ name: name.trim(), value: parsedValue });
  }

  return (
    <div className="space-y-3 rounded-xl border border-border bg-muted/40 p-3.5">
      <div className="space-y-1.5">
        <label htmlFor="stage-name" className="text-sm font-medium text-foreground">
          Nome da etapa
        </label>
        <input
          id="stage-name"
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Pintura"
          className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
        />
      </div>

      <MoneyField
        id="stage-value"
        label="Custo da etapa"
        value={value}
        onChange={setValue}
      />

      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onCancel} className="flex-1">
          Cancelar
        </Button>
        <Button type="button" size="sm" onClick={handleSave} disabled={!canSave} className="flex-1">
          Salvar
        </Button>
      </div>
    </div>
  );
}
