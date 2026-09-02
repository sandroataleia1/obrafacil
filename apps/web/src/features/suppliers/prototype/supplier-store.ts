/**
 * Prototype browser persistence for Fornecedores (suppliers).
 *
 * There is no backend yet, so created/edited/removed suppliers are
 * kept in localStorage, layered on top of the seed data in
 * `src/mocks/suppliers.ts`. Laravel + PostgreSQL will replace this
 * storage entirely once the real API exists.
 *
 * `deleteSupplier()` stays unconditional (used internally once a
 * removal is already known to be safe). `removeSupplier()` is the
 * guarded entry point — PurchaseOrder now exists, so a Supplier with
 * any PurchaseOrder can no longer be deleted, mirroring
 * `removeReceivable`'s Receipt guard.
 */

import { suppliers as seedSuppliers } from "@/mocks/suppliers";
import { listPurchaseOrdersBySupplier } from "@/features/purchases/prototype/purchase-order-store";
import type { Supplier } from "../types";

const STORAGE_KEY = "obrafacil:suppliers";
const DELETED_KEY = "obrafacil:suppliers:deleted";

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `supplier-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function readStore(): Record<string, Supplier> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, Supplier>) : {};
  } catch {
    return {};
  }
}

function writeStore(store: Record<string, Supplier>): void {
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

function sortByNameAsc(a: Supplier, b: Supplier): number {
  return a.name.localeCompare(b.name, "pt-BR");
}

export function listSuppliers(): Supplier[] {
  const stored = readStore();
  const deleted = readDeleted();
  const merged = new Map<string, Supplier>();
  for (const supplier of seedSuppliers) {
    if (!deleted.has(supplier.id)) merged.set(supplier.id, supplier);
  }
  for (const supplier of Object.values(stored)) {
    if (!deleted.has(supplier.id)) merged.set(supplier.id, supplier);
  }
  return Array.from(merged.values()).sort(sortByNameAsc);
}

export function listActiveSuppliers(): Supplier[] {
  return listSuppliers().filter((supplier) => supplier.status === "active");
}

export function getSupplier(id: string): Supplier | null {
  const stored = readStore();
  if (stored[id]) return stored[id];
  if (readDeleted().has(id)) return null;
  return seedSuppliers.find((supplier) => supplier.id === id) ?? null;
}

export function saveSupplier(supplier: Supplier): void {
  const store = readStore();
  store[supplier.id] = supplier;
  writeStore(store);
}

export function deleteSupplier(id: string): void {
  const store = readStore();
  delete store[id];
  writeStore(store);

  const deleted = readDeleted();
  deleted.add(id);
  writeDeleted(deleted);
}

export type SupplierResult = { ok: true } | { ok: false; error: string };

export function removeSupplier(supplier: Supplier): SupplierResult {
  const purchaseOrdersCount = listPurchaseOrdersBySupplier(supplier.id).length;
  if (purchaseOrdersCount > 0) {
    return {
      ok: false,
      error: "Este fornecedor possui compras vinculadas e não pode ser excluído.",
    };
  }
  deleteSupplier(supplier.id);
  return { ok: true };
}

export function createSupplierId(): string {
  return createId();
}
