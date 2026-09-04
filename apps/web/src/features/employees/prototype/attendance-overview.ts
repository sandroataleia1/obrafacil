/**
 * Pure helpers for the `/equipe/frequencia` overview (Demo-Ready
 * 008C) — month navigation and the 4 top indicators. Never
 * recalculates attendance numbers itself; always delegates to
 * `attendance.ts`/`period-calculation.ts` (see those files' own
 * docs for the underlying rules).
 */

import { buildPeriodAttendanceSummary, canClosePeriod, isLegacyWorkPeriod } from "./attendance";
import { getWorkPeriodStatus, type Employee, type EmployeeWorkPeriod } from "../types";

/** "2026-09" shifted by `deltaMonths` (negative goes back) -> "YYYY-MM". Pure numeric month arithmetic, no `Date`/timezone involved. */
export function shiftPeriod(period: string, deltaMonths: number): string {
  const [yearStr, monthStr] = period.split("-");
  const totalMonths = Number(yearStr) * 12 + (Number(monthStr) - 1) + deltaMonths;
  const year = Math.floor(totalMonths / 12);
  const month = (totalMonths % 12) + 1;
  return `${year}-${String(month).padStart(2, "0")}`;
}

export interface AttendanceOverviewRow {
  employee: Employee;
  workPeriod: EmployeeWorkPeriod | null;
}

export function buildOverviewRows(
  employees: Employee[],
  workPeriods: EmployeeWorkPeriod[],
  period: string
): AttendanceOverviewRow[] {
  return employees.map((employee) => ({
    employee,
    workPeriod:
      workPeriods.find((wp) => wp.employeeId === employee.id && wp.period === period) ?? null,
  }));
}

export interface AttendanceIndicators {
  withPeriod: number;
  withPendencies: number;
  readyToClose: number;
  closed: number;
}

/**
 * "Períodos com pendências" only ever counts monthly V2 periods with
 * `unrecordedDays > 0` — daily periods and legacy periods have no
 * day-level pendency concept (see `canClosePeriod`'s own doc for why
 * daily never blocks). "Prontos para fechar" counts every still-open
 * period (any payment model / legacy) whose gate already allows
 * closing.
 */
export function buildAttendanceIndicators(rows: AttendanceOverviewRow[]): AttendanceIndicators {
  let withPeriod = 0;
  let withPendencies = 0;
  let readyToClose = 0;
  let closed = 0;

  for (const { workPeriod } of rows) {
    if (!workPeriod) continue;
    withPeriod += 1;

    if (getWorkPeriodStatus(workPeriod) === "closed") {
      closed += 1;
      continue;
    }

    if (!isLegacyWorkPeriod(workPeriod) && workPeriod.paymentModelSnapshot === "monthly") {
      if (buildPeriodAttendanceSummary(workPeriod).unrecordedDays > 0) withPendencies += 1;
    }

    if (canClosePeriod(workPeriod).canClose) readyToClose += 1;
  }

  return { withPeriod, withPendencies, readyToClose, closed };
}
