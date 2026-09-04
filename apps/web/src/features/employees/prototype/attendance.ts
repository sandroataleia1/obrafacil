/**
 * Pure V2 attendance model helpers — no localStorage access here (see
 * `work-period-store.ts` for persistence).
 *
 * Central rule (Demo-Ready 008B): absence of an apontamento never
 * means "falta". Two independent dimensions are combined per day:
 *
 *   PREVISTO  — was the person scheduled to work that day? Derived
 *               from `workDaysSnapshot` (monthly) — a daily contractor
 *               has no fixed schedule in V1, so every day is simply
 *               "no fixed expectation" for them.
 *   REALIZADO — what actually happened: an explicit attendance entry,
 *               or nothing at all.
 *
 * See `DerivedDayStatus` in `../types` for the combined result.
 */

import type { AttendanceStatus, DerivedDayStatus, EmployeeAttendanceEntry, EmployeeWorkPeriod } from "../types";

export const ISO_WEEKDAY_LABEL: Record<number, string> = {
  1: "Seg",
  2: "Ter",
  3: "Qua",
  4: "Qui",
  5: "Sex",
  6: "Sáb",
  7: "Dom",
};

export const ISO_WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;

/** A period is LEGACY iff it predates the V2 snapshot fields — see the `EmployeeWorkPeriod` doc comment in `../types`. */
export function isLegacyWorkPeriod(workPeriod: EmployeeWorkPeriod): boolean {
  return workPeriod.paymentModelSnapshot === undefined;
}

/** All calendar days of a "YYYY-MM" period as "YYYY-MM-DD" strings. Pure string/local-numeric math — no timezone-sensitive parsing (mirrors `lastDayOfPeriod` in `period-label.ts`). */
export function getPeriodDates(period: string): string[] {
  const [yearStr, monthStr] = period.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const daysInMonth = new Date(year, month, 0).getDate();
  const dates: string[] = [];
  for (let day = 1; day <= daysInMonth; day += 1) {
    dates.push(`${yearStr}-${monthStr.padStart(2, "0")}-${String(day).padStart(2, "0")}`);
  }
  return dates;
}

/** ISO weekday (1=segunda ... 7=domingo) for a "YYYY-MM-DD" string, via `Date.UTC` — timezone-independent, same technique as `lib/date.ts`. */
export function isoWeekday(dateOnly: string): number {
  const [year, month, day] = dateOnly.split("-").map(Number);
  const utcDay = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return utcDay === 0 ? 7 : utcDay;
}

export function isScheduledWorkDay(dateOnly: string, workDaysSnapshot: number[] | undefined): boolean {
  if (!workDaysSnapshot) return false;
  return workDaysSnapshot.includes(isoWeekday(dateOnly));
}

export function findAttendanceEntry(
  entries: EmployeeAttendanceEntry[] | undefined,
  date: string
): EmployeeAttendanceEntry | undefined {
  return entries?.find((entry) => entry.date === date);
}

/**
 * Combines previsto (schedule) and realizado (entry) for one day.
 * Monthly: a day outside the escala is `scheduled_day_off` regardless
 * of any entry; a day inside it with no entry is `unrecorded`. Daily:
 * there is no fixed escala in V1, so a day with no entry is simply
 * `unrecorded` — informational only, never blocking (see
 * `canClosePeriod`).
 */
export function deriveDayStatus(workPeriod: EmployeeWorkPeriod, date: string): DerivedDayStatus {
  const entry = findAttendanceEntry(workPeriod.attendanceEntries, date);
  if (workPeriod.paymentModelSnapshot === "monthly") {
    if (!isScheduledWorkDay(date, workPeriod.workDaysSnapshot)) return "scheduled_day_off";
    return entry?.status ?? "unrecorded";
  }
  return entry?.status ?? "unrecorded";
}

export interface PeriodAttendanceSummary {
  scheduledWorkDays: number;
  fullDays: number;
  halfDays: number;
  absences: number;
  unrecordedDays: number;
  scheduledDaysOff: number;
  /** `fullDays + halfDays * 0.5` — feeds the daily-rate calculation; informational for monthly. */
  workedUnits: number;
}

/** Pure aggregation over every calendar day of the period. V2 only — callers must check `isLegacyWorkPeriod` first. */
export function buildPeriodAttendanceSummary(workPeriod: EmployeeWorkPeriod): PeriodAttendanceSummary {
  const isMonthly = workPeriod.paymentModelSnapshot === "monthly";
  let scheduledWorkDays = 0;
  let fullDays = 0;
  let halfDays = 0;
  let absences = 0;
  let unrecordedDays = 0;
  let scheduledDaysOff = 0;

  for (const date of getPeriodDates(workPeriod.period)) {
    const status = deriveDayStatus(workPeriod, date);
    if (isMonthly) {
      if (status === "scheduled_day_off") {
        scheduledDaysOff += 1;
        continue;
      }
      scheduledWorkDays += 1;
    } else if (status === "unrecorded") {
      // Daily: a day with no entry is simply "nothing registered" —
      // never counted anywhere, never pending, never a falta.
      continue;
    }

    if (status === "full_day") fullDays += 1;
    else if (status === "half_day") halfDays += 1;
    else if (status === "absent") absences += 1;
    else if (status === "unrecorded") unrecordedDays += 1;
  }

  const workedUnits = fullDays + halfDays * 0.5;
  return { scheduledWorkDays, fullDays, halfDays, absences, unrecordedDays, scheduledDaysOff, workedUnits };
}

export interface CloseGateResult {
  canClose: boolean;
  pendingCount: number;
}

/**
 * Monthly: every scheduled work day must be resolved (full/half/absent)
 * before closing — an `unrecorded` day blocks. Daily: never blocks on
 * unrecorded days — a contractor may legitimately have worked 3 days
 * out of the month, and 0 entries is a valid, closeable period (see
 * Demo-Ready 008B spec, casos G/H). This gate only applies to V2
 * periods; legacy closing behavior is unchanged.
 */
export function canClosePeriod(workPeriod: EmployeeWorkPeriod): CloseGateResult {
  if (isLegacyWorkPeriod(workPeriod)) return { canClose: true, pendingCount: 0 };
  if (workPeriod.paymentModelSnapshot === "daily") return { canClose: true, pendingCount: 0 };
  const summary = buildPeriodAttendanceSummary(workPeriod);
  return { canClose: summary.unrecordedDays === 0, pendingCount: summary.unrecordedDays };
}

export function setAttendanceEntry(
  workPeriod: EmployeeWorkPeriod,
  date: string,
  status: AttendanceStatus
): EmployeeWorkPeriod {
  const entries = (workPeriod.attendanceEntries ?? []).filter((entry) => entry.date !== date);
  entries.push({ date, status });
  entries.sort((a, b) => a.date.localeCompare(b.date));
  return { ...workPeriod, attendanceEntries: entries };
}

export function clearAttendanceEntry(workPeriod: EmployeeWorkPeriod, date: string): EmployeeWorkPeriod {
  const entries = (workPeriod.attendanceEntries ?? []).filter((entry) => entry.date !== date);
  return { ...workPeriod, attendanceEntries: entries };
}

/** How many scheduled work days are currently UNRECORDED — the count a "Preencher pendentes" bulk action would resolve. Monthly only (see `fillUnrecordedAsFullDay`). */
export function countPendingFillable(workPeriod: EmployeeWorkPeriod): number {
  return getPeriodDates(workPeriod.period).filter(
    (date) => deriveDayStatus(workPeriod, date) === "unrecorded"
  ).length;
}

/**
 * Bulk action (Demo-Ready 008C §24): sets FULL_DAY only on scheduled
 * work days that are currently UNRECORDED. Never touches a day that
 * already has an explicit FULL_DAY/HALF_DAY/ABSENT entry — an existing
 * exception always survives this action untouched.
 */
export function fillUnrecordedAsFullDay(workPeriod: EmployeeWorkPeriod): EmployeeWorkPeriod {
  const pendingDates = getPeriodDates(workPeriod.period).filter(
    (date) => deriveDayStatus(workPeriod, date) === "unrecorded"
  );
  if (pendingDates.length === 0) return workPeriod;
  const entries = [...(workPeriod.attendanceEntries ?? [])];
  for (const date of pendingDates) entries.push({ date, status: "full_day" });
  entries.sort((a, b) => a.date.localeCompare(b.date));
  return { ...workPeriod, attendanceEntries: entries };
}

/**
 * Bulk action for the daily multi-select flow (Demo-Ready 008C §28):
 * sets the same status on exactly the given dates. Overwrites any
 * existing entry on those specific dates only — the caller is
 * responsible for confirming with the user first when a selected date
 * already has an entry (see `period-detail.tsx`); dates outside the
 * given list are never touched.
 */
export function setMultipleAttendanceEntries(
  workPeriod: EmployeeWorkPeriod,
  dates: string[],
  status: AttendanceStatus
): EmployeeWorkPeriod {
  const dateSet = new Set(dates);
  const entries = (workPeriod.attendanceEntries ?? []).filter((entry) => !dateSet.has(entry.date));
  for (const date of dates) entries.push({ date, status });
  entries.sort((a, b) => a.date.localeCompare(b.date));
  return { ...workPeriod, attendanceEntries: entries };
}
