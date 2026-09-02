/**
 * UI/prototype models for Pedidos de Compra (PurchaseOrder).
 *
 * `PurchaseOrder` is the commercial decision ("we're buying these
 * items from this Supplier for this Obra"). It stores nothing
 * derivable from other entities: no `supplierName`/`projectName`
 * snapshot (resolved via `supplierId`/`projectId` at read time, same
 * pattern as `Payable`/`Receivable`), no `total` (derived — see
 * `prototype/purchase-totals.ts`), and nothing that depends on
 * entities that don't exist yet in this prototype
 * (`fulfillmentStatus`/`receivedQuantity` belong to GoodsReceipt,
 * `payableId`/`projectCostId` belong to the future Purchase→Payable
 * integration).
 *
 * `commercialStatus` is the only status stored here — a deliberate
 * user decision (draft/ordered/cancelled), not something derived from
 * dates or quantities. It is NOT the same concept as a future
 * "fulfillment status" (not_received/partial/received), which will be
 * entirely derived from GoodsReceipt once that entity exists — mixing
 * the two into one enum would force impossible states (e.g. a
 * cancelled order that is somehow "partially received").
 *
 * `projectId` and `supplierId` are both required — this prototype
 * intentionally has no central/administrative stock, so every
 * purchase belongs to exactly one Obra (see Task 038 discovery), and
 * every purchase has exactly one Supplier (no multi-supplier
 * quotation in this v1).
 *
 * `PurchaseOrderItem.materialId` is required — no ad-hoc item without
 * a catalog Material in this v1, so every purchase can safely
 * participate in future received/available/consumed/planned figures.
 * `description` is a snapshot, pre-filled from `Material.name` at the
 * moment the item is added but editable afterward (e.g. "Cimento
 * CP-II 50kg Votoran" as a commercial specification), independent of
 * the catalog Material's own name. `unit` is a mandatory snapshot of
 * `Material.defaultUnit` at that same moment — even though a Material
 * with any MaterialRequirement already has its `defaultUnit` frozen
 * (see `features/materials/prototype/material.ts`), the snapshot still
 * matters for historical integrity independent of that separate rule.
 *
 * NOT the definitive domain contract for the future API — only exists
 * to validate the product experience with mocked/local data.
 */

import type { MaterialUnit } from "@/features/materials/types";

export type PurchaseOrderCommercialStatus = "draft" | "ordered" | "cancelled";

export const PURCHASE_ORDER_STATUS_LABEL: Record<PurchaseOrderCommercialStatus, string> = {
  draft: "Rascunho",
  ordered: "Pedido realizado",
  cancelled: "Cancelado",
};

export const PURCHASE_ORDER_STATUS_FILTERS = ["all", "draft", "ordered", "cancelled"] as const;
export type PurchaseOrderStatusFilter = (typeof PURCHASE_ORDER_STATUS_FILTERS)[number];

export const PURCHASE_ORDER_STATUS_FILTER_LABEL: Record<PurchaseOrderStatusFilter, string> = {
  all: "Todas",
  draft: "Rascunhos",
  ordered: "Realizadas",
  cancelled: "Canceladas",
};

export interface PurchaseOrder {
  id: string;

  supplierId: string;
  projectId: string;

  orderDate: string;
  expectedDeliveryDate?: string;

  commercialStatus: PurchaseOrderCommercialStatus;

  notes?: string;

  createdAt: string;
  updatedAt: string;
}

export interface PurchaseOrderItem {
  id: string;

  purchaseOrderId: string;
  materialId: string;

  description: string;

  unit: MaterialUnit;

  quantity: number;
  unitPrice: number;

  createdAt: string;
  updatedAt: string;
}

/**
 * `GoodsReceipt` is one physical arrival of materials against a
 * PurchaseOrder — internal name deliberately avoids "Receipt" to not
 * collide with `features/receivables/types.ts#Receipt` (an entirely
 * unrelated cash-received concept). It stores nothing derivable from
 * the PurchaseOrder or its items: no `supplierId`/`projectId` (read
 * via `purchaseOrderId`), no `status`/`total`/`receivedQuantity`
 * (derived — see `prototype/fulfillment.ts`).
 *
 * A GoodsReceipt only records what physically arrived — it never
 * creates a Payable, ProjectCost, or any financial entry. See Task
 * 038 discovery: economic/financial recognition of a purchase still
 * only happens through the existing Payable-paid path, unrelated to
 * physical receipt.
 */
export interface GoodsReceipt {
  id: string;

  purchaseOrderId: string;

  receivedAt: string;
  notes?: string;

  createdAt: string;
  updatedAt: string;
}

/**
 * `purchaseOrderItemId` is the only link — `materialId`/`description`/
 * `unit`/`unitPrice` all resolve through the PurchaseOrderItem it
 * references, never duplicated here. A domain invariant (enforced in
 * `prototype/goods-receipt.ts`, not just the store) guarantees the
 * referenced PurchaseOrderItem always belongs to the same
 * `purchaseOrderId` as this GoodsReceiptItem's own GoodsReceipt.
 */
export interface GoodsReceiptItem {
  id: string;

  goodsReceiptId: string;
  purchaseOrderItemId: string;

  quantity: number;
}
