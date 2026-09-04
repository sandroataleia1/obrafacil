"use client";

import { useState } from "react";
import Link from "next/link";
import { Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { useEmployees } from "@/features/employees/prototype/use-employees";
import { todayIso } from "@/lib/date";
import type { Project } from "@/features/projects/types";
import { ProjectTeamAssignmentDialog } from "./project-team-assignment-dialog";
import { isAssignmentActiveOn } from "./project-team";
import { useProjectTeamAssignments } from "./use-project-team-assignments";

const MAX_VISIBLE = 4;

/**
 * Compact summary rendered inside `project-detail.tsx`'s "Equipe da
 * obra" section — never a calendar/table/financeiro here (Demo-Ready
 * 009D-A §14, 009D-B §17). "Equipe atual" = assignments active on
 * today's civil date (`isAssignmentActiveOn`), independent of the
 * month selector used on the full `/obras/[id]/equipe` page.
 */
export function ProjectTeamSummary({ project }: { project: Project }) {
  const { employees } = useEmployees();
  const { assignments, refresh } = useProjectTeamAssignments(project.id);
  const [dialogOpen, setDialogOpen] = useState(false);

  if (employees === undefined || assignments === undefined) return null;

  const canAllocate = project.status !== "completed";
  const today = todayIso();
  const activeAssignments = assignments.filter((assignment) => isAssignmentActiveOn(assignment, today));
  const visible = activeAssignments.slice(0, MAX_VISIBLE);
  const hiddenCount = activeAssignments.length - visible.length;

  return (
    <div className="space-y-3">
      {activeAssignments.length === 0 ? (
        <EmptyState
          compact
          icon={Users}
          title="Nenhum colaborador alocado."
          description="Aloque colaboradores para acompanhar a equipe desta obra."
        />
      ) : (
        <div className="space-y-1 rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">
            {activeAssignments.length} colaborador{activeAssignments.length === 1 ? "" : "es"} atualmente
            alocado{activeAssignments.length === 1 ? "" : "s"}
          </p>
          <div className="divide-y divide-border">
            {visible.map((assignment) => {
              const employee = employees.find((item) => item.id === assignment.employeeId);
              return (
                <div key={assignment.id} className="py-2">
                  <p className="truncate text-sm font-medium text-foreground">
                    {employee?.name ?? "Colaborador"}
                  </p>
                  <p className="text-xs text-muted-foreground">{employee?.role ?? ""}</p>
                </div>
              );
            })}
          </div>
          {hiddenCount > 0 ? (
            <p className="pt-1 text-xs text-muted-foreground">
              +{hiddenCount} colaborador{hiddenCount === 1 ? "" : "es"}
            </p>
          ) : null}
        </div>
      )}

      <div className={canAllocate ? "grid grid-cols-2 gap-2" : undefined}>
        <Button
          variant="outline"
          className={canAllocate ? undefined : "w-full"}
          nativeButton={false}
          render={<Link href={`/obras/${project.id}/equipe`}>Ver equipe</Link>}
        />
        {canAllocate ? (
          <Button type="button" variant="outline" onClick={() => setDialogOpen(true)}>
            + Alocar colaborador
          </Button>
        ) : null}
      </div>

      <ProjectTeamAssignmentDialog
        projectId={project.id}
        employees={employees}
        existingAssignments={assignments}
        editing={null}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSaved={refresh}
      />
    </div>
  );
}
