import { formatCurrency } from "@/lib/currency";
import { isLegacyWorkPeriod } from "../prototype/attendance";
import type { PeriodEstimate } from "../prototype/period-calculation";
import { getWorkPeriodStatus, type EmployeeWorkPeriod } from "../types";

function InfoRow({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
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

/**
 * "Resumo do mês" — three variants (legacy / monthly V2 / daily V2),
 * always fed by the already-computed `PeriodEstimate` (never
 * recalculates `workedUnits`/`unrecordedDays`/`estimatedPay` itself,
 * per Demo-Ready 008C §55).
 */
export function AttendanceSummaryCard({
  workPeriod,
  estimate,
}: {
  workPeriod: EmployeeWorkPeriod;
  estimate: PeriodEstimate;
}) {
  const legacy = isLegacyWorkPeriod(workPeriod);
  const isClosed = getWorkPeriodStatus(workPeriod) === "closed";
  const valueLabel = isClosed ? "Valor do período" : "Valor estimado a pagar";

  return (
    <div className="space-y-1 rounded-xl border border-border bg-card p-4">
      <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Resumo do mês</p>
      {legacy ? (
        <>
          <InfoRow label="Valor-base" value={formatCurrency(workPeriod.baseSalarySnapshot)} />
          <InfoRow label="Dias previstos" value={String(workPeriod.expectedDays ?? 0)} />
          <InfoRow label="Dias trabalhados" value={String(workPeriod.workedDays ?? 0)} />
          <InfoRow label="Faltas" value={String(estimate.legacy?.absences ?? 0)} />
          <InfoRow label="Desconto estimado" value={formatCurrency(estimate.legacy?.absenceDiscount ?? 0)} />
        </>
      ) : workPeriod.paymentModelSnapshot === "daily" ? (
        <>
          <InfoRow label="Completos" value={String(estimate.attendanceSummary?.fullDays ?? 0)} />
          <InfoRow label="Meios períodos" value={String(estimate.attendanceSummary?.halfDays ?? 0)} />
          <InfoRow label="Faltas registradas" value={String(estimate.attendanceSummary?.absences ?? 0)} />
          <InfoRow label="Diárias equivalentes" value={String(estimate.attendanceSummary?.workedUnits ?? 0)} />
          <InfoRow label="Valor da diária" value={formatCurrency(workPeriod.dailyRateSnapshot ?? 0)} />
          <div className="mt-1 border-t border-border pt-1">
            <InfoRow label="Base" value={formatCurrency(estimate.baseAmount)} />
          </div>
        </>
      ) : (
        <>
          <InfoRow label="Dias previstos" value={String(estimate.attendanceSummary?.scheduledWorkDays ?? 0)} />
          <InfoRow label="Completos" value={String(estimate.attendanceSummary?.fullDays ?? 0)} />
          <InfoRow label="Meios períodos" value={String(estimate.attendanceSummary?.halfDays ?? 0)} />
          <InfoRow label="Faltas" value={String(estimate.attendanceSummary?.absences ?? 0)} />
          <InfoRow label="Pendentes" value={String(estimate.attendanceSummary?.unrecordedDays ?? 0)} />
          <div className="mt-1 border-t border-border pt-1">
            <InfoRow label="Salário de referência" value={formatCurrency(estimate.baseAmount)} />
            <InfoRow
              label="Desconto por frequência"
              value={`- ${formatCurrency(estimate.monthlyDiscount?.attendanceDiscount ?? 0)}`}
            />
          </div>
        </>
      )}
      <InfoRow label="Ajuste manual" value={formatCurrency(workPeriod.manualAdjustment)} />
      <div className="mt-2 border-t border-border pt-2">
        <InfoRow label={valueLabel} value={formatCurrency(estimate.estimatedPay)} emphasis />
      </div>
      <p className="pt-2 text-sm text-muted-foreground">
        {legacy
          ? "Estimativa operacional. Não substitui cálculo de folha de pagamento."
          : workPeriod.paymentModelSnapshot === "monthly"
            ? "Faltas e meios períodos já registrados descontam automaticamente o valor previsto. Dias pendentes nunca são descontados. Use o Ajuste manual para qualquer outra correção."
            : "Faltas e meios períodos não alteram automaticamente o valor previsto. Use o Ajuste manual quando necessário."}
      </p>
    </div>
  );
}
