/**
 * Prototype workforce estimate for UI validation only.
 * Payroll, DSR, benefits, taxes and labor rules are not calculated here.
 */

import type { EmployeeWorkPeriod } from "../types";

export interface PeriodEstimate {
  absences: number;
  dailyReference: number;
  absenceDiscount: number;
  estimatedPay: number;
}

export function calculatePeriodEstimate(
  workPeriod: Pick<
    EmployeeWorkPeriod,
    "baseSalarySnapshot" | "expectedDays" | "workedDays" | "manualAdjustment"
  >
): PeriodEstimate {
  const { baseSalarySnapshot, expectedDays, workedDays, manualAdjustment } = workPeriod;
  const absences = Math.max(expectedDays - workedDays, 0);

  if (expectedDays <= 0) {
    return { absences, dailyReference: 0, absenceDiscount: 0, estimatedPay: 0 };
  }

  const dailyReference = baseSalarySnapshot / expectedDays;
  const absenceDiscount = dailyReference * absences;
  const rawEstimate = baseSalarySnapshot - absenceDiscount + manualAdjustment;
  // Clamped to avoid an absurd negative monetary value in the prototype.
  const estimatedPay = Math.max(rawEstimate, 0);

  return { absences, dailyReference, absenceDiscount, estimatedPay };
}
