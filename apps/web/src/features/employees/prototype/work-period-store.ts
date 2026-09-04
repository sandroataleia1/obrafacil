/**
 * Prototype browser persistence for monthly work control
 * (EmployeeWorkPeriod).
 *
 * There is no backend yet, so created/edited periods are kept in
 * localStorage, layered on top of the seed data in
 * `src/mocks/employee-work-periods.ts`. Laravel + PostgreSQL will
 * replace this storage entirely once the real API exists.
 */

import { todayIso } from "@/lib/date";
import { employeeWorkPeriods as seedWorkPeriods } from "@/mocks/employee-work-periods";
import type { Employee, EmployeeWorkPeriod } from "../types";

const STORAGE_KEY = "obrafacil:employee-work-periods";

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `work-period-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function readStore(): Record<string, EmployeeWorkPeriod> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, EmployeeWorkPeriod>) : {};
  } catch {
    return {};
  }
}

function writeStore(store: Record<string, EmployeeWorkPeriod>): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

function sortByPeriodDesc(a: EmployeeWorkPeriod, b: EmployeeWorkPeriod): number {
  return b.period.localeCompare(a.period);
}

export function listAllWorkPeriods(): EmployeeWorkPeriod[] {
  const stored = readStore();
  const merged = new Map<string, EmployeeWorkPeriod>();
  for (const period of seedWorkPeriods) merged.set(period.id, period);
  for (const period of Object.values(stored)) merged.set(period.id, period);
  return Array.from(merged.values()).sort(sortByPeriodDesc);
}

export function listWorkPeriodsByEmployee(employeeId: string): EmployeeWorkPeriod[] {
  return listAllWorkPeriods().filter((period) => period.employeeId === employeeId);
}

export function getWorkPeriod(id: string): EmployeeWorkPeriod | null {
  const stored = readStore();
  if (stored[id]) return stored[id];
  return seedWorkPeriods.find((period) => period.id === id) ?? null;
}

export function findWorkPeriod(employeeId: string, period: string): EmployeeWorkPeriod | null {
  return (
    listAllWorkPeriods().find((p) => p.employeeId === employeeId && p.period === period) ?? null
  );
}

export function saveWorkPeriod(workPeriod: EmployeeWorkPeriod): void {
  const store = readStore();
  store[workPeriod.id] = workPeriod;
  writeStore(store);
}

export function createWorkPeriodId(): string {
  return createId();
}

/**
 * Single source of truth for assembling a V2 EmployeeWorkPeriod from
 * an Employee's current snapshot (Demo-Ready 008C §43) — used by both
 * the individual employee screen and the Frequência overview so a
 * period is never assembled two different ways. Idempotent: if a
 * period already exists for this employeeId+period, it is returned
 * unchanged instead of creating a duplicate (Demo-Ready 008C §44).
 */
export function createWorkPeriodForEmployee(employee: Employee, period: string): EmployeeWorkPeriod {
  const existing = findWorkPeriod(employee.id, period);
  if (existing) return existing;

  const now = todayIso();
  const workPeriod: EmployeeWorkPeriod = {
    id: createWorkPeriodId(),
    employeeId: employee.id,
    period,
    employmentTypeSnapshot: employee.employmentType,
    paymentModelSnapshot: employee.paymentModel,
    baseSalarySnapshot: employee.paymentModel === "monthly" ? employee.baseSalary : 0,
    dailyRateSnapshot: employee.paymentModel === "daily" ? employee.dailyRate : undefined,
    workDaysSnapshot: employee.paymentModel === "monthly" ? employee.workDays : undefined,
    attendanceEntries: [],
    manualAdjustment: 0,
    createdAt: now,
    updatedAt: now,
  };
  saveWorkPeriod(workPeriod);
  return workPeriod;
}
