/**
 * Materials facts for the analytics layer (Demo-Ready 010A). Reuses
 * `calculateMaterialPlanning` (from
 * `features/purchases/prototype/purchase-totals.ts`) per material
 * requirement — never re-derives purchased/received/consumed.
 *
 * Deliberately exposes only counts of pending LINES, never a summed
 * quantity across materials of different units (Demo-Ready 010A §20).
 * Pure function only — no store reads, no writes.
 */

import { calculateMaterialPlanning } from "@/features/purchases/prototype/purchase-totals";
import type { GoodsReceiptItem, PurchaseOrder, PurchaseOrderItem } from "@/features/purchases/types";
import type { MaterialConsumption, MaterialRequirement } from "@/features/materials/types";
import type { ProjectMaterialsFacts } from "./types";

export function buildProjectMaterialsFacts(
  requirements: MaterialRequirement[],
  purchaseOrders: PurchaseOrder[],
  purchaseOrderItems: PurchaseOrderItem[],
  goodsReceiptItems: GoodsReceiptItem[],
  consumptions: MaterialConsumption[]
): ProjectMaterialsFacts {
  let pendingToBuyCount = 0;
  let pendingToReceiveCount = 0;

  for (const requirement of requirements) {
    const planning = calculateMaterialPlanning(
      requirement.requiredQuantity,
      purchaseOrders,
      purchaseOrderItems,
      goodsReceiptItems,
      consumptions,
      requirement.materialId
    );
    if (planning.remainingToBuy !== null && planning.remainingToBuy > 0) pendingToBuyCount += 1;
    if (planning.remainingToReceive > 0) pendingToReceiveCount += 1;
  }

  return { pendingToBuyCount, pendingToReceiveCount };
}
