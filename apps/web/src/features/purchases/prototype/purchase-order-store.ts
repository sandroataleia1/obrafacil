/**
 * Prototype browser persistence for PurchaseOrder. Layered on top of
 * seed data in `src/mocks/purchase-orders.ts`. This store only
 * persists — invariants and state-transition rules live in
 * `purchase-order.ts`, not here (mirrors `receivable-store.ts` vs
 * `receivable.ts`).
 */

import { purchaseOrders as seedPurchaseOrders } from "@/mocks/purchase-orders";
import type { PurchaseOrder } from "../types";

const STORAGE_KEY = "obrafacil:purchase-orders";
const DELETED_KEY = "obrafacil:purchase-orders:deleted";

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `purchase-order-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function readStore(): Record<string, PurchaseOrder> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, PurchaseOrder>) : {};
  } catch {
    return {};
  }
}

function writeStore(store: Record<string, PurchaseOrder>): void {
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

function sortByOrderDateDesc(a: PurchaseOrder, b: PurchaseOrder): number {
  return b.orderDate.localeCompare(a.orderDate) || b.createdAt.localeCompare(a.createdAt);
}

export function listPurchaseOrders(): PurchaseOrder[] {
  const stored = readStore();
  const deleted = readDeleted();
  const merged = new Map<string, PurchaseOrder>();
  for (const purchaseOrder of seedPurchaseOrders) {
    if (!deleted.has(purchaseOrder.id)) merged.set(purchaseOrder.id, purchaseOrder);
  }
  for (const purchaseOrder of Object.values(stored)) {
    if (!deleted.has(purchaseOrder.id)) merged.set(purchaseOrder.id, purchaseOrder);
  }
  return Array.from(merged.values()).sort(sortByOrderDateDesc);
}

export function listPurchaseOrdersByProject(projectId: string): PurchaseOrder[] {
  return listPurchaseOrders().filter((purchaseOrder) => purchaseOrder.projectId === projectId);
}

export function listPurchaseOrdersBySupplier(supplierId: string): PurchaseOrder[] {
  return listPurchaseOrders().filter((purchaseOrder) => purchaseOrder.supplierId === supplierId);
}

export function getPurchaseOrder(id: string): PurchaseOrder | null {
  const stored = readStore();
  if (stored[id]) return stored[id];
  if (readDeleted().has(id)) return null;
  return seedPurchaseOrders.find((purchaseOrder) => purchaseOrder.id === id) ?? null;
}

export function savePurchaseOrder(purchaseOrder: PurchaseOrder): void {
  const store = readStore();
  store[purchaseOrder.id] = purchaseOrder;
  writeStore(store);
}

export function deletePurchaseOrder(id: string): void {
  const store = readStore();
  delete store[id];
  writeStore(store);

  const deleted = readDeleted();
  deleted.add(id);
  writeDeleted(deleted);
}

export function createPurchaseOrderId(): string {
  return createId();
}
