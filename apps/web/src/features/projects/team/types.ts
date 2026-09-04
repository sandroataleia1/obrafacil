/**
 * Operational team membership: who is allocated to a Project (Obra)
 * and during what interval. Distinct from `EmployeePeriodAllocation`
 * (features/employees/types.ts), which represents how much of a
 * CLOSED work period's estimated pay was apportioned to a Project — a
 * financial concern, not an operational one. Both hang off Employee
 * and Project independently:
 *
 *   Employee ──ProjectTeamAssignment──> Project   (operational: quem, quando)
 *   EmployeeWorkPeriod ──EmployeePeriodAllocation──> Project (financeiro: quanto)
 *
 * `ProjectTeamAssignment` is the ONLY source of truth for the
 * Colaborador <-> Obra relationship. `Project` and `Employee` never
 * gain a matching id/array of their own (no `Project.employeeIds`, no
 * `Employee.projectId`) — see `project-team.ts` for the helpers that
 * derive everything else (status, overlap) from this single entity.
 *
 * V1 intentionally has no `role` field: `Employee.role` is shown as
 * the function in this context. An obra-specific role would create a
 * second source of truth without a proven product need.
 *
 * `startDate`/`endDate` are date-only "YYYY-MM-DD" civil dates,
 * INCLUSIVE on both ends. There is no persisted `status` — active,
 * future and ended are always derived from the dates (see
 * `getAssignmentStatus` in `project-team.ts`).
 *
 * NOT the definitive domain contract for the future API — only exists
 * to validate the product experience with mocked/local data.
 */
export interface ProjectTeamAssignment {
  id: string;
  projectId: string;
  employeeId: string;
  startDate: string;
  /** Absent = alocação em andamento (sem data de encerramento). */
  endDate?: string;
  createdAt: string;
  updatedAt: string;
}
