/**
 * Pure fulfillment derivation — never persisted. `commercialStatus`
 * (draft/ordered/cancelled) is a user decision; fulfillment
 * (not_received/partial/received) is entirely computed from
 * GoodsReceiptItem history and is a completely separate axis (see
 * `features/purchases/types.ts`).
 *
 * Per-item fulfillment never sums quantities across different
 * Materials/units — it only ever compares a single PurchaseOrderItem
 * against its own GoodsReceiptItems. `calculatePurchaseOrderFulfillment`
 * derives the order-level status purely from each item's individual
 * state (not_received/received for all items, else partial) — never
 * from summing heterogeneous quantities (e.g. "100 sc + 5 m³" is never
 * added into "105 units").
 */

import { toQuantityUnits } from "@/lib/quantity";
import type { GoodsReceiptItem, PurchaseOrderItem } from "../types";

export type ItemFulfillmentState = "not_received" | "partial" | "received";
export type PurchaseFulfillmentStatus = "not_received" | "partial" | "received";

export interface ItemFulfillment {
  receivedQuantity: number;
  remainingQuantity: number;
  state: ItemFulfillmentState;
}

export function calculateItemFulfillment(
  item: PurchaseOrderItem,
  receiptItems: GoodsReceiptItem[]
): ItemFulfillment {
  const receivedUnits = receiptItems
    .filter((receiptItem) => receiptItem.purchaseOrderItemId === item.id)
    .reduce((sum, receiptItem) => sum + toQuantityUnits(receiptItem.quantity), 0);
  const orderedUnits = toQuantityUnits(item.quantity);
  const remainingUnits = Math.max(orderedUnits - receivedUnits, 0);

  let state: ItemFulfillmentState;
  if (receivedUnits <= 0) {
    state = "not_received";
  } else if (receivedUnits >= orderedUnits) {
    state = "received";
  } else {
    state = "partial";
  }

  return {
    receivedQuantity: receivedUnits / 1000,
    remainingQuantity: remainingUnits / 1000,
    state,
  };
}

export function calculatePurchaseOrderFulfillment(
  items: PurchaseOrderItem[],
  receiptItems: GoodsReceiptItem[]
): PurchaseFulfillmentStatus {
  if (items.length === 0) return "not_received";
  const states = items.map((item) => calculateItemFulfillment(item, receiptItems).state);
  if (states.every((state) => state === "not_received")) return "not_received";
  if (states.every((state) => state === "received")) return "received";
  return "partial";
}
