"use client";

import { useState } from "react";
import Link from "next/link";
import { FileText, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { CreateWorkPeriodDialog } from "@/features/employees/attendance/create-work-period-dialog";
import { PeriodDetail } from "@/features/employees/period-detail";
import { getEmployee } from "@/features/employees/prototype/employee-store";
import { formatPeriodLabel } from "@/features/employees/prototype/period-label";
import { findWorkPeriod } from "@/features/employees/prototype/work-period-store";
import { useProject } from "@/features/projects/prototype/use-project";
import { assignmentIntersectsMonth, monthRange } from "./project-team";
import { listAssignmentsByEmployee } from "./project-team-assignment-store";

/**
 * Contextual entry point for a colaborador's frequência, reached from
 * `/obras/[id]/equipe` (Demo-Ready 009D-C). Renders the SAME
 * `PeriodDetail` used by the global `/equipe/[id]/periodos/[period]`
 * route — no second implementation of attendance/period logic. This
 * wrapper only decides WHETHER to show it (obra exists, colaborador
 * has an alocação intersecting this month) and adds obra-navigation
 * chrome around it. It never reads or writes Attendance/WorkPeriod
 * data itself.
 *
 * "Não intersecta o mês" is deliberately NOT a 404: the colaborador
 * and the frequência may both exist perfectly well — only the
 * obra/período combination is invalid, so a contextual message (with
 * a way back to the obra's equipe) is shown instead of pretending the
 * frequência belongs to this obra.
 *
 * When the alocação IS valid but no `EmployeeWorkPeriod` exists yet
 * for this employee+period, offers "Criar período" reusing the same
 * `CreateWorkPeriodDialog`/`createWorkPeriodForEmployee` as every
 * other entry point (Demo-Ready 009D-C gate fix) — never a second
 * creation path. The prompt only appears when the alocação already
 * validated as valid; an invalid obra/período context never offers it
 * as a way to paper over a missing alocação.
 */
export function ProjectTeamPeriodPage({
  projectId,
  employeeId,
  period,
}: {
  projectId: string;
  employeeId: string;
  period: string;
}) {
  const { project } = useProject(projectId);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  if (project === undefined) return null;

  if (project === null) {
    return (
      <EmptyState
        icon={FileText}
        title="Obra não encontrada"
        description="Ela pode ter sido removida ou o link está incorreto."
      />
    );
  }

  const employee = getEmployee(employeeId);
  const { monthStart, monthEnd } = monthRange(period);
  const employeeAssignments = listAssignmentsByEmployee(employeeId);
  const assignmentsInThisProject = employeeAssignments.filter((assignment) => assignment.projectId === projectId);
  const intersectsPeriod = assignmentsInThisProject.some((assignment) =>
    assignmentIntersectsMonth(assignment, monthStart, monthEnd)
  );
  const hasOtherProjectThisMonth = employeeAssignments.some(
    (assignment) => assignment.projectId !== projectId && assignmentIntersectsMonth(assignment, monthStart, monthEnd)
  );
  // Direct synchronous read (not `useWorkPeriod`) — this component only
  // needs to decide whether to offer "Criar período" or hand off to
  // `PeriodDetail`; re-evaluated on every render, so closing the dialog
  // after a successful creation (which changes `createDialogOpen` and
  // re-renders this component) is enough to pick up the new period —
  // no extra refresh mechanism needed.
  const workPeriod = intersectsPeriod ? findWorkPeriod(employeeId, period) : null;
  const showCreatePeriodPrompt = intersectsPeriod && workPeriod === null && employee !== null;

  return (
    <div className="space-y-4 pb-6">
      <div className="space-y-1.5">
        <nav aria-label="Navegação da obra" className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
          <Link href="/obras" className="hover:text-foreground hover:underline">
            Obras
          </Link>
          <span aria-hidden="true">›</span>
          <Link href={`/obras/${projectId}`} className="hover:text-foreground hover:underline">
            {project.name}
          </Link>
          <span aria-hidden="true">›</span>
          <Link href={`/obras/${projectId}/equipe`} className="hover:text-foreground hover:underline">
            Equipe
          </Link>
        </nav>
        <Link
          href={`/obras/${projectId}/equipe`}
          className="inline-block text-sm font-medium text-primary hover:underline"
        >
          ‹ Voltar para equipe da obra
        </Link>
      </div>

      {intersectsPeriod && hasOtherProjectThisMonth ? (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm font-medium text-amber-700 dark:text-amber-400">
          Alocado em mais de uma obra neste período.
        </p>
      ) : null}

      {!intersectsPeriod ? (
        <div className="space-y-3">
          <EmptyState
            icon={Users}
            title="Sem alocação nesta obra neste período"
            description={`${employee?.name ?? "Este colaborador"} não possui alocação em ${project.name} em ${formatPeriodLabel(period)}.`}
          />
          <Link
            href={`/obras/${projectId}/equipe`}
            className="block text-center text-sm font-medium text-primary hover:underline"
          >
            Voltar para equipe da obra
          </Link>
        </div>
      ) : showCreatePeriodPrompt && employee ? (
        <div className="space-y-3">
          <EmptyState
            icon={Users}
            title="Período não encontrado"
            description="Ainda não existe frequência registrada para este mês."
          />
          <Button type="button" className="w-full" onClick={() => setCreateDialogOpen(true)}>
            Criar período
          </Button>
          <CreateWorkPeriodDialog
            employee={employee}
            open={createDialogOpen}
            onOpenChange={setCreateDialogOpen}
            defaultPeriod={period}
            onCreated={() => setCreateDialogOpen(false)}
          />
        </div>
      ) : (
        <PeriodDetail employeeId={employeeId} period={period} context={{ type: "project", projectId }} />
      )}
    </div>
  );
}
