/**
 * Prototype browser persistence for Receipts (recebimentos), kept in a
 * separate localStorage key from Receivables on purpose — a Receipt
 * has no screen of its own (see `types.ts`); it only ever gets
 * read/written through its owning Receivable's detail screen.
 */

import { receipts as seedReceipts } from "@/mocks/receipts";
import type { Receipt } from "../types";

const STORAGE_KEY = "obrafacil:receipts";
const DELETED_KEY = "obrafacil:receipts:deleted";

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `receipt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function readStore(): Record<string, Receipt> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, Receipt>) : {};
  } catch {
    return {};
  }
}

function writeStore(store: Record<string, Receipt>): void {
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

function sortByReceivedAtAsc(a: Receipt, b: Receipt): number {
  return a.receivedAt.localeCompare(b.receivedAt) || a.createdAt.localeCompare(b.createdAt);
}

function listAllReceipts(): Receipt[] {
  const stored = readStore();
  const deleted = readDeleted();
  const merged = new Map<string, Receipt>();
  for (const receipt of seedReceipts) {
    if (!deleted.has(receipt.id)) merged.set(receipt.id, receipt);
  }
  for (const receipt of Object.values(stored)) {
    if (!deleted.has(receipt.id)) merged.set(receipt.id, receipt);
  }
  return Array.from(merged.values());
}

export function listReceiptsByReceivable(receivableId: string): Receipt[] {
  return listAllReceipts()
    .filter((receipt) => receipt.receivableId === receivableId)
    .sort(sortByReceivedAtAsc);
}

export function getReceipt(id: string): Receipt | null {
  const stored = readStore();
  if (stored[id]) return stored[id];
  if (readDeleted().has(id)) return null;
  return seedReceipts.find((receipt) => receipt.id === id) ?? null;
}

export function saveReceipt(receipt: Receipt): void {
  const store = readStore();
  store[receipt.id] = receipt;
  writeStore(store);
}

export function deleteReceipt(id: string): void {
  const store = readStore();
  delete store[id];
  writeStore(store);

  const deleted = readDeleted();
  deleted.add(id);
  writeDeleted(deleted);
}

export function createReceiptId(): string {
  return createId();
}
