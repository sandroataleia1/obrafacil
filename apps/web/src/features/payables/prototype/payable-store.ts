/**
 * Prototype browser persistence for accounts payable (contas a pagar).
 *
 * There is no backend yet, so created/edited/removed payables are kept
 * in localStorage, layered on top of the seed data in
 * `src/mocks/payables.ts`. Laravel + PostgreSQL will replace this
 * storage entirely once the real API exists.
 */

import { payables as seedPayables } from "@/mocks/payables";
import type { Payable } from "../types";

const STORAGE_KEY = "obrafacil:payables";
const DELETED_KEY = "obrafacil:payables:deleted";

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `payable-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function readStore(): Record<string, Payable> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, Payable>) : {};
  } catch {
    return {};
  }
}

function writeStore(store: Record<string, Payable>): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

function readDeleted(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(DELETED_KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch {
    return new Set();
  }
}

function writeDeleted(ids: Set<string>): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(DELETED_KEY, JSON.stringify(Array.from(ids)));
}

function sortByDueDateAsc(a: Payable, b: Payable): number {
  return a.dueDate.localeCompare(b.dueDate) || a.createdAt.localeCompare(b.createdAt);
}

export function listAllPayables(): Payable[] {
  const stored = readStore();
  const deleted = readDeleted();
  const merged = new Map<string, Payable>();
  for (const payable of seedPayables) {
    if (!deleted.has(payable.id)) merged.set(payable.id, payable);
  }
  for (const payable of Object.values(stored)) {
    if (!deleted.has(payable.id)) merged.set(payable.id, payable);
  }
  return Array.from(merged.values()).sort(sortByDueDateAsc);
}

export function listPayablesByProject(projectId: string): Payable[] {
  return listAllPayables().filter((payable) => payable.projectId === projectId);
}

export function getPayable(id: string): Payable | null {
  const stored = readStore();
  if (stored[id]) return stored[id];
  if (readDeleted().has(id)) return null;
  return seedPayables.find((payable) => payable.id === id) ?? null;
}

export function savePayable(payable: Payable): void {
  const store = readStore();
  store[payable.id] = payable;
  writeStore(store);
}

export function deletePayable(id: string): void {
  const store = readStore();
  delete store[id];
  writeStore(store);

  const deleted = readDeleted();
  deleted.add(id);
  writeDeleted(deleted);
}

export function createPayableId(): string {
  return createId();
}
