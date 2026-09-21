/**
 * SUPPLY-FRONTEND-01C §41. Bridges the real API `PurchaseOrder`/
 * `PurchaseOrderItem`/`GoodsReceiptItem` shapes into the minimal legacy
 * shape `purchase-totals.ts#calculateMaterialPlanning` still expects —
 * used ONLY by that transitional calculator (ProjectRequirementList,
 * ProjectDetail, Analytics, Stock's supply-metrics). Never converts API
 * data back into a second persisted domain model; these are pure,
 * stateless mapping functions called fresh on every render.
 */

import { purchaseDecimalForLegacyPlanning } from "./purchase-decimal";
import type {
  LegacyGoodsReceiptItem,
  LegacyPurchaseOrder,
  LegacyPurchaseOrderItem,
} from "./prototype/legacy-types";
import type { PurchaseOrder } from "./types";

export function purchaseOrderForLegacyPlanning(order: PurchaseOrder): LegacyPurchaseOrder {
  return { id: order.id, commercialStatus: order.commercial_status };
}

export function purchaseItemForLegacyPlanning(order: PurchaseOrder): LegacyPurchaseOrderItem[] {
  return order.items.map((item) => ({
    id: item.id,
    purchaseOrderId: order.id,
    materialId: item.material.id,
    quantity: purchaseDecimalForLegacyPlanning(item.quantity),
  }));
}

export function receiptItemsForLegacyPlanning(order: PurchaseOrder): LegacyGoodsReceiptItem[] {
  return order.goods_receipts.flatMap((receipt) =>
    receipt.items.map((line) => ({
      purchaseOrderItemId: line.purchase_order_item_id,
      quantity: purchaseDecimalForLegacyPlanning(line.quantity),
    }))
  );
}
