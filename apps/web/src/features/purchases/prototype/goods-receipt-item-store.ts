/**
 * Prototype browser persistence for GoodsReceiptItem. Layered on top
 * of seed data in `src/mocks/goods-receipt-items.ts`. Pure persistence
 * — invariants live in `goods-receipt.ts`.
 */

import { goodsReceiptItems as seedGoodsReceiptItems } from "@/mocks/goods-receipt-items";
import type { GoodsReceiptItem } from "../types";
import { listItemsByPurchaseOrder } from "./purchase-order-item-store";

const STORAGE_KEY = "obrafacil:goods-receipt-items";
const DELETED_KEY = "obrafacil:goods-receipt-items:deleted";

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `goods-receipt-item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function readStore(): Record<string, GoodsReceiptItem> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, GoodsReceiptItem>) : {};
  } catch {
    return {};
  }
}

function writeStore(store: Record<string, GoodsReceiptItem>): void {
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

function listAllGoodsReceiptItems(): GoodsReceiptItem[] {
  const stored = readStore();
  const deleted = readDeleted();
  const merged = new Map<string, GoodsReceiptItem>();
  for (const item of seedGoodsReceiptItems) {
    if (!deleted.has(item.id)) merged.set(item.id, item);
  }
  for (const item of Object.values(stored)) {
    if (!deleted.has(item.id)) merged.set(item.id, item);
  }
  return Array.from(merged.values());
}

export function listItemsByGoodsReceipt(goodsReceiptId: string): GoodsReceiptItem[] {
  return listAllGoodsReceiptItems().filter((item) => item.goodsReceiptId === goodsReceiptId);
}

export function listReceiptItemsByPurchaseOrderItem(purchaseOrderItemId: string): GoodsReceiptItem[] {
  return listAllGoodsReceiptItems().filter(
    (item) => item.purchaseOrderItemId === purchaseOrderItemId
  );
}

/** All GoodsReceiptItems belonging to any item of the given PurchaseOrder. */
export function listReceiptItemsByPurchaseOrder(purchaseOrderId: string): GoodsReceiptItem[] {
  const orderItemIds = new Set(
    listItemsByPurchaseOrder(purchaseOrderId).map((orderItem) => orderItem.id)
  );
  return listAllGoodsReceiptItems().filter((item) => orderItemIds.has(item.purchaseOrderItemId));
}

export function saveGoodsReceiptItem(item: GoodsReceiptItem): void {
  const store = readStore();
  store[item.id] = item;
  writeStore(store);
}

export function deleteGoodsReceiptItem(id: string): void {
  const store = readStore();
  delete store[id];
  writeStore(store);

  const deleted = readDeleted();
  deleted.add(id);
  writeDeleted(deleted);
}

export function deleteItemsByGoodsReceipt(goodsReceiptId: string): void {
  for (const item of listItemsByGoodsReceipt(goodsReceiptId)) {
    deleteGoodsReceiptItem(item.id);
  }
}

export function createGoodsReceiptItemId(): string {
  return createId();
}
