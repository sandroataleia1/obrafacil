/**
 * Prototype browser persistence for monthly work control
 * (EmployeeWorkPeriod).
 *
 * There is no backend yet, so created/edited periods are kept in
 * localStorage, layered on top of the seed data in
 * `src/mocks/employee-work-periods.ts`. Laravel + PostgreSQL will
 * replace this storage entirely once the real API exists.
 */

import { employeeWorkPeriods as seedWorkPeriods } from "@/mocks/employee-work-periods";
import type { EmployeeWorkPeriod } from "../types";

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
