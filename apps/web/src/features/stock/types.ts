/**
 * UI/prototype models for Estoque (basic stock control per Obra +
 * Material).
 *
 * There is deliberately no persisted "stock" field anywhere in this
 * prototype — the balance is always `entradas - saídas`, derived at
 * read time from three sources: GoodsReceiptItem (physical arrival,
 * already modeled in `features/purchases`), MaterialConsumption
 * (physical usage, already modeled in `features/materials`), and
 * `StockAdjustment` (the one genuinely new entity this feature adds,
 * for corrections/initial counts/breakage that don't originate from
 * a receipt or a consumption).
 *
 * `StockMovement` is a read-only, computed view — never persisted as
 * its own store. A movement whose `sourceType` is `GOODS_RECEIPT` or
 * `CONSUMPTION` is not a duplicate fact: it is the same GoodsReceiptItem
 * / MaterialConsumption record, reshaped for display, always resolved
 * live from those stores (see `prototype/stock.ts`). Only
 * `MANUAL_ADJUSTMENT` movements come from a store of their own
 * (`StockAdjustment`), because no other entity already represents that
 * fact.
 *
 * Stock is scoped to `projectId + materialId` — the same Material at
 * two different Obras is always two separate balances, matching the
 * ObraFácil rule that there is no central/administrative stock (see
 * `features/purchases/types.ts`'s doc comment on `PurchaseOrder`).
 *
 * NOT the definitive domain contract for the future API — only exists
 * to validate the product experience with mocked/local data.
 */

export type StockAdjustmentType = "ADJUSTMENT_IN" | "ADJUSTMENT_OUT";

/**
 * A manual correction to a Project+Material's stock — initial count,
 * physical-count correction, breakage/loss, or any other operational
 * adjustment that isn't a GoodsReceipt or a Consumption. Always
 * generates a movement; the balance itself is never edited directly.
 */
export interface StockAdjustment {
  id: string;

  projectId: string;
  materialId: string;

  type: StockAdjustmentType;
  quantity: number;
  occurredAt: string;

  reason?: string;

  createdAt: string;
  updatedAt: string;
}

export type StockMovementType = "IN" | "OUT" | StockAdjustmentType;
export type StockMovementSourceType = "GOODS_RECEIPT" | "CONSUMPTION" | "MANUAL_ADJUSTMENT";

/**
 * `quantity` is always a positive magnitude — the sign/direction is
 * carried entirely by `type`, never by a negative number, so the UI
 * never has to branch on quantity sign to decide how to render it.
 */
export interface StockMovement {
  id: string;

  projectId: string;
  materialId: string;

  type: StockMovementType;
  quantity: number;
  occurredAt: string;

  sourceType: StockMovementSourceType;
  sourceId: string;
  note?: string;
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

/** One row of the Estoque listing: a Project+Material pair that has at
 * least one movement, with its totals already summed. */
export interface StockPosition {
  projectId: string;
  materialId: string;
  totalIn: number;
  totalOut: number;
  balance: number;
}
