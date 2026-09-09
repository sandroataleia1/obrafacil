/**
 * Prototype browser persistence for StockAdjustment. Layered on top of
 * seed data in `src/mocks/stock-adjustments.ts`, mirroring every other
 * store in this codebase (e.g. `features/receivables/prototype/
 * receivable-store.ts`): localStorage plus a deleted-id tombstone set.
 * Pure persistence — invariants (balance check, Project/Material
 * existence) live in `stock.ts`.
 */

import { stockAdjustments as seedStockAdjustments } from "@/mocks/stock-adjustments";
import { demoDataEnabled } from "@/lib/pilot-config";
import type { StockAdjustment } from "../types";

const STORAGE_KEY = "obrafacil:stock-adjustments";
const DELETED_KEY = "obrafacil:stock-adjustments:deleted";

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `stock-adjustment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function readStore(): Record<string, StockAdjustment> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, StockAdjustment>) : {};
  } catch {
    return {};
  }
}

function writeStore(store: Record<string, StockAdjustment>): void {
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

export function listAllStockAdjustments(): StockAdjustment[] {
  const stored = readStore();
  const deleted = readDeleted();
  const merged = new Map<string, StockAdjustment>();
  if (demoDataEnabled) {
    for (const adjustment of seedStockAdjustments) {
      if (!deleted.has(adjustment.id)) merged.set(adjustment.id, adjustment);
    }
  }
  for (const adjustment of Object.values(stored)) {
    if (!deleted.has(adjustment.id)) merged.set(adjustment.id, adjustment);
  }
  return Array.from(merged.values());
}

export function listStockAdjustmentsByProjectAndMaterial(
  projectId: string,
  materialId: string
): StockAdjustment[] {
  return listAllStockAdjustments().filter(
    (adjustment) => adjustment.projectId === projectId && adjustment.materialId === materialId
  );
}

export function saveStockAdjustment(adjustment: StockAdjustment): void {
  const store = readStore();
  store[adjustment.id] = adjustment;
  writeStore(store);
}

export function createStockAdjustmentId(): string {
  return createId();
}
