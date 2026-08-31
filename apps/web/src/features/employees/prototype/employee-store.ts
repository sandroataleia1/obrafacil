/**
 * Prototype browser persistence for Equipe (Employee).
 *
 * There is no backend yet, so created/edited employees are kept in
 * localStorage, layered on top of the seed data in
 * `src/mocks/employees.ts`. Laravel + PostgreSQL will replace this
 * storage entirely once the real API exists.
 *
 * There is no delete: an employee is marked "inactive" instead, so
 * their historical work periods stay intact and reachable.
 */

import { employees as seedEmployees } from "@/mocks/employees";
import type { Employee } from "../types";

const STORAGE_KEY = "obrafacil:employees";

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `employee-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function readStore(): Record<string, Employee> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, Employee>) : {};
  } catch {
    return {};
  }
}

function writeStore(store: Record<string, Employee>): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

export function listAllEmployees(): Employee[] {
  const stored = readStore();
  const merged = new Map<string, Employee>();
  for (const employee of seedEmployees) merged.set(employee.id, employee);
  for (const employee of Object.values(stored)) merged.set(employee.id, employee);
  return Array.from(merged.values()).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

export function getEmployee(id: string): Employee | null {
  const stored = readStore();
  if (stored[id]) return stored[id];
  return seedEmployees.find((employee) => employee.id === id) ?? null;
}

export function saveEmployee(employee: Employee): void {
  const store = readStore();
  store[employee.id] = employee;
  writeStore(store);
}

export function createEmployeeId(): string {
  return createId();
}
