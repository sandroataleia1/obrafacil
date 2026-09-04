"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { MoneyField } from "@/components/shared/money-field";
import { ResponsiveDialog } from "@/components/shared/responsive-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { parseCurrencyInput } from "@/lib/currency";
import type { Project } from "@/features/projects/types";
import { allocatePeriodToProject, updatePeriodAllocation } from "../prototype/period-allocation";
import type { Employee, EmployeePeriodAllocation, EmployeeWorkPeriod } from "../types";

/**
 * Create/edit one EmployeePeriodAllocation. Deletion is intentionally
 * NOT here — the "Excluir" footer button closes this dialog first and
 * hands the allocation to the caller's own ConfirmActionDialog, so
 * the edit Dialog and the destructive AlertDialog are never both open
 * at once (Demo-Ready 009B §26: no stacked modals).
 */
export function AllocationDialog({
  workPeriod,
  employee,
  projects,
  editing,
  open,
  onOpenChange,
  onSaved,
  onRequestDelete,
}: {
  workPeriod: EmployeeWorkPeriod;
  employee: Employee;
  projects: Project[];
  editing: EmployeePeriodAllocation | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  onRequestDelete: (allocation: EmployeePeriodAllocation) => void;
}) {
  const [projectId, setProjectId] = useState("");
  const [amountInput, setAmountInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setProjectId(editing?.projectId ?? "");
    setAmountInput(editing ? String(editing.amount).replace(".", ",") : "");
    setError(null);
  }, [open, editing]);

  function handleSave() {
    const amount = parseCurrencyInput(amountInput);
    if (amount === null || amount <= 0) {
      setError("Informe um valor maior que zero.");
      return;
    }

    if (editing) {
      const result = updatePeriodAllocation(editing, workPeriod, employee, amount);
      if (!result.ok) {
        setError(result.error);
        return;
      }
    } else {
      if (projectId === "") {
        setError("Selecione uma obra.");
        return;
      }
      const result = allocatePeriodToProject(workPeriod, employee, projectId, amount);
      if (!result.ok) {
        setError(result.error);
        return;
      }
    }

    onOpenChange(false);
    onSaved();
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? "Editar alocação" : "Alocar em obra"}
      size="sm"
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          {editing ? (
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                onOpenChange(false);
                onRequestDelete(editing);
              }}
            >
              Excluir
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="button" onClick={handleSave}>
              Salvar
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="space-y-1.5">
          <span className="text-sm font-medium text-foreground">Obra</span>
          {editing ? (
            <div className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-base text-foreground">
              {projects.find((item) => item.id === editing.projectId)?.name ?? "Obra"}
            </div>
          ) : (
            <Select value={projectId} onValueChange={(value) => setProjectId(value ?? "")}>
              <SelectTrigger className="h-12 w-full px-4 text-base">
                <SelectValue placeholder="Selecione uma obra">
                  {(value: string | null) => projects.find((item) => item.id === value)?.name ?? "Selecione uma obra"}
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

        <MoneyField id="allocation-amount" label="Valor" value={amountInput} onChange={setAmountInput} />

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>
    </ResponsiveDialog>
  );
}
