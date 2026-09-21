/**
 * SUPPLY-FRONTEND-01C — the OLD prototype PurchaseOrder/PurchaseOrderItem/
 * GoodsReceipt/GoodsReceiptItem shapes (camelCase, numeric quantity/price,
 * localStorage-backed), moved out of `../types.ts` so that file can become
 * the real `/api/v1/purchase-orders` contract. Mirrors the exact same
 * transitional pattern already used for `MaterialRequirement` in
 * `features/materials/prototype/legacy-types.ts` (SUPPLY-FRONTEND-01B).
 *
 * ONLY `purchase-totals.ts`'s pure `calculateMaterialPlanning()` still
 * uses this shape — never a real Purchase/Receipt screen. Real API
 * `PurchaseOrder`/`PurchaseOrderItem`/`GoodsReceiptItem` objects are
 * bridged into this shape transiently via
 * `../purchase-planning-adapter.ts`, only for that one calculator.
 */

export type LegacyPurchaseOrderCommercialStatus = "draft" | "ordered" | "cancelled";

export interface LegacyPurchaseOrder {
  id: string;
  commercialStatus: LegacyPurchaseOrderCommercialStatus;
}

export interface LegacyPurchaseOrderItem {
  id: string;
  purchaseOrderId: string;
  materialId: string;
  quantity: number;
}

export interface LegacyGoodsReceiptItem {
  purchaseOrderItemId: string;
  quantity: number;
}
