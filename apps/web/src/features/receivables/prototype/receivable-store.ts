/**
 * Prototype browser persistence for Receivables (contas a receber).
 *
 * There is no backend yet, so created/edited/removed receivables are
 * kept in localStorage, layered on top of the seed data in
 * `src/mocks/receivables.ts`. Laravel + PostgreSQL will replace this
 * storage entirely once the real API exists.
 *
 * Mirrors `features/payables/prototype/payable-store.ts` structurally
 * (same read/write/deleted-tracking shape), but Receivable has no
 * origin tracking and no payment orchestration of its own — receipts
 * live in the separate `receipt-store.ts`.
 */

import { receivables as seedReceivables } from "@/mocks/receivables";
import type { Receivable } from "../types";

const STORAGE_KEY = "obrafacil:receivables";
const DELETED_KEY = "obrafacil:receivables:deleted";

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `receivable-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function readStore(): Record<string, Receivable> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, Receivable>) : {};
  } catch {
    return {};
  }
}

function writeStore(store: Record<string, Receivable>): void {
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

function sortByDueDateAsc(a: Receivable, b: Receivable): number {
  return a.dueDate.localeCompare(b.dueDate) || a.createdAt.localeCompare(b.createdAt);
}

export function listAllReceivables(): Receivable[] {
  const stored = readStore();
  const deleted = readDeleted();
  const merged = new Map<string, Receivable>();
  for (const receivable of seedReceivables) {
    if (!deleted.has(receivable.id)) merged.set(receivable.id, receivable);
  }
  for (const receivable of Object.values(stored)) {
    if (!deleted.has(receivable.id)) merged.set(receivable.id, receivable);
  }
  return Array.from(merged.values()).sort(sortByDueDateAsc);
}

export function listReceivablesByProject(projectId: string): Receivable[] {
  return listAllReceivables().filter((receivable) => receivable.projectId === projectId);
}

export function listReceivablesByCustomer(customerId: string): Receivable[] {
  return listAllReceivables().filter((receivable) => receivable.customerId === customerId);
}

export function getReceivable(id: string): Receivable | null {
  const stored = readStore();
  if (stored[id]) return stored[id];
  if (readDeleted().has(id)) return null;
  return seedReceivables.find((receivable) => receivable.id === id) ?? null;
}

export function saveReceivable(receivable: Receivable): void {
  const store = readStore();
  store[receivable.id] = receivable;
  writeStore(store);
}

export function deleteReceivable(id: string): void {
  const store = readStore();
  delete store[id];
  writeStore(store);

  const deleted = readDeleted();
  deleted.add(id);
  writeDeleted(deleted);
}

export function createReceivableId(): string {
  return createId();
}
