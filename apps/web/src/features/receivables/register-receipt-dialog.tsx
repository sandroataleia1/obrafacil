"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { MoneyField } from "@/components/shared/money-field";
import { ResponsiveDialog } from "@/components/shared/responsive-dialog";
import { formatCurrency, parseCurrencyInput } from "@/lib/currency";
import { todayIso } from "@/lib/date";
import { registerReceipt } from "./prototype/receivable";
import type { Receivable } from "./types";

/**
 * "Registrar recebimento" — descrição/total/já recebido/saldo shown
 * read-only; valor/data/observação editable (Demo-Ready 009C §18).
 * Calls the same `registerReceipt` used before this round — partial
 * receipts, dates and status derivation are untouched.
 */
export function RegisterReceiptDialog({
  receivable,
  outstandingAmount,
  receivedAmount,
  open,
  onOpenChange,
  onRegistered,
}: {
  receivable: Receivable;
  outstandingAmount: number;
  receivedAmount: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRegistered: () => void;
}) {
  const [amountInput, setAmountInput] = useState("");
  const [receivedAt, setReceivedAt] = useState(todayIso());
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAmountInput(String(outstandingAmount).replace(".", ","));
    setReceivedAt(todayIso());
    setNotes("");
    setError(null);
  }, [open, outstandingAmount]);

  function handleConfirm() {
    const amount = parseCurrencyInput(amountInput);
    if (amount === null || amount <= 0) {
      setError("Informe um valor maior que zero.");
      return;
    }
    const result = registerReceipt(receivable, amount, receivedAt, notes);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onOpenChange(false);
    onRegistered();
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Registrar recebimento"
      description={receivable.description}
      size="sm"
      footer={
        <>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" onClick={handleConfirm}>
            Confirmar
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="space-y-1 rounded-lg border border-border bg-muted/30 p-3 text-sm">
          <p className="text-foreground">Total: {formatCurrency(receivable.amount)}</p>
          <p className="text-muted-foreground">Recebido: {formatCurrency(receivedAmount)}</p>
          <p className="font-medium text-foreground">Saldo: {formatCurrency(outstandingAmount)}</p>
        </div>

        <MoneyField id="receipt-amount" label="Valor recebido" value={amountInput} onChange={setAmountInput} />

        <div className="space-y-1.5">
          <label htmlFor="receipt-date" className="text-sm font-medium text-foreground">
            Data do recebimento
          </label>
          <input
            id="receipt-date"
            type="date"
            value={receivedAt}
            onChange={(event) => setReceivedAt(event.target.value)}
            className="w-full rounded-xl border border-border bg-background px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="receipt-notes" className="text-sm font-medium text-foreground">
            Observação <span className="text-muted-foreground">(opcional)</span>
          </label>
          <input
            id="receipt-notes"
            type="text"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            className="w-full rounded-xl border border-border bg-background px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
          />
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>
    </ResponsiveDialog>
  );
}
