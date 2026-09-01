/**
 * Prototype browser persistence for PurchaseOrderItem. Layered on top
 * of seed data in `src/mocks/purchase-order-items.ts`. Pure
 * persistence — invariants (materialId uniqueness per order, quantity/
 * price validation) live in `purchase-order.ts`.
 */

import { purchaseOrderItems as seedPurchaseOrderItems } from "@/mocks/purchase-order-items";
import type { PurchaseOrderItem } from "../types";

const STORAGE_KEY = "obrafacil:purchase-order-items";
const DELETED_KEY = "obrafacil:purchase-order-items:deleted";

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `purchase-order-item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function readStore(): Record<string, PurchaseOrderItem> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, PurchaseOrderItem>) : {};
  } catch {
    return {};
  }
}

function writeStore(store: Record<string, PurchaseOrderItem>): void {
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

function listAllPurchaseOrderItems(): PurchaseOrderItem[] {
  const stored = readStore();
  const deleted = readDeleted();
  const merged = new Map<string, PurchaseOrderItem>();
  for (const item of seedPurchaseOrderItems) {
    if (!deleted.has(item.id)) merged.set(item.id, item);
  }
  for (const item of Object.values(stored)) {
    if (!deleted.has(item.id)) merged.set(item.id, item);
  }
  return Array.from(merged.values());
}

export function listItemsByPurchaseOrder(purchaseOrderId: string): PurchaseOrderItem[] {
  return listAllPurchaseOrderItems().filter((item) => item.purchaseOrderId === purchaseOrderId);
}

export function listItemsByPurchaseOrders(purchaseOrderIds: string[]): PurchaseOrderItem[] {
  const ids = new Set(purchaseOrderIds);
  return listAllPurchaseOrderItems().filter((item) => ids.has(item.purchaseOrderId));
}

export function listItemsByMaterial(materialId: string): PurchaseOrderItem[] {
  return listAllPurchaseOrderItems().filter((item) => item.materialId === materialId);
}

export function findItemByMaterial(
  purchaseOrderId: string,
  materialId: string
): PurchaseOrderItem | null {
  return (
    listItemsByPurchaseOrder(purchaseOrderId).find((item) => item.materialId === materialId) ??
    null
  );
}

export function getPurchaseOrderItem(id: string): PurchaseOrderItem | null {
  const stored = readStore();
  if (stored[id]) return stored[id];
  if (readDeleted().has(id)) return null;
  return seedPurchaseOrderItems.find((item) => item.id === id) ?? null;
}

export function savePurchaseOrderItem(item: PurchaseOrderItem): void {
  const store = readStore();
  store[item.id] = item;
  writeStore(store);
}

export function deletePurchaseOrderItem(id: string): void {
  const store = readStore();
  delete store[id];
  writeStore(store);

  const deleted = readDeleted();
  deleted.add(id);
  writeDeleted(deleted);
}

export function deleteItemsByPurchaseOrder(purchaseOrderId: string): void {
  for (const item of listItemsByPurchaseOrder(purchaseOrderId)) {
    deletePurchaseOrderItem(item.id);
  }
}

export function createPurchaseOrderItemId(): string {
  return createId();
}
