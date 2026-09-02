/**
 * Prototype browser persistence for GoodsReceipt. Layered on top of
 * seed data in `src/mocks/goods-receipts.ts`. Pure persistence —
 * invariants (order/item linkage, over-receipt, atomicity) live in
 * `goods-receipt.ts`.
 */

import { goodsReceipts as seedGoodsReceipts } from "@/mocks/goods-receipts";
import type { GoodsReceipt } from "../types";

const STORAGE_KEY = "obrafacil:goods-receipts";
const DELETED_KEY = "obrafacil:goods-receipts:deleted";

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `goods-receipt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function readStore(): Record<string, GoodsReceipt> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, GoodsReceipt>) : {};
  } catch {
    return {};
  }
}

function writeStore(store: Record<string, GoodsReceipt>): void {
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

function sortByReceivedAtAsc(a: GoodsReceipt, b: GoodsReceipt): number {
  return a.receivedAt.localeCompare(b.receivedAt) || a.createdAt.localeCompare(b.createdAt);
}

export function listGoodsReceipts(): GoodsReceipt[] {
  const stored = readStore();
  const deleted = readDeleted();
  const merged = new Map<string, GoodsReceipt>();
  for (const receipt of seedGoodsReceipts) {
    if (!deleted.has(receipt.id)) merged.set(receipt.id, receipt);
  }
  for (const receipt of Object.values(stored)) {
    if (!deleted.has(receipt.id)) merged.set(receipt.id, receipt);
  }
  return Array.from(merged.values()).sort(sortByReceivedAtAsc);
}

export function listGoodsReceiptsByPurchaseOrder(purchaseOrderId: string): GoodsReceipt[] {
  return listGoodsReceipts().filter((receipt) => receipt.purchaseOrderId === purchaseOrderId);
}

export function getGoodsReceipt(id: string): GoodsReceipt | null {
  const stored = readStore();
  if (stored[id]) return stored[id];
  if (readDeleted().has(id)) return null;
  return seedGoodsReceipts.find((receipt) => receipt.id === id) ?? null;
}

export function saveGoodsReceipt(receipt: GoodsReceipt): void {
  const store = readStore();
  store[receipt.id] = receipt;
  writeStore(store);
}

export function deleteGoodsReceipt(id: string): void {
  const store = readStore();
  delete store[id];
  writeStore(store);

  const deleted = readDeleted();
  deleted.add(id);
  writeDeleted(deleted);
}

export function createGoodsReceiptId(): string {
  return createId();
}
