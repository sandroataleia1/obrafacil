/**
 * Team/workforce facts for the analytics layer (Demo-Ready 010A).
 *
 * Reuses `isAssignmentActiveOn` (from `features/projects/team/project-team.ts`)
 * for the "hoje"/snapshot view, and `calculatePeriodEstimate` (from
 * `features/employees/prototype/period-calculation.ts`, unchanged by
 * this round) for the workforce-cost view — never re-derives either
 * formula. Pure functions only — no store reads, no writes.
 *
 * `ProjectTeamAssignment` is never used to distribute `estimatedPay`
 * across obras (Demo-Ready 010A §26) — this module only counts
 * assignments, it never touches money.
 */

import { isAssignmentActiveOn } from "@/features/projects/team/project-team";
import type { ProjectTeamAssignment } from "@/features/projects/team/types";
import { calculatePeriodEstimate } from "@/features/employees/prototype/period-calculation";
import type { Employee, EmployeeWorkPeriod } from "@/features/employees/types";
import type { TeamSnapshotFacts, WorkforcePeriodFacts } from "./types";

/**
 * `unallocatedEmployees`/`multiProjectEmployees` are always computed
 * over the ACTIVE employee set only (Demo-Ready 010A §13) — an
 * inactive employee never counts as "sem alocação".
 */
export function buildTeamSnapshotFacts(
  employees: Employee[],
  assignments: ProjectTeamAssignment[],
  referenceDate: string
): TeamSnapshotFacts {
  const activeEmployees = employees.filter((employee) => employee.status === "active");
  const activeEmployeeIds = new Set(activeEmployees.map((employee) => employee.id));

  const activeAssignmentsToday = assignments.filter(
    (assignment) => activeEmployeeIds.has(assignment.employeeId) && isAssignmentActiveOn(assignment, referenceDate)
  );

  const projectIdsByEmployee = new Map<string, Set<string>>();
  for (const assignment of activeAssignmentsToday) {
    const projectIds = projectIdsByEmployee.get(assignment.employeeId) ?? new Set<string>();
    projectIds.add(assignment.projectId);
    projectIdsByEmployee.set(assignment.employeeId, projectIds);
  }

  const allocatedEmployees = projectIdsByEmployee.size;
  const multiProjectEmployees = [...projectIdsByEmployee.values()].filter(
    (projectIds) => projectIds.size > 1
  ).length;

  return {
    referenceDate,
    activeEmployees: activeEmployees.length,
    allocatedEmployees,
    unallocatedEmployees: activeEmployees.length - allocatedEmployees,
    multiProjectEmployees,
  };
}

/**
 * Sums `estimatedPay` only across `EmployeeWorkPeriod`s that already
 * exist for `period` — never creates one to fill a gap. Coverage
 * (`existingPeriodsCount`/`employeesWithoutPeriodCount`/Ids) lets a
 * consumer judge whether this total represents the whole active team
 * or only part of it (Demo-Ready 010A §14/§15).
 */
export function buildWorkforcePeriodFacts(
  employees: Employee[],
  workPeriods: EmployeeWorkPeriod[],
  period: string
): WorkforcePeriodFacts {
  const periodsForMonth = workPeriods.filter((workPeriod) => workPeriod.period === period);
  const estimatedValueOfExistingPeriods = periodsForMonth.reduce(
    (sum, workPeriod) => sum + calculatePeriodEstimate(workPeriod).estimatedPay,
    0
  );

  const employeeIdsWithPeriod = new Set(periodsForMonth.map((workPeriod) => workPeriod.employeeId));
  const activeEmployees = employees.filter((employee) => employee.status === "active");
  const employeesWithoutPeriod = activeEmployees.filter((employee) => !employeeIdsWithPeriod.has(employee.id));

  return {
    period,
    estimatedValueOfExistingPeriods,
    existingPeriodsCount: periodsForMonth.length,
    employeesWithoutPeriodCount: employeesWithoutPeriod.length,
    employeesWithoutPeriodIds: employeesWithoutPeriod.map((employee) => employee.id),
  };
}
