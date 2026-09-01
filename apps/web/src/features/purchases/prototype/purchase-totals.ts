/**
 * Pure derived totals for PurchaseOrder/PurchaseOrderItem, plus the
 * "how much of a Material has been purchased for this Obra" figure
 * that bridges into `MaterialRequirement` planning. Nothing here is
 * persisted; `PurchaseOrder`/`PurchaseOrderItem` never store a
 * `total` field.
 */

import { toCents } from "@/lib/currency";
import { toQuantityUnits } from "@/lib/quantity";
import type { PurchaseOrder, PurchaseOrderItem } from "../types";

export function calculatePurchaseItemTotal(item: PurchaseOrderItem): number {
  return toCents(item.quantity * item.unitPrice) / 100;
}

export function calculatePurchaseOrderTotal(items: PurchaseOrderItem[]): number {
  const totalCents = items.reduce((sum, item) => sum + toCents(calculatePurchaseItemTotal(item)), 0);
  return totalCents / 100;
}

export interface MaterialPlanning {
  required: number;
  purchased: number;
  remainingToBuy: number;
  purchasedExcess: number;
}

/**
 * "Purchased" only counts items belonging to `ordered` PurchaseOrders
 * — a `draft` order is not yet a commitment, and a `cancelled` order
 * never happened. This will be refined in Task 041: once GoodsReceipt
 * exists, a cancelled order that already had physical deliveries must
 * keep the received quantity in history instead of dropping it to
 * zero — not implemented now because GoodsReceipt doesn't exist yet.
 */
export function calculateMaterialPlanning(
  requiredQuantity: number,
  purchaseOrders: PurchaseOrder[],
  items: PurchaseOrderItem[],
  materialId: string
): MaterialPlanning {
  const orderedIds = new Set(
    purchaseOrders
      .filter((purchaseOrder) => purchaseOrder.commercialStatus === "ordered")
      .map((purchaseOrder) => purchaseOrder.id)
  );

  const purchasedUnits = items
    .filter((item) => item.materialId === materialId && orderedIds.has(item.purchaseOrderId))
    .reduce((sum, item) => sum + toQuantityUnits(item.quantity), 0);

  const requiredUnits = toQuantityUnits(requiredQuantity);
  const remainingToBuyUnits = Math.max(requiredUnits - purchasedUnits, 0);
  const purchasedExcessUnits = Math.max(purchasedUnits - requiredUnits, 0);

  return {
    required: requiredQuantity,
    purchased: purchasedUnits / 1000,
    remainingToBuy: remainingToBuyUnits / 1000,
    purchasedExcess: purchasedExcessUnits / 1000,
  };
}
