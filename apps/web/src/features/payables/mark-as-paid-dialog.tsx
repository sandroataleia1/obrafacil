"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { ResponsiveDialog } from "@/components/shared/responsive-dialog";
import { formatCurrency } from "@/lib/currency";
import { formatDate, todayIso } from "@/lib/date";
import { markPayableAsPaid } from "./prototype/payable-payment";
import type { Payable } from "./types";

/**
 * "Marcar como paga" — the only real input is the payment date; every
 * other value is shown read-only (Demo-Ready 009C §13). Calls the
 * same `markPayableAsPaid` used since before this round — status
 * derivation/formula untouched.
 */
export function MarkAsPaidDialog({
  payable,
  open,
  onOpenChange,
  onConfirmed,
}: {
  payable: Payable;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirmed: () => void;
}) {
  const [paymentDate, setPaymentDate] = useState(todayIso());

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPaymentDate(todayIso());
  }, [open]);

  function handleConfirm() {
    markPayableAsPaid(payable.id, paymentDate);
    onOpenChange(false);
    onConfirmed();
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Marcar como paga"
      description={payable.supplier ?? payable.description}
      size="sm"
      footer={
        <>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" onClick={handleConfirm}>
            Confirmar pagamento
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="space-y-1 rounded-lg border border-border bg-muted/30 p-3 text-sm">
          <p className="text-foreground">{payable.description}</p>
          {payable.supplier ? <p className="text-muted-foreground">{payable.supplier}</p> : null}
          <p className="font-medium text-foreground">{formatCurrency(payable.amount)}</p>
          <p className="text-muted-foreground">Vencimento: {formatDate(payable.dueDate)}</p>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="payment-date" className="text-sm font-medium text-foreground">
            Data do pagamento
          </label>
          <input
            id="payment-date"
            type="date"
            value={paymentDate}
            onChange={(event) => setPaymentDate(event.target.value)}
            className="w-full rounded-xl border border-border bg-background px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>
    </ResponsiveDialog>
  );
}
