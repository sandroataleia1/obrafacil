/**
 * Pure helpers + domain operations for ProjectTeamAssignment. Overlap
 * validation lives here ONCE and is used by every entry point
 * (create, edit) — never duplicated in a component (Demo-Ready 009D-A
 * §11).
 *
 * Dates are date-only "YYYY-MM-DD" civil strings, compared purely by
 * string ordering (never through `Date`/timezone-sensitive parsing —
 * same convention as `features/employees/prototype/attendance.ts`).
 * `startDate`/`endDate` are INCLUSIVE on both ends.
 */

import { todayIso } from "@/lib/date";
import { lastDayOfPeriod } from "@/features/employees/prototype/period-label";
import { createProjectTeamAssignmentId, saveProjectTeamAssignment } from "./project-team-assignment-store";
import type { ProjectTeamAssignment } from "./types";

export type AssignmentStatus = "future" | "active" | "ended";

export const ASSIGNMENT_STATUS_LABEL: Record<AssignmentStatus, string> = {
  future: "Futura",
  active: "Ativo",
  ended: "Encerrado",
};

/** Status is never persisted — always derived from `startDate`/`endDate` against a reference civil date. */
export function getAssignmentStatus(assignment: ProjectTeamAssignment, today: string): AssignmentStatus {
  if (assignment.startDate > today) return "future";
  if (assignment.endDate !== undefined && assignment.endDate < today) return "ended";
  return "active";
}

export function isAssignmentActiveOn(assignment: ProjectTeamAssignment, today: string): boolean {
  return assignment.startDate <= today && (assignment.endDate === undefined || assignment.endDate >= today);
}

/** "YYYY-MM" -> { monthStart, monthEnd } as date-only strings. Reuses `lastDayOfPeriod` instead of duplicating month arithmetic. */
export function monthRange(period: string): { monthStart: string; monthEnd: string } {
  return { monthStart: `${period}-01`, monthEnd: lastDayOfPeriod(period) };
}

/** Single place that assembles the contextual frequência route (Demo-Ready 009D-C §15) — never inline the string in a component. */
export function getProjectEmployeePeriodHref(projectId: string, employeeId: string, period: string): string {
  return `/obras/${projectId}/equipe/${employeeId}/periodos/${period}`;
}

/** An assignment belongs to a month's view if its interval intersects `[monthStart, monthEnd]` — never just "ativo hoje" (Demo-Ready 009D-A §18/§22). */
export function assignmentIntersectsMonth(
  assignment: ProjectTeamAssignment,
  monthStart: string,
  monthEnd: string
): boolean {
  return assignment.startDate <= monthEnd && (assignment.endDate === undefined || assignment.endDate >= monthStart);
}

/** Two INCLUSIVE date-only intervals overlap iff each one's end (or "open") is not before the other's start. */
export function intervalsOverlap(
  aStart: string,
  aEnd: string | undefined,
  bStart: string,
  bEnd: string | undefined
): boolean {
  const aEndsAfterBStarts = aEnd === undefined || aEnd >= bStart;
  const bEndsAfterAStarts = bEnd === undefined || bEnd >= aStart;
  return aEndsAfterBStarts && bEndsAfterAStarts;
}

/** Overlap is only forbidden within the SAME (employeeId, projectId) pair — the same employee may be allocated to different obras with overlapping intervals (Demo-Ready 009D-A §8/§10). */
export function hasOverlappingAssignment(
  existing: ProjectTeamAssignment[],
  candidate: { projectId: string; employeeId: string; startDate: string; endDate?: string; excludeId?: string }
): boolean {
  return existing.some(
    (assignment) =>
      assignment.id !== candidate.excludeId &&
      assignment.projectId === candidate.projectId &&
      assignment.employeeId === candidate.employeeId &&
      intervalsOverlap(assignment.startDate, assignment.endDate, candidate.startDate, candidate.endDate)
  );
}

export type AssignmentResult =
  | { ok: true; assignment: ProjectTeamAssignment }
  | { ok: false; error: string };

function validateDates(startDate: string, endDate: string | undefined): string | null {
  if (!startDate) return "Informe a data inicial.";
  if (endDate !== undefined && endDate !== "" && endDate < startDate) {
    return "A data final deve ser igual ou posterior à data inicial.";
  }
  return null;
}

/** Single entry point for creating an assignment — validates dates and same-obra overlap before saving. */
export function createProjectTeamAssignment(
  existing: ProjectTeamAssignment[],
  input: { projectId: string; employeeId: string; startDate: string; endDate?: string }
): AssignmentResult {
  const dateError = validateDates(input.startDate, input.endDate);
  if (dateError) return { ok: false, error: dateError };

  if (hasOverlappingAssignment(existing, input)) {
    return {
      ok: false,
      error: "Este colaborador já possui uma alocação nesta obra que se sobrepõe ao período informado.",
    };
  }

  const now = todayIso();
  const assignment: ProjectTeamAssignment = {
    id: createProjectTeamAssignmentId(),
    projectId: input.projectId,
    employeeId: input.employeeId,
    startDate: input.startDate,
    endDate: input.endDate,
    createdAt: now,
    updatedAt: now,
  };
  saveProjectTeamAssignment(assignment);
  return { ok: true, assignment };
}

/** Edits only the interval (`startDate`/`endDate`) — employeeId/projectId stay fixed (Demo-Ready 009D-B §34). Revalidates overlap excluding the assignment's own id. */
export function updateAssignmentInterval(
  existing: ProjectTeamAssignment[],
  assignment: ProjectTeamAssignment,
  input: { startDate: string; endDate?: string }
): AssignmentResult {
  const dateError = validateDates(input.startDate, input.endDate);
  if (dateError) return { ok: false, error: dateError };

  if (hasOverlappingAssignment(existing, { ...assignment, ...input, excludeId: assignment.id })) {
    return {
      ok: false,
      error: "Este colaborador já possui uma alocação nesta obra que se sobrepõe ao período informado.",
    };
  }

  const updated: ProjectTeamAssignment = {
    ...assignment,
    startDate: input.startDate,
    endDate: input.endDate,
    updatedAt: todayIso(),
  };
  saveProjectTeamAssignment(updated);
  return { ok: true, assignment: updated };
}

/** "Encerrar alocação" — sets `endDate`, never deletes the record (Demo-Ready 009D-A §11). */
export function endProjectTeamAssignment(
  assignment: ProjectTeamAssignment,
  endDate: string
): AssignmentResult {
  if (endDate < assignment.startDate) {
    return { ok: false, error: "A data de encerramento deve ser igual ou posterior à data inicial." };
  }
  const updated: ProjectTeamAssignment = { ...assignment, endDate, updatedAt: todayIso() };
  saveProjectTeamAssignment(updated);
  return { ok: true, assignment: updated };
}
