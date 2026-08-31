"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Users } from "lucide-react";

import { BackHeader } from "@/components/shared/back-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { MoneyField } from "@/components/shared/money-field";
import { formatCurrency, parseCurrencyInput } from "@/lib/currency";
import { todayIso } from "@/lib/date";
import { getEmployee } from "./prototype/employee-store";
import { calculatePeriodEstimate } from "./prototype/period-calculation";
import { formatPeriodLabel } from "./prototype/period-label";
import { useWorkPeriod } from "./prototype/use-work-period";
import { WorkPeriodStatusBadge } from "./components/status-badge";
import { getWorkPeriodStatus } from "./types";

type AdjustmentType = "none" | "discount" | "increase";

function InfoRow({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
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

export function PeriodDetail({ employeeId, period }: { employeeId: string; period: string }) {
  const router = useRouter();
  const { workPeriod, persist } = useWorkPeriod(employeeId, period);
  const employee = getEmployee(employeeId);

  const [expectedDaysInput, setExpectedDaysInput] = useState("");
  const [workedDaysInput, setWorkedDaysInput] = useState("");
  const [adjustmentType, setAdjustmentType] = useState<AdjustmentType>("none");
  const [adjustmentAmountInput, setAdjustmentAmountInput] = useState("");
  const [notes, setNotes] = useState("");
  const [daysError, setDaysError] = useState<string | null>(null);

  useEffect(() => {
    if (!workPeriod) return;
    // Seed the form once the period loads from localStorage. Depends on
    // `workPeriod.id` (not the whole object) so a `persist()` call from
    // this same screen — which updates `workPeriod` but keeps the same
    // id — never re-fires this and stomps on in-progress local edits
    // (e.g. selecting "Acréscimo" before typing its amount, which
    // persists a temporary `manualAdjustment: 0`).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setExpectedDaysInput(String(workPeriod.expectedDays));
    setWorkedDaysInput(String(workPeriod.workedDays));
    setNotes(workPeriod.notes ?? "");
    if (workPeriod.manualAdjustment > 0) {
      setAdjustmentType("increase");
      setAdjustmentAmountInput(String(workPeriod.manualAdjustment).replace(".", ","));
    } else if (workPeriod.manualAdjustment < 0) {
      setAdjustmentType("discount");
      setAdjustmentAmountInput(String(-workPeriod.manualAdjustment).replace(".", ","));
    } else {
      setAdjustmentType("none");
      setAdjustmentAmountInput("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workPeriod?.id]);

  if (workPeriod === undefined) return null;

  if (workPeriod === null) {
    return (
      <EmptyState
        icon={Users}
        title="Período não encontrado"
        description="Ele pode ter sido removido ou o link está incorreto."
      />
    );
  }

  const status = getWorkPeriodStatus(workPeriod);
  const isClosed = status === "closed";
  const estimate = calculatePeriodEstimate(workPeriod);

  function handleExpectedDaysChange(raw: string) {
    setExpectedDaysInput(raw);
    const value = raw === "" ? 0 : Number(raw);
    if (!workPeriod || !Number.isFinite(value) || value < 0) return;
    const worked = Number(workedDaysInput) || 0;
    if (worked > value) {
      setDaysError("Dias trabalhados não pode ser maior que dias previstos.");
      return;
    }
    setDaysError(null);
    persist({ ...workPeriod, expectedDays: value });
  }

  function handleWorkedDaysChange(raw: string) {
    setWorkedDaysInput(raw);
    const value = raw === "" ? 0 : Number(raw);
    if (!workPeriod || !Number.isFinite(value) || value < 0) return;
    const expected = Number(expectedDaysInput) || 0;
    if (value > expected) {
      setDaysError("Dias trabalhados não pode ser maior que dias previstos.");
      return;
    }
    setDaysError(null);
    persist({ ...workPeriod, workedDays: value });
  }

  function commitAdjustment(type: AdjustmentType, amountInput: string) {
    if (!workPeriod) return;
    const magnitude = parseCurrencyInput(amountInput) ?? 0;
    const manualAdjustment =
      type === "discount" ? -Math.abs(magnitude) : type === "increase" ? Math.abs(magnitude) : 0;
    persist({ ...workPeriod, manualAdjustment });
  }

  function handleNotesChange(raw: string) {
    setNotes(raw);
    if (!workPeriod) return;
    persist({ ...workPeriod, notes: raw.trim() || undefined });
  }

  function handleClose() {
    if (!workPeriod) return;
    persist({ ...workPeriod, closedAt: todayIso() });
  }

  function handleReopen() {
    if (!workPeriod) return;
    persist({ ...workPeriod, closedAt: undefined });
  }

  return (
    <div className="space-y-6 pb-6">
      <div className="space-y-1">
        <BackHeader
          title={formatPeriodLabel(period)}
          onBack={() => router.push(`/equipe/${employeeId}`)}
        />
        <div className="flex items-center gap-2 pl-11">
          <p className="text-sm text-muted-foreground">
            {employee ? `${employee.name} · ${employee.role}` : "Funcionário"}
          </p>
          <WorkPeriodStatusBadge status={status} />
        </div>
      </div>

      {isClosed ? (
        <div className="rounded-xl border border-border bg-card p-4">
          <InfoRow label="Dias previstos" value={String(workPeriod.expectedDays)} />
          <InfoRow label="Dias trabalhados" value={String(workPeriod.workedDays)} />
          <InfoRow label="Faltas" value={String(estimate.absences)} />
          {workPeriod.notes ? <InfoRow label="Observação" value={workPeriod.notes} /> : null}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="expected-days" className="text-sm font-medium text-foreground">
                Dias previstos
              </label>
              <input
                id="expected-days"
                type="number"
                inputMode="numeric"
                min={0}
                value={expectedDaysInput}
                onChange={(event) => handleExpectedDaysChange(event.target.value)}
                className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="worked-days" className="text-sm font-medium text-foreground">
                Dias trabalhados
              </label>
              <input
                id="worked-days"
                type="number"
                inputMode="numeric"
                min={0}
                value={workedDaysInput}
                onChange={(event) => handleWorkedDaysChange(event.target.value)}
                className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          {daysError ? <p className="text-sm text-destructive">{daysError}</p> : null}

          <p className="text-sm text-muted-foreground">
            Faltas: <span className="font-medium text-foreground">{estimate.absences}</span>
          </p>

          <div className="space-y-1.5">
            <span className="text-sm font-medium text-foreground">
              Ajuste manual <span className="text-muted-foreground">(opcional)</span>
            </span>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { value: "none", label: "Nenhum" },
                  { value: "discount", label: "Desconto" },
                  { value: "increase", label: "Acréscimo" },
                ] as const
              ).map((option) => {
                const selected = adjustmentType === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => {
                      setAdjustmentType(option.value);
                      commitAdjustment(option.value, adjustmentAmountInput);
                    }}
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
              <MoneyField
                id="adjustment-amount"
                label="Valor do ajuste"
                value={adjustmentAmountInput}
                onChange={(raw) => {
                  setAdjustmentAmountInput(raw);
                  commitAdjustment(adjustmentType, raw);
                }}
                className="mt-2"
              />
            ) : null}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="period-notes" className="text-sm font-medium text-foreground">
              Observação <span className="text-muted-foreground">(opcional)</span>
            </label>
            <input
              id="period-notes"
              type="text"
              value={notes}
              onChange={(event) => handleNotesChange(event.target.value)}
              placeholder="Detalhes adicionais"
              className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>
      )}

      <div className="space-y-1 rounded-xl border border-border bg-card p-4">
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Resumo do mês
        </p>
        <InfoRow label="Valor-base" value={formatCurrency(workPeriod.baseSalarySnapshot)} />
        <InfoRow label="Dias previstos" value={String(workPeriod.expectedDays)} />
        <InfoRow label="Dias trabalhados" value={String(workPeriod.workedDays)} />
        <InfoRow label="Faltas" value={String(estimate.absences)} />
        <InfoRow label="Desconto estimado" value={formatCurrency(estimate.absenceDiscount)} />
        <InfoRow label="Ajuste" value={formatCurrency(workPeriod.manualAdjustment)} />
        <div className="mt-2 border-t border-border pt-2">
          <InfoRow label="Valor previsto" value={formatCurrency(estimate.estimatedPay)} emphasis />
        </div>
        <p className="pt-2 text-sm text-muted-foreground">
          Estimativa operacional. Não substitui cálculo de folha de pagamento.
        </p>
      </div>

      {isClosed ? (
        <Button type="button" variant="outline" size="lg" className="w-full" onClick={handleReopen}>
          Reabrir período
        </Button>
      ) : (
        <Button type="button" size="lg" className="w-full" onClick={handleClose}>
          Fechar período
        </Button>
      )}
    </div>
  );
}
