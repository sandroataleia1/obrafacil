"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { ResponsiveDialog } from "@/components/shared/responsive-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { todayIso } from "@/lib/date";
import type { Employee } from "@/features/employees/types";
import { createProjectTeamAssignment, updateAssignmentInterval } from "./project-team";
import type { ProjectTeamAssignment } from "./types";

/**
 * Alocar/Editar colaborador. Only asks for Colaborador + intervalo —
 * no salário/diária/cargo/valor (Demo-Ready 009D-A §20). Employee
 * selection uses `Select`: no Combobox primitive exists yet in
 * `components/ui/`, and building one is disproportionate for this
 * round — reported explicitly in the checkpoint (009D-B §32).
 *
 * On edit, only startDate/endDate change — employeeId/projectId stay
 * fixed (009D-B §34): correcting a wrong person is a future concern,
 * not part of this V1.
 */
export function ProjectTeamAssignmentDialog({
  projectId,
  employees,
  existingAssignments,
  editing,
  open,
  onOpenChange,
  onSaved,
}: {
  projectId: string;
  employees: Employee[];
  existingAssignments: ProjectTeamAssignment[];
  editing: ProjectTeamAssignment | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [employeeId, setEmployeeId] = useState("");
  const [startDate, setStartDate] = useState(todayIso());
  const [endDate, setEndDate] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEmployeeId(editing?.employeeId ?? "");
    setStartDate(editing?.startDate ?? todayIso());
    setEndDate(editing?.endDate ?? "");
    setError(null);
  }, [open, editing]);

  const activeEmployees = employees.filter((employee) => employee.status === "active");
  const editingEmployee = editing ? employees.find((employee) => employee.id === editing.employeeId) : null;

  function handleSave() {
    const endDateValue = endDate === "" ? undefined : endDate;

    if (editing) {
      const result = updateAssignmentInterval(existingAssignments, editing, {
        startDate,
        endDate: endDateValue,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
    } else {
      if (employeeId === "") {
        setError("Selecione um colaborador.");
        return;
      }
      const result = createProjectTeamAssignment(existingAssignments, {
        projectId,
        employeeId,
        startDate,
        endDate: endDateValue,
      });
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
      title={editing ? "Editar alocação" : "Alocar colaborador"}
      size="sm"
      footer={
        <>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" onClick={handleSave}>
            Salvar
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="space-y-1.5">
          <span className="text-sm font-medium text-foreground">Colaborador</span>
          {editing ? (
            <div className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-base text-foreground">
              {editingEmployee?.name ?? "Colaborador"}
            </div>
          ) : (
            <Select value={employeeId} onValueChange={(value) => setEmployeeId(value ?? "")}>
              <SelectTrigger className="h-12 w-full px-4 text-base">
                <SelectValue placeholder="Selecione um colaborador">
                  {(value: string | null) =>
                    activeEmployees.find((employee) => employee.id === value)?.name ?? "Selecione um colaborador"
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {activeEmployees.map((employee) => (
                  <SelectItem key={employee.id} value={employee.id}>
                    {employee.name} · {employee.role}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="space-y-1.5">
          <label htmlFor="assignment-start-date" className="text-sm font-medium text-foreground">
            Data inicial
          </label>
          <input
            id="assignment-start-date"
            type="date"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
            className="w-full rounded-xl border border-border bg-background px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="assignment-end-date" className="text-sm font-medium text-foreground">
            Data final <span className="text-muted-foreground">(opcional)</span>
          </label>
          <input
            id="assignment-end-date"
            type="date"
            value={endDate}
            onChange={(event) => setEndDate(event.target.value)}
            className="w-full rounded-xl border border-border bg-background px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
          />
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>
    </ResponsiveDialog>
  );
}
