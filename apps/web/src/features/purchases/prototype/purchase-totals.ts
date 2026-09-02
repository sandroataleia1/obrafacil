/**
 * Pure derived totals for PurchaseOrder/PurchaseOrderItem, plus the
 * "how much of a Material has been purchased/received for this Obra"
 * figures that bridge into `MaterialRequirement` planning. Nothing
 * here is persisted; `PurchaseOrder`/`PurchaseOrderItem` never store a
 * `total` field, and none of these figures are stored on the
 * MaterialRequirement either.
 */

import { toCents } from "@/lib/currency";
import { toQuantityUnits } from "@/lib/quantity";
import type { MaterialConsumption } from "@/features/materials/types";
import type { GoodsReceiptItem, PurchaseOrder, PurchaseOrderItem } from "../types";

export function calculatePurchaseItemTotal(item: PurchaseOrderItem): number {
  return toCents(item.quantity * item.unitPrice) / 100;
}

export function calculatePurchaseOrderTotal(items: PurchaseOrderItem[]): number {
  const totalCents = items.reduce((sum, item) => sum + toCents(calculatePurchaseItemTotal(item)), 0);
  return totalCents / 100;
}

/**
 * `required`/`remainingToBuy`/`purchasedExcess`/`receivedExcess` are
 * `null` when the Material has no MaterialRequirement at this Project —
 * "não planejado" is a distinct state from "planejado como zero", so a
 * missing plan is never silently rendered as if it meant zero excess or
 * zero remaining. `purchased`/`received`/`consumed`/`available` are
 * always real numbers: they reflect physical/commercial fact regardless
 * of whether anyone ever planned for this Material.
 */
export interface MaterialPlanning {
  required: number | null;
  purchased: number;
  received: number;
  consumed: number;
  available: number;
  remainingToBuy: number | null;
  remainingToReceive: number;
  purchasedExcess: number | null;
  receivedExcess: number | null;
}

/**
 * Per-item contribution to "purchased" and "remaining to receive"
 * depends on the owning PurchaseOrder's `commercialStatus`:
 *
 * - `draft`: contributes 0 to both — not yet a real commitment.
 * - `ordered`: contributes its full `item.quantity` to `purchased`,
 *   and `max(item.quantity - receivedQuantity, 0)` to
 *   `remainingToReceive` — an open delivery expectation.
 * - `cancelled`: contributes only what was physically
 *   `receivedQuantity` to `purchased` (0 if nothing arrived before
 *   cancellation), and 0 to `remainingToReceive` — nothing is still
 *   expected. This is what makes the critical "cancel after partial
 *   delivery" case correct: 40 of 100 already received before
 *   cancelling stays counted as purchased/received; the other 60
 *   drops out of both "purchased" and "expected delivery" and goes
 *   back into `remainingToBuy` instead.
 *
 * `received` always sums every GoodsReceiptItem for the Material,
 * regardless of the owning order's current status — physical history
 * never disappears because a PurchaseOrder was later cancelled.
 */
export function calculateMaterialPlanning(
  requiredQuantity: number | null,
  purchaseOrders: PurchaseOrder[],
  items: PurchaseOrderItem[],
  receiptItems: GoodsReceiptItem[],
  consumptions: MaterialConsumption[],
  materialId: string
): MaterialPlanning {
  const orderById = new Map(purchaseOrders.map((purchaseOrder) => [purchaseOrder.id, purchaseOrder]));
  const materialItems = items.filter((item) => item.materialId === materialId);

  let purchasedUnits = 0;
  let receivedUnits = 0;
  let remainingToReceiveUnits = 0;

  for (const item of materialItems) {
    const order = orderById.get(item.purchaseOrderId);
    if (!order) continue;

    const itemReceivedUnits = receiptItems
      .filter((receiptItem) => receiptItem.purchaseOrderItemId === item.id)
      .reduce((sum, receiptItem) => sum + toQuantityUnits(receiptItem.quantity), 0);
    receivedUnits += itemReceivedUnits;

    if (order.commercialStatus === "ordered") {
      const itemOrderedUnits = toQuantityUnits(item.quantity);
      purchasedUnits += itemOrderedUnits;
      remainingToReceiveUnits += Math.max(itemOrderedUnits - itemReceivedUnits, 0);
    } else if (order.commercialStatus === "cancelled") {
      purchasedUnits += itemReceivedUnits;
    }
    // draft contributes 0 to both purchased and remainingToReceive.
  }

  const consumedUnits = consumptions
    .filter((consumption) => consumption.materialId === materialId)
    .reduce((sum, consumption) => sum + toQuantityUnits(consumption.quantity), 0);
  const availableUnits = Math.max(receivedUnits - consumedUnits, 0);

  const requiredUnits = requiredQuantity === null ? null : toQuantityUnits(requiredQuantity);
  const remainingToBuyUnits = requiredUnits === null ? null : Math.max(requiredUnits - purchasedUnits, 0);
  const purchasedExcessUnits =
    requiredUnits === null ? null : Math.max(purchasedUnits - requiredUnits, 0);
  const receivedExcessUnits = requiredUnits === null ? null : Math.max(receivedUnits - requiredUnits, 0);

  return {
    required: requiredQuantity,
    purchased: purchasedUnits / 1000,
    received: receivedUnits / 1000,
    consumed: consumedUnits / 1000,
    available: availableUnits / 1000,
    remainingToBuy: remainingToBuyUnits === null ? null : remainingToBuyUnits / 1000,
    remainingToReceive: remainingToReceiveUnits / 1000,
    purchasedExcess: purchasedExcessUnits === null ? null : purchasedExcessUnits / 1000,
    receivedExcess: receivedExcessUnits === null ? null : receivedExcessUnits / 1000,
  };
}
