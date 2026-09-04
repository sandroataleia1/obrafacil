/**
 * Pure lateness rules for a Project's schedule — mirrors
 * `features/payables/payable-status.ts` (derived, never stored). Lives
 * here (not inside `features/dashboard`) so `project-detail.tsx` and
 * the Dashboard can both consume the exact same rule without
 * duplicating it.
 *
 * Deliberately does NOT model: actualEndDate, cronograma, milestones,
 * físico-executado percentage, or automatic forecasting — only the two
 * date fields Project already has.
 */

import { daysBetweenDateOnly } from "@/lib/date";
import type { Project } from "./types";

type ScheduleProject = Pick<Project, "status" | "expectedStartDate" | "expectedEndDate">;

/**
 * A Project is "late" only while it's actually underway — `completed`
 * never counts (no `actualEndDate` exists to judge it against) and
 * `planning` never counts (see `isProjectStartLate` instead — starting
 * late and running late past the end date are different problems).
 */
export function isProjectLate(project: ScheduleProject, today: string): boolean {
  if (project.status !== "in_progress" && project.status !== "paused") return false;
  if (!project.expectedEndDate) return false;
  return project.expectedEndDate < today;
}

/** 0 when the project isn't late — never negative, never used to mean
 * "not applicable" (see `DashboardSummary.maxProjectDaysLate` for the
 * separate null-vs-zero distinction at the aggregate level). */
export function projectDaysLate(project: ScheduleProject, today: string): number {
  if (!isProjectLate(project, today) || !project.expectedEndDate) return 0;
  return daysBetweenDateOnly(project.expectedEndDate, today);
}

/** A `planning` Project whose expected start date has already passed —
 * never counted as `isProjectLate`, which only judges an end date. */
export function isProjectStartLate(project: ScheduleProject, today: string): boolean {
  if (project.status !== "planning") return false;
  if (!project.expectedStartDate) return false;
  return project.expectedStartDate < today;
}
