/**
 * SUPPLY-FRONTEND-01C. `PurchaseOrder`/`PurchaseOrderItem`/`GoodsReceipt`/
 * `GoodsReceiptItem` are now the real API domain contract — mirrors
 * `App\Http\Resources\PurchaseOrderResource` / `PurchaseOrderListResource` /
 * `PurchaseOrderItemResource` / `GoodsReceiptResource` /
 * `GoodsReceiptItemResource` and the matching `Store`/`Update`/status-action
 * Requests field-for-field (same discipline as `features/materials/types.ts`
 * MaterialRequirement). Never invent a field here without a matching
 * backend source.
 *
 * SUPPLY-FRONTEND-01D: the OLD camelCase/local prototype shapes
 * (`prototype/legacy-types.ts`, `purchase-totals.ts`,
 * `purchase-planning-adapter.ts`) are removed — `StockPosition`
 * (`features/stock/types.ts`, real API) is now the sole planning
 * source, so nothing in this app still needs that bridge.
 *
 * `updated_at` on every mutable resource here is an OPAQUE
 * optimistic-concurrency token — never `Date`-parsed, truncated, or
 * reformatted, only ever captured from the last-loaded representation and
 * echoed back verbatim. `GoodsReceipt` has no `updated_at` — it is an
 * immutable event (create/delete only, no update endpoint).
 *
 * `quantity`/`unit_price`/`line_total`/`received_quantity`/
 * `remaining_quantity`/`total` are all decimal STRINGS from the API, never
 * a binary float — see `purchase-decimal.ts`.
 */

import type { MaterialUnitCode } from "@/features/materials/types";

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

export type PurchaseOrderFulfillmentStatus = "not_received" | "partial" | "received";

export const PURCHASE_ORDER_FULFILLMENT_LABEL: Record<PurchaseOrderFulfillmentStatus, string> = {
  not_received: "Não recebido",
  partial: "Recebido parcialmente",
  received: "Recebido",
};

export interface PurchaseOrderSupplierRef {
  id: string;
  name: string;
  active: boolean;
}

export interface PurchaseOrderProjectRef {
  id: string;
  number: string;
  name: string;
}

export interface PurchaseOrderMaterialRef {
  id: string;
  name: string;
  active: boolean;
}

/** GET .../{id}, POST, PUT — full detail, includes items and goods_receipts. */
export interface PurchaseOrder {
  id: string;
  number: string;
  commercial_status: PurchaseOrderCommercialStatus;
  fulfillment_status: PurchaseOrderFulfillmentStatus;
  supplier: PurchaseOrderSupplierRef;
  project: PurchaseOrderProjectRef;
  order_date: string;
  expected_delivery_date: string | null;
  notes: string | null;
  items: PurchaseOrderItem[];
  goods_receipts: GoodsReceipt[];
  total: string;
  created_at: string;
  updated_at: string;
}

/**
 * A row from GET /api/v1/purchase-orders — lean shape, no items/
 * goods_receipts. SUPPLY-FRONTEND-01C1 §22: no `notes` — mirrors
 * `PurchaseOrderListResource` field-for-field, which never includes it
 * (only the full detail `PurchaseOrderResource` does).
 */
export interface PurchaseOrderListItem {
  id: string;
  number: string;
  commercial_status: PurchaseOrderCommercialStatus;
  fulfillment_status: PurchaseOrderFulfillmentStatus;
  supplier: PurchaseOrderSupplierRef;
  project: PurchaseOrderProjectRef;
  order_date: string;
  expected_delivery_date: string | null;
  items_count: number;
  total: string;
  created_at: string;
  updated_at: string;
}

/** Laravel's default paginate() JSON shape. */
export interface PurchaseOrderPaginationResponse {
  data: PurchaseOrderListItem[];
  meta: {
    current_page: number;
    from: number | null;
    last_page: number;
    per_page: number;
    to: number | null;
    total: number;
  };
  links: {
    first: string | null;
    last: string | null;
    prev: string | null;
    next: string | null;
  };
}

export interface PurchaseOrderListParams {
  search?: string;
  commercialStatus?: PurchaseOrderCommercialStatus;
  projectId?: string;
  supplierId?: string;
  page?: number;
  perPage?: number;
}

/** Never send number/commercial_status/items/total/company_id/id/created_at. */
export interface PurchaseOrderCreatePayload {
  supplier_id: string;
  project_id: string;
  order_date: string;
  expected_delivery_date?: string | null;
  notes?: string | null;
}

/** Requires the opaque `updated_at` token from the last-loaded representation. */
export interface PurchaseOrderUpdatePayload {
  supplier_id: string;
  project_id: string;
  order_date: string;
  expected_delivery_date?: string | null;
  notes?: string | null;
  updated_at: string;
}

/** Body for confirm/cancel/return-to-draft, and for DELETE (as the request body). */
export interface PurchaseOrderConcurrencyPayload {
  updated_at: string;
}

export interface PurchaseOrderItem {
  id: string;
  material: PurchaseOrderMaterialRef;
  description: string;
  unit_code: MaterialUnitCode;
  unit_custom_label: string | null;
  quantity: string;
  unit_price: string;
  line_total: string;
  received_quantity: string;
  remaining_quantity: string;
  fulfillment_status: PurchaseOrderFulfillmentStatus;
  created_at: string;
  updated_at: string;
}

/** Never send unit_code/unit_custom_label/line_total/received_quantity/remaining_quantity/fulfillment_status. */
export interface PurchaseOrderItemCreatePayload {
  material_id: string;
  description: string;
  quantity: string;
  unit_price: string;
}

/** Material is immutable on update — requires the ITEM's own `updated_at` token, not the order's. */
export interface PurchaseOrderItemUpdatePayload {
  description: string;
  quantity: string;
  unit_price: string;
  updated_at: string;
}

/** `GoodsReceipt` is an immutable event — create/delete only, no `updated_at`. */
export interface GoodsReceipt {
  id: string;
  received_at: string;
  notes: string | null;
  items: GoodsReceiptItem[];
  created_at: string;
}

export interface GoodsReceiptItem {
  id: string;
  purchase_order_item_id: string;
  quantity: string;
}

export interface GoodsReceiptCreatePayload {
  received_at: string;
  notes?: string | null;
  items: { purchase_order_item_id: string; quantity: string }[];
}
