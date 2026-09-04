"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { ResponsiveDialog } from "@/components/shared/responsive-dialog";
import { todayIso } from "@/lib/date";
import type { Employee } from "@/features/employees/types";
import { endProjectTeamAssignment } from "./project-team";
import type { ProjectTeamAssignment } from "./types";

/**
 * "Encerrar alocação" sets `endDate` — never deletes the record, so
 * the vínculo stays in the obra's histórico (Demo-Ready 009D-A §11).
 * Needs a date input, so this is a small `ResponsiveDialog` rather
 * than a plain `ConfirmActionDialog` (which has no field for input).
 */
export function ProjectTeamEndAssignmentDialog({
  assignment,
  employee,
  open,
  onOpenChange,
  onEnded,
}: {
  assignment: ProjectTeamAssignment;
  employee: Employee | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEnded: () => void;
}) {
  const [endDate, setEndDate] = useState(todayIso());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEndDate(todayIso());
    setError(null);
  }, [open]);

  function handleConfirm() {
    const result = endProjectTeamAssignment(assignment, endDate);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onOpenChange(false);
    onEnded();
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Encerrar alocação"
      description={employee?.name}
      size="sm"
      footer={
        <>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" variant="destructive" onClick={handleConfirm}>
            Encerrar alocação
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="space-y-1.5">
          <label htmlFor="assignment-end-date-confirm" className="text-sm font-medium text-foreground">
            Data de encerramento
          </label>
          <input
            id="assignment-end-date-confirm"
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
