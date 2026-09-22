/**
 * SUPPLY-FRONTEND-01D. `StockPosition`/`StockMovement`/`StockAdjustment`
 * are now the real API domain contracts — mirror
 * `App\Http\Resources\StockPositionResource` /
 * `StockMovementResource` / `StockAdjustmentResource` field-for-field.
 * `MaterialConsumption` also lives here now (moved from
 * `features/materials/types.ts`, which only ever held its OLD camelCase
 * localStorage shape) — mirrors `App\Http\Resources\MaterialConsumptionResource`.
 *
 * Every quantity is a decimal STRING (scale 3) from the API — never
 * converted to `number` as a domain value; a display helper may format
 * one for presentation, but nothing here reaches for `number` as the
 * source of truth (SUPPLY-FRONTEND-01D §50).
 *
 * StockPosition/StockMovement have NO table of their own — they are
 * pure backend read models (a union of GoodsReceiptItem/
 * MaterialConsumption/StockAdjustment/MaterialRequirement/ordered
 * PurchaseOrderItem rows). The frontend never reconstructs this pair
 * universe locally (§18) — it only ever renders what the Resource
 * returns.
 *
 * MaterialConsumption/StockAdjustment are immutable events — no
 * `updated_at` on either (nothing to version). StockAdjustment is
 * strictly append-only: no PUT, no DELETE route exists for it.
 */

import type { MaterialUnitCode } from "@/features/materials/types";

export interface StockMaterialRef {
  id: string;
  name: string;
  unit_code: MaterialUnitCode;
  unit_custom_label: string | null;
  active: boolean;
}

export interface StockProjectRef {
  id: string;
  number: string;
  name: string;
}

export type StockAdjustmentType = "ADJUSTMENT_IN" | "ADJUSTMENT_OUT";

/**
 * POST .../stock-adjustments — a manual correction to a Project+
 * Material's stock (initial count, breakage, correction). Append-only:
 * no `updated_at`, no edit/delete endpoint. A mistaken adjustment is
 * corrected by registering a new, opposite adjustment — never by
 * mutating this one.
 */
export interface StockAdjustment {
  id: string;
  project_id: string;
  material: StockMaterialRef;
  type: StockAdjustmentType;
  quantity: string;
  occurred_at: string;
  reason: string | null;
  created_at: string;
}

/** POST /api/v1/projects/{project}/stock-adjustments payload. */
export interface StockAdjustmentCreatePayload {
  material_id: string;
  type: StockAdjustmentType;
  quantity: string;
  occurred_at: string;
  reason?: string | null;
}

/**
 * POST/DELETE .../material-consumptions — the physical "used at this
 * Obra" event. Immutable: no `updated_at`, no PUT/edit endpoint; a
 * mistaken entry is deleted (not edited).
 */
export interface MaterialConsumption {
  id: string;
  project_id: string;
  material: StockMaterialRef;
  quantity: string;
  consumed_at: string;
  notes: string | null;
  created_at: string;
}

/** POST /api/v1/projects/{project}/material-consumptions payload. */
export interface MaterialConsumptionCreatePayload {
  material_id: string;
  quantity: string;
  consumed_at: string;
  notes?: string | null;
}

export type StockMovementType = "IN" | "OUT" | StockAdjustmentType;
export type StockMovementSourceType = "GOODS_RECEIPT" | "CONSUMPTION" | "MANUAL_ADJUSTMENT";

/**
 * `quantity` is always a positive magnitude — the sign/direction is
 * carried entirely by `type`. `id` is a composite string
 * (`"goods-receipt-item:<id>"`/`"consumption:<id>"`/`"adjustment:<id>"`)
 * — use `source_id` (the raw underlying record id) for any action, e.g.
 * `deleteMaterialConsumption(movement.project_id, movement.source_id)`
 * when `source_type === "CONSUMPTION"`.
 */
export interface StockMovement {
  id: string;
  project_id: string;
  material: StockMaterialRef;
  type: StockMovementType;
  quantity: string;
  occurred_at: string;
  source_type: StockMovementSourceType;
  source_id: string;
  note: string | null;
}

export const STOCK_MOVEMENT_TYPE_LABEL: Record<StockMovementType, string> = {
  IN: "Entrada",
  OUT: "Saída",
  ADJUSTMENT_IN: "Ajuste de entrada",
  ADJUSTMENT_OUT: "Ajuste de saída",
};

export const STOCK_MOVEMENT_SOURCE_LABEL: Record<StockMovementSourceType, string> = {
  GOODS_RECEIPT: "Recebimento de compra",
  CONSUMPTION: "Consumo de material",
  MANUAL_ADJUSTMENT: "Ajuste manual",
};

/**
 * One row of GET /api/v1/stock/positions (or the single-pair GET
 * .../positions/{project}/{material}) — a Project+Material pair with
 * every Supply metric the backend computes. `required_quantity`/
 * `missing_to_purchase_quantity` are `null` exactly where the backend
 * means "não planejado" — distinct from `"0.000"`, never collapsed into
 * it.
 */
export interface StockPosition {
  project: StockProjectRef;
  material: StockMaterialRef;
  required_quantity: string | null;
  purchased_quantity: string;
  received_quantity: string;
  consumed_quantity: string;
  stock_quantity: string;
  pending_receipt_quantity: string;
  missing_to_purchase_quantity: string | null;
  total_in: string;
  total_out: string;
}

/** Laravel's default paginate() JSON shape. */
export interface StockPositionPaginationResponse {
  data: StockPosition[];
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

export interface StockPositionListParams {
  search?: string;
  projectId?: string;
  page?: number;
  perPage?: number;
}

/** Laravel's default paginate() JSON shape. */
export interface StockMovementPaginationResponse {
  data: StockMovement[];
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

export interface StockMovementListParams {
  page?: number;
  perPage?: number;
}
