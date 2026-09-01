"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Receipt, Users } from "lucide-react";

import { BackHeader } from "@/components/shared/back-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { MoneyField } from "@/components/shared/money-field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCurrency, parseCurrencyInput } from "@/lib/currency";
import { formatDate, todayIso } from "@/lib/date";
import { getPayableStatus } from "@/features/payables/payable-status";
import { PayableStatusBadge } from "@/features/payables/components/status-badge";
import type { Payable } from "@/features/payables/types";
import { listAllProjects } from "@/features/projects/prototype/project-store";
import type { Project } from "@/features/projects/types";
import { getEmployee } from "./prototype/employee-store";
import { calculatePeriodEstimate } from "./prototype/period-calculation";
import { formatPeriodLabel } from "./prototype/period-label";
import {
  allocatePeriodToProject,
  removePeriodAllocation,
  summarizeAllocations,
  updatePeriodAllocation,
} from "./prototype/period-allocation";
import { listAllocationsForPeriod } from "./prototype/period-allocation-store";
import { findPayableForPeriod, generatePayableForPeriod } from "./prototype/period-payable";
import { useWorkPeriod } from "./prototype/use-work-period";
import { WorkPeriodStatusBadge } from "./components/status-badge";
import { getWorkPeriodStatus, type EmployeePeriodAllocation } from "./types";

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
  const [relatedPayable, setRelatedPayable] = useState<Payable | null | undefined>(undefined);
  const [generatingPayable, setGeneratingPayable] = useState(false);
  const [payableDueDate, setPayableDueDate] = useState("");
  const [payableNotes, setPayableNotes] = useState("");
  const [payableError, setPayableError] = useState<string | null>(null);
  const [allocations, setAllocations] = useState<EmployeePeriodAllocation[] | undefined>(undefined);
  const [projects, setProjects] = useState<Project[]>([]);
  const [allocationFormOpen, setAllocationFormOpen] = useState(false);
  const [editingAllocationId, setEditingAllocationId] = useState<string | null>(null);
  const [allocationProjectId, setAllocationProjectId] = useState("");
  const [allocationAmountInput, setAllocationAmountInput] = useState("");
  const [allocationError, setAllocationError] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setProjects(listAllProjects());
  }, []);

  useEffect(() => {
    if (!workPeriod) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRelatedPayable(findPayableForPeriod(workPeriod));
    setAllocations(listAllocationsForPeriod(workPeriod.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workPeriod?.id]);

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
  const allocationSummary = summarizeAllocations(workPeriod);

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
    // Both checks must wait for a confirmed "nothing pending" result
    // (not `undefined`/loading) — reopening right after a fast click
    // must never slip through before the lookups resolve.
    if (!workPeriod || relatedPayable !== null) return;
    if (allocations === undefined || allocations.length > 0) return;
    persist({ ...workPeriod, closedAt: undefined });
  }

  function handleGeneratePayable() {
    if (!workPeriod || !employee) return;
    if (payableDueDate.trim() === "") {
      setPayableError("Informe o vencimento.");
      return;
    }
    setPayableError(null);
    const created = generatePayableForPeriod(
      workPeriod,
      employee,
      payableDueDate,
      payableNotes.trim() || undefined
    );
    setRelatedPayable(created);
    setGeneratingPayable(false);
  }

  function refreshAllocations() {
    if (!workPeriod) return;
    setAllocations(listAllocationsForPeriod(workPeriod.id));
  }

  function openCreateAllocation() {
    setEditingAllocationId(null);
    setAllocationProjectId("");
    setAllocationAmountInput("");
    setAllocationError(null);
    setAllocationFormOpen(true);
  }

  function openEditAllocation(allocation: EmployeePeriodAllocation) {
    setEditingAllocationId(allocation.id);
    setAllocationProjectId(allocation.projectId);
    setAllocationAmountInput(String(allocation.amount).replace(".", ","));
    setAllocationError(null);
    setAllocationFormOpen(true);
  }

  function handleCancelAllocationForm() {
    setAllocationFormOpen(false);
    setEditingAllocationId(null);
    setAllocationError(null);
  }

  function handleSaveAllocation() {
    if (!workPeriod || !employee) return;
    const amount = parseCurrencyInput(allocationAmountInput);
    if (amount === null || amount <= 0) {
      setAllocationError("Informe um valor maior que zero.");
      return;
    }

    if (editingAllocationId) {
      const existing = allocations?.find((allocation) => allocation.id === editingAllocationId);
      if (!existing) return;
      const result = updatePeriodAllocation(existing, workPeriod, employee, amount);
      if (!result.ok) {
        setAllocationError(result.error);
        return;
      }
    } else {
      if (allocationProjectId === "") {
        setAllocationError("Selecione uma obra.");
        return;
      }
      const result = allocatePeriodToProject(workPeriod, employee, allocationProjectId, amount);
      if (!result.ok) {
        setAllocationError(result.error);
        return;
      }
    }

    setAllocationError(null);
    setAllocationFormOpen(false);
    setEditingAllocationId(null);
    refreshAllocations();
  }

  function handleDeleteAllocation(allocation: EmployeePeriodAllocation) {
    const project = projects.find((item) => item.id === allocation.projectId);
    const confirmed = window.confirm(
      `Remover a alocação de ${formatCurrency(allocation.amount)} para ${project?.name ?? "esta obra"}? O custo correspondente será removido da obra.`
    );
    if (!confirmed) return;
    removePeriodAllocation(allocation);
    handleCancelAllocationForm();
    refreshAllocations();
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
        <section aria-labelledby="period-financeiro" className="space-y-2.5">
          <h2
            id="period-financeiro"
            className="text-xs font-semibold tracking-wide text-muted-foreground uppercase"
          >
            Financeiro
          </h2>
          {relatedPayable === undefined ? null : relatedPayable ? (
            <Link
              href={`/financeiro/contas-a-pagar/${relatedPayable.id}`}
              className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/30"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">
                  {formatCurrency(relatedPayable.amount)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {getPayableStatus(relatedPayable) === "paid" && relatedPayable.paidAt
                    ? `Paga em ${formatDate(relatedPayable.paidAt)}`
                    : `Vence ${formatDate(relatedPayable.dueDate)}`}
                </p>
              </div>
              <PayableStatusBadge status={getPayableStatus(relatedPayable)} />
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            </Link>
          ) : generatingPayable ? (
            <div className="space-y-3 rounded-xl border border-border bg-card p-4">
              <div className="space-y-1.5">
                <label htmlFor="payable-due-date" className="text-sm font-medium text-foreground">
                  Vencimento
                </label>
                <input
                  id="payable-due-date"
                  type="date"
                  value={payableDueDate}
                  onChange={(event) => setPayableDueDate(event.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="payable-notes" className="text-sm font-medium text-foreground">
                  Observação <span className="text-muted-foreground">(opcional)</span>
                </label>
                <input
                  id="payable-notes"
                  type="text"
                  value={payableNotes}
                  onChange={(event) => setPayableNotes(event.target.value)}
                  placeholder="Detalhes adicionais"
                  className="w-full rounded-xl border border-border bg-background px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
                />
              </div>
              {payableError ? <p className="text-sm text-destructive">{payableError}</p> : null}
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" variant="outline" onClick={() => setGeneratingPayable(false)}>
                  Cancelar
                </Button>
                <Button type="button" onClick={handleGeneratePayable}>
                  Gerar conta
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <EmptyState
                compact
                icon={Receipt}
                title="Nenhuma conta a pagar gerada"
                description="Transforme o valor previsto deste período em uma conta a pagar."
              />
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => {
                  setPayableDueDate("");
                  setPayableNotes("");
                  setPayableError(null);
                  setGeneratingPayable(true);
                }}
              >
                Gerar conta a pagar
              </Button>
            </div>
          )}
        </section>
      ) : null}

      {isClosed ? (
        <section aria-labelledby="period-allocations" className="space-y-2.5">
          <h2
            id="period-allocations"
            className="text-xs font-semibold tracking-wide text-muted-foreground uppercase"
          >
            Alocação em obras
          </h2>

          <div className="space-y-1 rounded-xl border border-border bg-card p-4">
            <InfoRow label="Valor previsto" value={formatCurrency(allocationSummary.expected)} />
            <InfoRow label="Alocado" value={formatCurrency(allocationSummary.allocated)} />
            <div className="mt-2 border-t border-border pt-2">
              <InfoRow
                label="Não alocado"
                value={formatCurrency(allocationSummary.remaining)}
                emphasis
              />
            </div>
          </div>

          {allocations === undefined ? null : allocations.length > 0 ? (
            <div className="divide-y divide-border rounded-xl border border-border bg-card">
              {allocations.map((allocation) => {
                const project = projects.find((item) => item.id === allocation.projectId);
                return (
                  <button
                    key={allocation.id}
                    type="button"
                    onClick={() => openEditAllocation(allocation)}
                    className="flex w-full items-center gap-3 p-3.5 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                      {project?.name ?? "Obra"}
                    </p>
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
                      {formatCurrency(allocation.amount)}
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  </button>
                );
              })}
            </div>
          ) : null}

          {allocationFormOpen ? (
            <div className="space-y-3 rounded-xl border border-border bg-card p-4">
              <div className="space-y-1.5">
                <span className="text-sm font-medium text-foreground">Obra</span>
                {editingAllocationId ? (
                  <div className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-base text-foreground">
                    {projects.find((item) => item.id === allocationProjectId)?.name ?? "Obra"}
                  </div>
                ) : (
                  <Select
                    value={allocationProjectId}
                    onValueChange={(value) => setAllocationProjectId(value ?? "")}
                  >
                    <SelectTrigger className="h-12 w-full px-4 text-base">
                      <SelectValue placeholder="Selecione uma obra">
                        {(value: string | null) =>
                          projects.find((item) => item.id === value)?.name ?? "Selecione uma obra"
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {projects.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              <MoneyField
                id="allocation-amount"
                label="Valor"
                value={allocationAmountInput}
                onChange={setAllocationAmountInput}
              />

              {allocationError ? <p className="text-sm text-destructive">{allocationError}</p> : null}

              <div className="grid grid-cols-2 gap-2">
                <Button type="button" variant="outline" onClick={handleCancelAllocationForm}>
                  Cancelar
                </Button>
                <Button type="button" onClick={handleSaveAllocation}>
                  Salvar alocação
                </Button>
              </div>

              {editingAllocationId ? (
                <Button
                  type="button"
                  variant="destructive"
                  className="w-full"
                  onClick={() => {
                    const current = allocations?.find((item) => item.id === editingAllocationId);
                    if (current) handleDeleteAllocation(current);
                  }}
                >
                  Excluir alocação
                </Button>
              ) : null}
            </div>
          ) : (
            <Button type="button" variant="outline" className="w-full" onClick={openCreateAllocation}>
              + Alocar em obra
            </Button>
          )}
        </section>
      ) : null}

      {isClosed ? (
        relatedPayable === undefined || allocations === undefined ? null : relatedPayable ||
          allocations.length > 0 ? (
          <div className="space-y-3">
            <div className="space-y-1 rounded-xl border border-border bg-card p-4">
              {relatedPayable && allocations.length > 0 ? (
                <>
                  <p className="text-sm text-muted-foreground">
                    Este período possui uma conta a pagar e custos alocados a Obras.
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Exclua a conta e remova as alocações antes de reabrir o período.
                  </p>
                </>
              ) : allocations.length > 0 ? (
                <>
                  <p className="text-sm text-muted-foreground">
                    Este período possui custos alocados a Obras.
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Remova as alocações antes de reabrir o período.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    {getPayableStatus(relatedPayable!) === "paid"
                      ? "Este período já possui uma conta paga."
                      : "Este período possui uma conta a pagar gerada."}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {getPayableStatus(relatedPayable!) === "paid"
                      ? "Desfaça o pagamento e exclua a conta antes de reabrir o período."
                      : "Exclua a conta antes de reabrir o período."}
                  </p>
                </>
              )}
            </div>
            {relatedPayable ? (
              <Button
                variant="outline"
                size="lg"
                className="w-full"
                nativeButton={false}
                render={<Link href={`/financeiro/contas-a-pagar/${relatedPayable.id}`}>Abrir conta</Link>}
              />
            ) : null}
          </div>
        ) : (
          <Button type="button" variant="outline" size="lg" className="w-full" onClick={handleReopen}>
            Reabrir período
          </Button>
        )
      ) : (
        <Button type="button" size="lg" className="w-full" onClick={handleClose}>
          Fechar período
        </Button>
      )}
    </div>
  );
}
