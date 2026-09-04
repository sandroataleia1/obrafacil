/**
 * Prototype workforce estimate for UI validation only.
 * Payroll, DSR, benefits, taxes and labor rules are not calculated here.
 *
 * Three branches, chosen by `isLegacyWorkPeriod`/`paymentModelSnapshot`:
 *
 * LEGACY — preserves the original formula exactly (absence discount
 * derived from `expectedDays`/`workedDays`). Historical periods must
 * keep producing the same `estimatedPay` forever; this branch is
 * never touched by V2 changes (Demo-Ready 008B, caso K).
 *
 * MONTHLY V2 — product decision (Demo-Ready 009E, superseding the
 * original 008B "frequência never moves the number" stance):
 * `estimatedPay = baseSalarySnapshot - attendanceDiscount +
 * manualAdjustment`, where `attendanceDiscount` is the same
 * dailyReference-based formula the LEGACY branch already used —
 * `dailyReference = baseSalarySnapshot / scheduledWorkDays`,
 * `deductedUnits = absences + halfDays * 0.5`. Only recorded
 * ABSENT/HALF_DAY entries discount; FULL_DAY, folga prevista and
 * PENDING (unrecorded) never do — a period reacts to whatever is
 * already apontado, open or closed, with no second formula at
 * fechamento. `manualAdjustment` still applies on top, for anything
 * this formula cannot represent (see `PeriodAdjustmentDialog`).
 *
 * DAILY V2 — `estimatedPay = workedUnits * dailyRateSnapshot +
 * manualAdjustment`, where `workedUnits = fullDays + halfDays * 0.5`.
 * Faltas, folgas and unrecorded days never add units. Unchanged by
 * Demo-Ready 009E.
 */

import { buildPeriodAttendanceSummary, isLegacyWorkPeriod, type PeriodAttendanceSummary } from "./attendance";
import type { EmployeeWorkPeriod, PaymentModel } from "../types";

export interface LegacyEstimateDetail {
  expectedDays: number;
  workedDays: number;
  absences: number;
  dailyReference: number;
  absenceDiscount: number;
}

/** Breakdown of the attendance-based discount for a monthly V2 period (Demo-Ready 009E). */
export interface MonthlyDiscountDetail {
  scheduledWorkDays: number;
  dailyReference: number;
  /** `absences + halfDays * 0.5` — pending/unrecorded days are never included. */
  deductedUnits: number;
  attendanceDiscount: number;
}

export interface PeriodEstimate {
  paymentModel: PaymentModel | "legacy";
  baseAmount: number;
  manualAdjustment: number;
  estimatedPay: number;
  /** `null` for legacy periods — they have no day-level model. */
  attendanceSummary: PeriodAttendanceSummary | null;
  /** Present only for legacy periods — preserves the original scalar breakdown for the read-only legacy UI. */
  legacy?: LegacyEstimateDetail;
  /** Present only for monthly V2 periods — breakdown of the attendance-based discount. */
  monthlyDiscount?: MonthlyDiscountDetail;
}

function calculateLegacyEstimate(workPeriod: EmployeeWorkPeriod): PeriodEstimate {
  const { baseSalarySnapshot, manualAdjustment } = workPeriod;
  const expectedDays = workPeriod.expectedDays ?? 0;
  const workedDays = workPeriod.workedDays ?? 0;
  const absences = Math.max(expectedDays - workedDays, 0);

  if (expectedDays <= 0) {
    return {
      paymentModel: "legacy",
      baseAmount: 0,
      manualAdjustment,
      estimatedPay: 0,
      attendanceSummary: null,
      legacy: { expectedDays, workedDays, absences, dailyReference: 0, absenceDiscount: 0 },
    };
  }

  const dailyReference = baseSalarySnapshot / expectedDays;
  const absenceDiscount = dailyReference * absences;
  const rawEstimate = baseSalarySnapshot - absenceDiscount + manualAdjustment;
  const estimatedPay = Math.max(rawEstimate, 0);

  return {
    paymentModel: "legacy",
    baseAmount: baseSalarySnapshot,
    manualAdjustment,
    estimatedPay,
    attendanceSummary: null,
    legacy: { expectedDays, workedDays, absences, dailyReference, absenceDiscount },
  };
}

function calculateMonthlyV2Estimate(workPeriod: EmployeeWorkPeriod): PeriodEstimate {
  const attendanceSummary = buildPeriodAttendanceSummary(workPeriod);
  const baseAmount = workPeriod.baseSalarySnapshot;
  const { scheduledWorkDays, absences, halfDays } = attendanceSummary;

  // Defensive: a period with zero scheduled work days has no per-day
  // rate to derive — and, since deriveDayStatus only ever marks a day
  // ABSENT/HALF_DAY when it's a scheduled work day, absences/halfDays
  // are always 0 here too, so there is nothing to discount anyway.
  const dailyReference = scheduledWorkDays > 0 ? baseAmount / scheduledWorkDays : 0;
  const deductedUnits = absences + halfDays * 0.5;
  const attendanceDiscount = dailyReference * deductedUnits;

  const estimatedPay = Math.max(baseAmount - attendanceDiscount + workPeriod.manualAdjustment, 0);
  return {
    paymentModel: "monthly",
    baseAmount,
    manualAdjustment: workPeriod.manualAdjustment,
    estimatedPay,
    attendanceSummary,
    monthlyDiscount: { scheduledWorkDays, dailyReference, deductedUnits, attendanceDiscount },
  };
}

function calculateDailyV2Estimate(workPeriod: EmployeeWorkPeriod): PeriodEstimate {
  const attendanceSummary = buildPeriodAttendanceSummary(workPeriod);
  const baseAmount = attendanceSummary.workedUnits * (workPeriod.dailyRateSnapshot ?? 0);
  const estimatedPay = Math.max(baseAmount + workPeriod.manualAdjustment, 0);
  return {
    paymentModel: "daily",
    baseAmount,
    manualAdjustment: workPeriod.manualAdjustment,
    estimatedPay,
    attendanceSummary,
  };
}

export function calculatePeriodEstimate(workPeriod: EmployeeWorkPeriod): PeriodEstimate {
  if (isLegacyWorkPeriod(workPeriod)) return calculateLegacyEstimate(workPeriod);
  if (workPeriod.paymentModelSnapshot === "daily") return calculateDailyV2Estimate(workPeriod);
  return calculateMonthlyV2Estimate(workPeriod);
}
