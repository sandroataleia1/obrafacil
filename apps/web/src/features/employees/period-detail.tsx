"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Receipt, Users } from "lucide-react";

import { BackHeader } from "@/components/shared/back-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmActionDialog } from "@/components/shared/confirm-action-dialog";
import { formatCurrency } from "@/lib/currency";
import { formatDate, todayIso } from "@/lib/date";
import { getPayableStatus } from "@/features/payables/payable-status";
import { PayableStatusBadge } from "@/features/payables/components/status-badge";
import type { Payable } from "@/features/payables/types";
import { listAllProjects } from "@/features/projects/prototype/project-store";
import type { Project } from "@/features/projects/types";
import { AllocationDialog } from "./attendance/allocation-dialog";
import { AttendanceCalendar } from "./attendance/attendance-calendar";
import { AttendanceSummaryCard } from "./attendance/attendance-summary-card";
import { PeriodAdjustmentDialog } from "./attendance/period-adjustment-dialog";
import { PeriodCloseDialog } from "./attendance/period-close-dialog";
import { PeriodPayableDialog } from "./attendance/period-payable-dialog";
import { getEmployee } from "./prototype/employee-store";
import { calculatePeriodEstimate } from "./prototype/period-calculation";
import { formatPeriodLabel } from "./prototype/period-label";
import {
  canClosePeriod,
  countPendingFillable,
  fillUnrecordedAsFullDay,
  isLegacyWorkPeriod,
  setAttendanceEntry,
  clearAttendanceEntry,
  setMultipleAttendanceEntries,
} from "./prototype/attendance";
import { removePeriodAllocation, summarizeAllocations } from "./prototype/period-allocation";
import { listAllocationsForPeriod } from "./prototype/period-allocation-store";
import { findPayableForPeriod } from "./prototype/period-payable";
import { useWorkPeriod } from "./prototype/use-work-period";
import { WorkPeriodStatusBadge } from "./components/status-badge";
import {
  EMPLOYMENT_TYPE_LABEL,
  PAYMENT_MODEL_LABEL,
  getWorkPeriodStatus,
  type AttendanceStatus,
  type EmployeePeriodAllocation,
} from "./types";

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

/**
 * Where this screen was reached from — purely a navigation concern,
 * never a data concern. The frequência stays global to
 * Employee+Period regardless: `context` only changes where "Voltar"
 * points to (Demo-Ready 009D-C). A discriminated union instead of a
 * boolean like `isProjectContext` because a "project" context carries
 * a payload (`projectId`) a boolean can't.
 */
export type EmployeePeriodContext = { type: "employee" } | { type: "project"; projectId: string };

export function PeriodDetail({
  employeeId,
  period,
  context = { type: "employee" },
}: {
  employeeId: string;
  period: string;
  context?: EmployeePeriodContext;
}) {
  const router = useRouter();
  const { workPeriod, persist } = useWorkPeriod(employeeId, period);
  const employee = getEmployee(employeeId);
  const backHref = context.type === "project" ? `/obras/${context.projectId}/equipe` : `/equipe/${employeeId}`;

  const [expectedDaysInput, setExpectedDaysInput] = useState("");
  const [workedDaysInput, setWorkedDaysInput] = useState("");
  const [daysError, setDaysError] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [relatedPayable, setRelatedPayable] = useState<Payable | null | undefined>(undefined);
  const [allocations, setAllocations] = useState<EmployeePeriodAllocation[] | undefined>(undefined);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedDates, setSelectedDates] = useState<string[]>([]);

  // Dialog/AlertDialog state (Demo-Ready 009B) — one flag/object per
  // surface, not a mega discriminated union: each carries a different
  // payload shape (an allocation being edited/deleted, a pending bulk
  // overwrite list) and grouping them would not simplify anything.
  const [adjustmentDialogOpen, setAdjustmentDialogOpen] = useState(false);
  const [payableDialogOpen, setPayableDialogOpen] = useState(false);
  const [allocationDialogOpen, setAllocationDialogOpen] = useState(false);
  const [editingAllocation, setEditingAllocation] = useState<EmployeePeriodAllocation | null>(null);
  const [deletingAllocation, setDeletingAllocation] = useState<EmployeePeriodAllocation | null>(null);
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const [bulkFillConfirmOpen, setBulkFillConfirmOpen] = useState(false);
  const [reopenConfirmOpen, setReopenConfirmOpen] = useState(false);
  const [bulkOverwriteConfirm, setBulkOverwriteConfirm] = useState<{
    dates: string[];
    status: AttendanceStatus;
  } | null>(null);
  const [legacyCloseConfirmOpen, setLegacyCloseConfirmOpen] = useState(false);

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
    // this same screen never re-fires this and stomps on in-progress
    // local edits.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setExpectedDaysInput(String(workPeriod.expectedDays ?? 0));
    setWorkedDaysInput(String(workPeriod.workedDays ?? 0));
    setNotes(workPeriod.notes ?? "");
    setSelectMode(false);
    setSelectedDates([]);
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
  const legacy = isLegacyWorkPeriod(workPeriod);
  const isDaily = !legacy && workPeriod.paymentModelSnapshot === "daily";
  const isMonthly = !legacy && workPeriod.paymentModelSnapshot === "monthly";
  const estimate = calculatePeriodEstimate(workPeriod);
  const closeGate = canClosePeriod(workPeriod);
  const allocationSummary = summarizeAllocations(workPeriod);
  const pendingFillable = isMonthly ? countPendingFillable(workPeriod) : 0;

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

  function handleSetAttendance(date: string, attendanceStatus: AttendanceStatus) {
    if (!workPeriod || isClosed) return;
    persist(setAttendanceEntry(workPeriod, date, attendanceStatus));
  }

  function handleClearAttendance(date: string) {
    if (!workPeriod || isClosed) return;
    persist(clearAttendanceEntry(workPeriod, date));
  }

  function handleConfirmBulkFill() {
    if (!workPeriod) return;
    persist(fillUnrecordedAsFullDay(workPeriod));
    setBulkFillConfirmOpen(false);
  }

  function toggleSelectedDate(date: string) {
    setSelectedDates((current) =>
      current.includes(date) ? current.filter((item) => item !== date) : [...current, date]
    );
  }

  function requestBulkSetSelected(bulkStatus: AttendanceStatus) {
    if (!workPeriod || isClosed || selectedDates.length === 0) return;
    const alreadyRecorded = selectedDates.filter((date) =>
      workPeriod.attendanceEntries?.some((entry) => entry.date === date)
    );
    if (alreadyRecorded.length > 0) {
      setBulkOverwriteConfirm({ dates: selectedDates, status: bulkStatus });
      return;
    }
    persist(setMultipleAttendanceEntries(workPeriod, selectedDates, bulkStatus));
    setSelectedDates([]);
    setSelectMode(false);
  }

  function handleConfirmBulkOverwrite() {
    if (!workPeriod || !bulkOverwriteConfirm) return;
    persist(setMultipleAttendanceEntries(workPeriod, bulkOverwriteConfirm.dates, bulkOverwriteConfirm.status));
    setBulkOverwriteConfirm(null);
    setSelectedDates([]);
    setSelectMode(false);
  }

  function handleSaveAdjustment(value: number) {
    if (!workPeriod) return;
    persist({ ...workPeriod, manualAdjustment: value });
  }

  function handleNotesChange(raw: string) {
    setNotes(raw);
    if (!workPeriod) return;
    persist({ ...workPeriod, notes: raw.trim() || undefined });
  }

  function handleConfirmClose() {
    if (!workPeriod) return;
    if (!canClosePeriod(workPeriod).canClose) return;
    persist({ ...workPeriod, closedAt: todayIso() });
    setCloseDialogOpen(false);
  }

  function handleConfirmLegacyClose() {
    if (!workPeriod) return;
    persist({ ...workPeriod, closedAt: todayIso() });
    setLegacyCloseConfirmOpen(false);
  }

  function handleConfirmReopen() {
    if (!workPeriod || relatedPayable !== null) return;
    if (allocations === undefined || allocations.length > 0) return;
    persist({ ...workPeriod, closedAt: undefined });
    setReopenConfirmOpen(false);
  }

  function refreshAllocations() {
    if (!workPeriod) return;
    setAllocations(listAllocationsForPeriod(workPeriod.id));
  }

  function handleConfirmDeleteAllocation() {
    if (!deletingAllocation) return;
    removePeriodAllocation(deletingAllocation);
    setDeletingAllocation(null);
    refreshAllocations();
  }

  const deletingAllocationProject = deletingAllocation
    ? projects.find((item) => item.id === deletingAllocation.projectId)
    : undefined;

  return (
    <div className="space-y-6 pb-6">
      <div className="space-y-1">
        <BackHeader
          title={formatPeriodLabel(period)}
          onBack={() => router.push(backHref)}
        />
        <div className="flex flex-wrap items-center gap-2 pl-11">
          <p className="text-sm text-muted-foreground">
            {employee ? `${employee.name} · ${employee.role}` : "Funcionário"}
          </p>
          {!legacy ? (
            <span className="text-xs text-muted-foreground">
              {EMPLOYMENT_TYPE_LABEL[workPeriod.employmentTypeSnapshot!]} ·{" "}
              {PAYMENT_MODEL_LABEL[workPeriod.paymentModelSnapshot!]}
            </span>
          ) : null}
          <WorkPeriodStatusBadge status={status} />
        </div>
      </div>

      {isClosed ? (
        legacy ? (
          <div className="rounded-xl border border-border bg-card p-4">
            <InfoRow label="Dias previstos" value={String(workPeriod.expectedDays ?? 0)} />
            <InfoRow label="Dias trabalhados" value={String(workPeriod.workedDays ?? 0)} />
            <InfoRow label="Faltas" value={String(estimate.legacy?.absences ?? 0)} />
            {workPeriod.notes ? <InfoRow label="Observação" value={workPeriod.notes} /> : null}
          </div>
        ) : (
          <AttendanceCalendar workPeriod={workPeriod} editable={false} />
        )
      ) : (
        <div className="space-y-4">
          {legacy ? (
            <>
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
                Faltas: <span className="font-medium text-foreground">{estimate.legacy?.absences ?? 0}</span>
              </p>
            </>
          ) : (
            <>
              {isMonthly ? (
                <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-3">
                  <p className="text-sm text-muted-foreground">
                    {pendingFillable > 0
                      ? `${pendingFillable} dia${pendingFillable === 1 ? "" : "s"} pendente${pendingFillable === 1 ? "" : "s"}`
                      : "Nenhum dia pendente"}
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={pendingFillable === 0}
                    onClick={() => setBulkFillConfirmOpen(true)}
                  >
                    Preencher pendentes como completos
                  </Button>
                </div>
              ) : null}

              {isDaily ? (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card p-3">
                  <p className="text-sm text-muted-foreground">
                    {selectMode
                      ? `${selectedDates.length} dia${selectedDates.length === 1 ? "" : "s"} selecionado${selectedDates.length === 1 ? "" : "s"}`
                      : "Selecione datas para lançar em lote"}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {selectMode ? (
                      <>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={selectedDates.length === 0}
                          onClick={() => requestBulkSetSelected("full_day")}
                        >
                          Marcar completos
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={selectedDates.length === 0}
                          onClick={() => requestBulkSetSelected("half_day")}
                        >
                          Meio período
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setSelectMode(false);
                            setSelectedDates([]);
                          }}
                        >
                          Cancelar
                        </Button>
                      </>
                    ) : (
                      <Button type="button" size="sm" variant="outline" onClick={() => setSelectMode(true)}>
                        Selecionar dias
                      </Button>
                    )}
                  </div>
                </div>
              ) : null}

              <AttendanceCalendar
                workPeriod={workPeriod}
                editable={!selectMode}
                selectable={selectMode}
                selectedDates={selectedDates}
                onToggleSelect={toggleSelectedDate}
                onSetStatus={handleSetAttendance}
                onClear={handleClearAttendance}
              />
            </>
          )}

          <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-3">
            <p className="text-sm text-muted-foreground">
              Ajuste manual: <span className="font-medium text-foreground">{formatCurrency(workPeriod.manualAdjustment)}</span>
            </p>
            <Button type="button" size="sm" variant="outline" onClick={() => setAdjustmentDialogOpen(true)}>
              Editar ajuste
            </Button>
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

      <AttendanceSummaryCard workPeriod={workPeriod} estimate={estimate} />

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
          ) : estimate.estimatedPay <= 0 ? (
            <EmptyState
              compact
              icon={Receipt}
              title="Este período não possui valor a pagar."
              description="Nenhuma conta a pagar será gerada automaticamente."
            />
          ) : (
            <div className="space-y-3">
              <EmptyState
                compact
                icon={Receipt}
                title="Nenhuma conta a pagar gerada"
                description="Transforme o valor previsto deste período em uma conta a pagar."
              />
              <Button type="button" variant="outline" className="w-full" onClick={() => setPayableDialogOpen(true)}>
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
                    onClick={() => {
                      setEditingAllocation(allocation);
                      setAllocationDialogOpen(true);
                    }}
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

          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => {
              setEditingAllocation(null);
              setAllocationDialogOpen(true);
            }}
          >
            + Alocar em obra
          </Button>
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
          <Button type="button" variant="outline" size="lg" className="w-full" onClick={() => setReopenConfirmOpen(true)}>
            Reabrir período
          </Button>
        )
      ) : legacy ? (
        <Button type="button" size="lg" className="w-full" onClick={() => setLegacyCloseConfirmOpen(true)}>
          Fechar período
        </Button>
      ) : !closeGate.canClose ? (
        <div className="space-y-2">
          <p className="text-sm text-destructive">
            Existem {closeGate.pendingCount} dia{closeGate.pendingCount === 1 ? "" : "s"} sem apontamento.
          </p>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => document.getElementById("attendance-calendar")?.scrollIntoView({ behavior: "smooth" })}
          >
            Resolver pendências
          </Button>
          <Button type="button" size="lg" className="w-full" disabled>
            Fechar período
          </Button>
        </div>
      ) : (
        <Button type="button" size="lg" className="w-full" onClick={() => setCloseDialogOpen(true)}>
          Fechar período
        </Button>
      )}

      {/* Attendance-only (V2) dialogs — their triggers only exist in the
          non-legacy branch above, so gating them here is safe and keeps
          the legacy close confirmation (below) clearly separate. */}
      {!legacy ? (
        <>
          <PeriodCloseDialog
            workPeriod={workPeriod}
            estimate={estimate}
            open={closeDialogOpen}
            onOpenChange={setCloseDialogOpen}
            onConfirm={handleConfirmClose}
          />

          <ConfirmActionDialog
            open={bulkFillConfirmOpen}
            onOpenChange={setBulkFillConfirmOpen}
            title="Preencher dias pendentes?"
            description={`Marcar ${pendingFillable} dia${pendingFillable === 1 ? "" : "s"} pendente${pendingFillable === 1 ? "" : "s"} como completos?`}
            confirmLabel="Preencher"
            onConfirm={handleConfirmBulkFill}
          >
            <p className="text-sm text-muted-foreground">
              Faltas e meios períodos já registrados serão preservados.
            </p>
          </ConfirmActionDialog>

          <ConfirmActionDialog
            open={bulkOverwriteConfirm !== null}
            onOpenChange={(open) => {
              if (!open) setBulkOverwriteConfirm(null);
            }}
            title="Sobrescrever lançamentos?"
            description={
              bulkOverwriteConfirm
                ? `${bulkOverwriteConfirm.dates.length} dia${bulkOverwriteConfirm.dates.length === 1 ? "" : "s"} selecionado${bulkOverwriteConfirm.dates.length === 1 ? "" : "s"} já possui${bulkOverwriteConfirm.dates.length === 1 ? "" : "m"} lançamento.`
                : undefined
            }
            confirmLabel="Sobrescrever"
            destructive
            onConfirm={handleConfirmBulkOverwrite}
          />
        </>
      ) : (
        <ConfirmActionDialog
          open={legacyCloseConfirmOpen}
          onOpenChange={setLegacyCloseConfirmOpen}
          title="Fechar período?"
          description="Após o fechamento, os dados do período ficarão somente para leitura."
          confirmLabel="Fechar período"
          onConfirm={handleConfirmLegacyClose}
        >
          <div className="space-y-1 rounded-lg border border-border bg-muted/30 p-3 text-sm">
            <p className="text-foreground">
              Dias trabalhados: {workPeriod.workedDays ?? 0} · Faltas: {estimate.legacy?.absences ?? 0}
            </p>
            <p className="font-medium text-foreground">Valor previsto: {formatCurrency(estimate.estimatedPay)}</p>
          </div>
        </ConfirmActionDialog>
      )}

      {/* Adjustment/Payable/Allocation/Reopen — reachable for legacy periods
          too (their trigger buttons are not gated by `legacy`), so these
          stay unconditional. None of them read attendance-specific data. */}
      <PeriodAdjustmentDialog
        manualAdjustment={workPeriod.manualAdjustment}
        open={adjustmentDialogOpen}
        onOpenChange={setAdjustmentDialogOpen}
        onSave={handleSaveAdjustment}
      />

      {employee ? (
            <PeriodPayableDialog
              workPeriod={workPeriod}
              employee={employee}
              estimatedPay={estimate.estimatedPay}
              open={payableDialogOpen}
              onOpenChange={setPayableDialogOpen}
              onGenerated={(payable) => {
                setRelatedPayable(payable);
                setPayableDialogOpen(false);
              }}
            />
          ) : null}

          {employee ? (
            <AllocationDialog
              workPeriod={workPeriod}
              employee={employee}
              projects={projects}
              editing={editingAllocation}
              open={allocationDialogOpen}
              onOpenChange={setAllocationDialogOpen}
              onSaved={refreshAllocations}
              onRequestDelete={setDeletingAllocation}
            />
          ) : null}

          <ConfirmActionDialog
            open={deletingAllocation !== null}
            onOpenChange={(open) => {
              if (!open) setDeletingAllocation(null);
            }}
            title="Remover alocação?"
            description={
              deletingAllocation
                ? `Remover a alocação de ${formatCurrency(deletingAllocation.amount)} para ${deletingAllocationProject?.name ?? "esta obra"}? O custo correspondente será removido da obra.`
                : undefined
            }
            confirmLabel="Remover"
            destructive
            onConfirm={handleConfirmDeleteAllocation}
          />

          <ConfirmActionDialog
            open={reopenConfirmOpen}
            onOpenChange={setReopenConfirmOpen}
            title="Reabrir período?"
            description="Você poderá editar novamente a frequência deste período."
            confirmLabel="Reabrir"
            onConfirm={handleConfirmReopen}
          />
    </div>
  );
}
