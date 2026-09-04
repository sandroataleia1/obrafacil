"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { ResponsiveDialog } from "@/components/shared/responsive-dialog";
import { formatCurrency } from "@/lib/currency";
import { generatePayableForPeriod } from "../prototype/period-payable";
import { formatPeriodShort } from "../prototype/period-label";
import type { Payable } from "@/features/payables/types";
import type { Employee, EmployeeWorkPeriod } from "../types";

/**
 * "Gerar conta a pagar" — colaborador/período/valor/origem are shown
 * read-only (already known), the only input requested is `dueDate`
 * (Demo-Ready 009B §23). Calls the same `generatePayableForPeriod`
 * used since 008B — idempotent, category/amount untouched.
 */
export function PeriodPayableDialog({
  workPeriod,
  employee,
  estimatedPay,
  open,
  onOpenChange,
  onGenerated,
}: {
  workPeriod: EmployeeWorkPeriod;
  employee: Employee;
  estimatedPay: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGenerated: (payable: Payable) => void;
}) {
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDueDate("");
    setNotes("");
    setError(null);
  }, [open]);

  function handleGenerate() {
    if (dueDate.trim() === "") {
      setError("Informe o vencimento.");
      return;
    }
    const payable = generatePayableForPeriod(workPeriod, employee, dueDate, notes.trim() || undefined);
    onOpenChange(false);
    onGenerated(payable);
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Gerar conta a pagar"
      description={`${employee.name} · ${formatPeriodShort(workPeriod.period)}`}
      size="sm"
      footer={
        <>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" onClick={handleGenerate}>
            Gerar conta
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="space-y-1 rounded-lg border border-border bg-muted/30 p-3 text-sm">
          <p className="text-foreground">Valor previsto: {formatCurrency(estimatedPay)}</p>
          <p className="text-muted-foreground">Categoria: Mão de obra</p>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="payable-due-date" className="text-sm font-medium text-foreground">
            Vencimento
          </label>
          <input
            id="payable-due-date"
            type="date"
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
            className="w-full rounded-xl border border-border bg-background px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
          />
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <div className="space-y-1.5">
          <label htmlFor="payable-notes" className="text-sm font-medium text-foreground">
            Observação <span className="text-muted-foreground">(opcional)</span>
          </label>
          <input
            id="payable-notes"
            type="text"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Detalhes adicionais"
            className="w-full rounded-xl border border-border bg-background px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>
    </ResponsiveDialog>
  );
}
