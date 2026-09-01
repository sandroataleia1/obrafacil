/**
 * Prototype browser persistence for EmployeePeriodAllocation (custo
 * de mão de obra apropriado a uma Obra).
 *
 * There is no backend yet, so created/edited/removed allocations are
 * kept in localStorage. Laravel + PostgreSQL will replace this
 * storage entirely once the real API exists.
 *
 * No seed data: this feature starts empty, layered on top of nothing.
 *
 * Domain rules (uniqueness, amount limits, ProjectCost materialization)
 * live in `period-allocation.ts`, not here — this file is pure CRUD,
 * same split already used by every other prototype store in this app.
 */

import type { EmployeePeriodAllocation } from "../types";

const STORAGE_KEY = "obrafacil:employee-period-allocations";

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `allocation-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function readStore(): Record<string, EmployeePeriodAllocation> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, EmployeePeriodAllocation>) : {};
  } catch {
    return {};
  }
}

function writeStore(store: Record<string, EmployeePeriodAllocation>): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

export function listAllocations(): EmployeePeriodAllocation[] {
  return Object.values(readStore()).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function listAllocationsForPeriod(employeePeriodId: string): EmployeePeriodAllocation[] {
  return listAllocations().filter((allocation) => allocation.employeePeriodId === employeePeriodId);
}

export function findAllocation(
  employeePeriodId: string,
  projectId: string
): EmployeePeriodAllocation | null {
  return (
    listAllocations().find(
      (allocation) =>
        allocation.employeePeriodId === employeePeriodId && allocation.projectId === projectId
    ) ?? null
  );
}

export function getAllocation(id: string): EmployeePeriodAllocation | null {
  const store = readStore();
  return store[id] ?? null;
}

export function saveAllocation(allocation: EmployeePeriodAllocation): void {
  const store = readStore();
  store[allocation.id] = allocation;
  writeStore(store);
}

export function deleteAllocation(id: string): void {
  const store = readStore();
  delete store[id];
  writeStore(store);
}

export function createAllocationId(): string {
  return createId();
}
