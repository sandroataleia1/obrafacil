"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Search, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { BackHeader } from "@/components/shared/back-header";
import { EmptyState } from "@/components/shared/empty-state";
import { useEmployees } from "@/features/employees/prototype/use-employees";
import { formatPeriodLabel } from "@/features/employees/prototype/period-label";
import { shiftPeriod } from "@/features/employees/prototype/attendance-overview";
import { useAllWorkPeriods } from "@/features/employees/prototype/use-work-periods";
import { useProject } from "@/features/projects/prototype/use-project";
import { todayIso } from "@/lib/date";
import { ProjectTeamAssignmentDialog } from "./project-team-assignment-dialog";
import { ProjectTeamEndAssignmentDialog } from "./project-team-end-assignment-dialog";
import { ProjectTeamRowDesktop, ProjectTeamRowMobile } from "./project-team-row";
import { assignmentIntersectsMonth, getAssignmentStatus, monthRange } from "./project-team";
import { listAssignmentsByEmployee } from "./project-team-assignment-store";
import { useProjectTeamAssignments } from "./use-project-team-assignments";
import type { ProjectTeamAssignment } from "./types";

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

export function ProjectTeamPage({ projectId }: { projectId: string }) {
  const router = useRouter();
  const { project } = useProject(projectId);
  const { employees } = useEmployees();
  const { assignments, refresh: refreshAssignments } = useProjectTeamAssignments(projectId);
  const { workPeriods, refresh: refreshWorkPeriods } = useAllWorkPeriods();

  const [period, setPeriod] = useState(() => todayIso().slice(0, 7));
  const [showEnded, setShowEnded] = useState(false);
  const [search, setSearch] = useState("");
  const [assignmentDialogOpen, setAssignmentDialogOpen] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState<ProjectTeamAssignment | null>(null);
  const [endingAssignment, setEndingAssignment] = useState<ProjectTeamAssignment | null>(null);

  function refresh() {
    refreshAssignments();
    refreshWorkPeriods();
  }

  if (project === undefined || employees === undefined || assignments === undefined || workPeriods === undefined) {
    return null;
  }

  if (project === null) {
    return (
      <EmptyState
        icon={Users}
        title="Obra não encontrada"
        description="Ela pode ter sido removida ou o link está incorreto."
      />
    );
  }

  const canAllocate = project.status !== "completed";
  const today = todayIso();
  const { monthStart, monthEnd } = monthRange(period);

  const monthAssignments = assignments.filter((assignment) =>
    assignmentIntersectsMonth(assignment, monthStart, monthEnd)
  );
  const visibleAssignments = monthAssignments.filter(
    (assignment) => showEnded || getAssignmentStatus(assignment, today) !== "ended"
  );

  const normalizedSearch = normalize(search.trim());
  const rows = visibleAssignments
    .map((assignment) => ({
      assignment,
      employee: employees.find((employee) => employee.id === assignment.employeeId) ?? null,
    }))
    .filter((row): row is { assignment: ProjectTeamAssignment; employee: NonNullable<typeof row.employee> } => {
      if (!row.employee) return false;
      if (normalizedSearch === "") return true;
      return (
        normalize(row.employee.name).includes(normalizedSearch) ||
        normalize(row.employee.role).includes(normalizedSearch)
      );
    })
    .map(({ assignment, employee }) => {
      const workPeriod = workPeriods.find((wp) => wp.employeeId === employee.id && wp.period === period) ?? null;
      const hasOtherProjectThisMonth = listAssignmentsByEmployee(employee.id).some(
        (other) => other.projectId !== projectId && assignmentIntersectsMonth(other, monthStart, monthEnd)
      );
      return { assignment, employee, workPeriod, hasOtherProjectThisMonth };
    });

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <BackHeader title="Equipe da obra" onBack={() => router.push(`/obras/${projectId}`)} />
        <p className="pl-11 text-sm text-muted-foreground">{project.name}</p>
      </div>

      <p className="text-sm text-muted-foreground">
        Gerencie os colaboradores alocados e acompanhe a frequência do período.
      </p>

      {canAllocate ? (
        <Button
          type="button"
          className="w-full"
          onClick={() => {
            setEditingAssignment(null);
            setAssignmentDialogOpen(true);
          }}
        >
          + Alocar colaborador
        </Button>
      ) : (
        <p className="rounded-xl border border-border bg-muted/40 px-4 py-2.5 text-sm text-muted-foreground">
          Esta obra está concluída. A equipe permanece disponível para consulta.
        </p>
      )}

      <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-3">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setPeriod((current) => shiftPeriod(current, -1))}
          aria-label="Mês anterior"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
        </Button>
        <div className="flex items-center gap-2">
          <span className="hidden text-sm font-semibold text-foreground sm:inline">
            {formatPeriodLabel(period)}
          </span>
          <input
            type="month"
            value={period}
            onChange={(event) => event.target.value && setPeriod(event.target.value)}
            aria-label="Selecionar período"
            className="rounded-lg border border-border bg-card px-2 py-1 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
          />
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setPeriod((current) => shiftPeriod(current, 1))}
          aria-label="Próximo mês"
        >
          <ChevronRight className="size-4" aria-hidden="true" />
        </Button>
      </div>

      <div className="space-y-3">
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por nome ou cargo"
            aria-label="Buscar por nome ou cargo"
            className="w-full rounded-xl border border-border bg-card py-3 pr-4 pl-10 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
          />
        </div>

        <button
          type="button"
          aria-pressed={showEnded}
          onClick={() => setShowEnded((current) => !current)}
          className={
            showEnded
              ? "rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
              : "rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:border-primary/30"
          }
        >
          Mostrar encerrados
        </button>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={Users}
          title={
            monthAssignments.length === 0
              ? "Esta obra ainda não possui colaboradores alocados."
              : "Nenhum colaborador encontrado"
          }
          description={
            monthAssignments.length === 0
              ? undefined
              : "Ajuste a busca ou os filtros para ver outros colaboradores."
          }
        />
      ) : (
        <>
          <div className="space-y-3 lg:hidden">
            {rows.map(({ assignment, employee, workPeriod, hasOtherProjectThisMonth }) => (
              <ProjectTeamRowMobile
                key={assignment.id}
                projectId={projectId}
                assignment={assignment}
                employee={employee}
                workPeriod={workPeriod}
                period={period}
                today={today}
                canManage={canAllocate}
                hasOtherProjectThisMonth={hasOtherProjectThisMonth}
                onPeriodCreated={refresh}
                onEdit={() => {
                  setEditingAssignment(assignment);
                  setAssignmentDialogOpen(true);
                }}
                onEnd={() => setEndingAssignment(assignment)}
              />
            ))}
          </div>
          <div className="hidden overflow-x-auto rounded-xl border border-border bg-card p-4 lg:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs font-medium text-muted-foreground">
                  <th className="pb-2 pr-4 font-medium">Colaborador</th>
                  <th className="pb-2 pr-4 font-medium">Alocação</th>
                  <th className="pb-2 pr-4 font-medium">Frequência</th>
                  <th className="pb-2 pr-4 font-medium">Situação</th>
                  <th className="pb-2 font-medium">Ações</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ assignment, employee, workPeriod, hasOtherProjectThisMonth }) => (
                  <ProjectTeamRowDesktop
                    key={assignment.id}
                    projectId={projectId}
                    assignment={assignment}
                    employee={employee}
                    workPeriod={workPeriod}
                    period={period}
                    today={today}
                    canManage={canAllocate}
                    hasOtherProjectThisMonth={hasOtherProjectThisMonth}
                    onPeriodCreated={refresh}
                    onEdit={() => {
                      setEditingAssignment(assignment);
                      setAssignmentDialogOpen(true);
                    }}
                    onEnd={() => setEndingAssignment(assignment)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <ProjectTeamAssignmentDialog
        projectId={projectId}
        employees={employees}
        existingAssignments={assignments}
        editing={editingAssignment}
        open={assignmentDialogOpen}
        onOpenChange={setAssignmentDialogOpen}
        onSaved={refresh}
      />

      {endingAssignment ? (
        <ProjectTeamEndAssignmentDialog
          assignment={endingAssignment}
          employee={employees.find((employee) => employee.id === endingAssignment.employeeId) ?? null}
          open={endingAssignment !== null}
          onOpenChange={(open) => {
            if (!open) setEndingAssignment(null);
          }}
          onEnded={refresh}
        />
      ) : null}
    </div>
  );
}
