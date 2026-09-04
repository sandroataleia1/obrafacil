"use client";

import { ConfirmActionDialog } from "@/components/shared/confirm-action-dialog";
import { formatCurrency } from "@/lib/currency";
import type { PeriodEstimate } from "../prototype/period-calculation";
import type { EmployeeWorkPeriod } from "../types";

/**
 * Closing confirmation for a V2 period — three variants, chosen from
 * the already-computed `PeriodEstimate` (never recalculates
 * `workedUnits`/`estimatedPay` itself, per Demo-Ready 009B §29):
 * monthly (summary + valor previsto), daily with registros (diárias
 * equivalentes + valor previsto), and daily with zero registros (the
 * reinforced warning from Demo-Ready 008C §36 — unchanged here, only
 * moved from an inline panel into this dialog).
 */
export function PeriodCloseDialog({
  workPeriod,
  estimate,
  open,
  onOpenChange,
  onConfirm,
}: {
  workPeriod: EmployeeWorkPeriod;
  estimate: PeriodEstimate;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  const isDaily = workPeriod.paymentModelSnapshot === "daily";
  const summary = estimate.attendanceSummary;
  const isZeroDaily = isDaily && (summary?.workedUnits ?? 0) === 0;

  if (isZeroDaily) {
    return (
      <ConfirmActionDialog
        open={open}
        onOpenChange={onOpenChange}
        title="Fechar período sem diárias?"
        description="Este período não possui nenhuma diária registrada."
        confirmLabel="Fechar mesmo assim"
        destructive
        onConfirm={onConfirm}
      >
        <p className="text-sm font-medium text-foreground">
          Valor previsto: {formatCurrency(estimate.estimatedPay)}
        </p>
      </ConfirmActionDialog>
    );
  }

  if (isDaily) {
    const units = summary?.workedUnits ?? 0;
    return (
      <ConfirmActionDialog
        open={open}
        onOpenChange={onOpenChange}
        title="Fechar período?"
        description={`${units} diária${units === 1 ? "" : "s"} equivalente${units === 1 ? "" : "s"} e valor previsto de ${formatCurrency(estimate.estimatedPay)}.`}
        confirmLabel="Fechar período"
        onConfirm={onConfirm}
      />
    );
  }

  return (
    <ConfirmActionDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Fechar período?"
      description="A frequência ficará somente leitura após o fechamento."
      confirmLabel="Confirmar fechamento"
      onConfirm={onConfirm}
    >
      <div className="space-y-1 rounded-lg border border-border bg-muted/30 p-3 text-sm">
        <p className="text-foreground">
          {summary?.fullDays ?? 0} completos · {summary?.halfDays ?? 0} meios · {summary?.absences ?? 0} faltas
        </p>
        <p className="font-medium text-foreground">Valor previsto: {formatCurrency(estimate.estimatedPay)}</p>
      </div>
    </ConfirmActionDialog>
  );
}
