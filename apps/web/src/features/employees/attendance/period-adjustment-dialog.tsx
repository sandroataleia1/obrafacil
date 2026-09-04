"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { MoneyField } from "@/components/shared/money-field";
import { ResponsiveDialog } from "@/components/shared/responsive-dialog";
import { parseCurrencyInput } from "@/lib/currency";

type AdjustmentType = "none" | "discount" | "increase";

const ADJUSTMENT_OPTIONS: { value: AdjustmentType; label: string }[] = [
  { value: "none", label: "Nenhum" },
  { value: "discount", label: "Desconto" },
  { value: "increase", label: "Acréscimo" },
];

/**
 * Editor for `manualAdjustment` — same semantics as before (008B/008C),
 * only moved from an always-visible block into a Dialog/Sheet, per
 * Demo-Ready 009B §22. No new field, no motivo/observação added.
 */
export function PeriodAdjustmentDialog({
  manualAdjustment,
  open,
  onOpenChange,
  onSave,
}: {
  manualAdjustment: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (value: number) => void;
}) {
  const [adjustmentType, setAdjustmentType] = useState<AdjustmentType>("none");
  const [amountInput, setAmountInput] = useState("");

  useEffect(() => {
    if (!open) return;
    if (manualAdjustment > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAdjustmentType("increase");
      setAmountInput(String(manualAdjustment).replace(".", ","));
    } else if (manualAdjustment < 0) {
      setAdjustmentType("discount");
      setAmountInput(String(-manualAdjustment).replace(".", ","));
    } else {
      setAdjustmentType("none");
      setAmountInput("");
    }
  }, [open, manualAdjustment]);

  function handleSave() {
    const magnitude = parseCurrencyInput(amountInput) ?? 0;
    const value =
      adjustmentType === "discount" ? -Math.abs(magnitude) : adjustmentType === "increase" ? Math.abs(magnitude) : 0;
    onSave(value);
    onOpenChange(false);
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Ajuste manual"
      description="Não altera automaticamente por faltas ou meios períodos — use um valor explícito."
      size="sm"
      footer={
        <>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" onClick={handleSave}>
            Salvar ajuste
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-2">
          {ADJUSTMENT_OPTIONS.map((option) => {
            const selected = adjustmentType === option.value;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={selected}
                onClick={() => setAdjustmentType(option.value)}
                className={
                  selected
                    ? "rounded-lg border border-primary bg-primary/5 py-2 text-xs font-semibold text-primary"
                    : "rounded-lg border border-border bg-card py-2 text-xs font-semibold text-foreground hover:border-primary/30"
                }
              >
                {option.label}
              </button>
            );
          })}
        </div>
        {adjustmentType !== "none" ? (
          <MoneyField id="period-adjustment-amount" label="Valor do ajuste" value={amountInput} onChange={setAmountInput} />
        ) : null}
      </div>
    </ResponsiveDialog>
  );
}
