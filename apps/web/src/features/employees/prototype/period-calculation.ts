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
 * MONTHLY V2 — product decision (008B): frequência is NOT an
 * automatic payroll engine. `estimatedPay = baseSalarySnapshot +
 * manualAdjustment`, full stop. Faltas/meios períodos are visible in
 * `attendanceSummary` for the operator, but never move this number by
 * themselves — any financial effect of an absence must be an
 * explicit, auditable `manualAdjustment` (008B spec §14/§15).
 *
 * DAILY V2 — `estimatedPay = workedUnits * dailyRateSnapshot +
 * manualAdjustment`, where `workedUnits = fullDays + halfDays * 0.5`.
 * Faltas, folgas and unrecorded days never add units.
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

export interface PeriodEstimate {
  paymentModel: PaymentModel | "legacy";
  baseAmount: number;
  manualAdjustment: number;
  estimatedPay: number;
  /** `null` for legacy periods — they have no day-level model. */
  attendanceSummary: PeriodAttendanceSummary | null;
  /** Present only for legacy periods — preserves the original scalar breakdown for the read-only legacy UI. */
  legacy?: LegacyEstimateDetail;
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
  const estimatedPay = Math.max(baseAmount + workPeriod.manualAdjustment, 0);
  return {
    paymentModel: "monthly",
    baseAmount,
    manualAdjustment: workPeriod.manualAdjustment,
    estimatedPay,
    attendanceSummary,
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
