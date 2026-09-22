import type { StockPosition } from "../types";

/**
 * Dashboard-only aggregation — two COUNTS of Project+Material
 * positions, never a sum of quantities across materials (units are
 * incompatible: saco, m³, barra, un, kg...). SUPPLY-FRONTEND-01D §37:
 * `positions` now comes straight from `listAllStockPositions()` (real
 * API) — this stays a pure function over already-resolved data, never
 * recomputes any Supply metric itself.
 */
export interface DashboardSupplySummary {
  /** Positions with a real Requirement whose `missing_to_purchase_quantity > 0`.
   * A position with no Requirement (`required_quantity === null`) never
   * counts here — "não planejado" is not "falta comprar". */
  missingToPurchaseCount: number;
  /** Positions with `pending_receipt_quantity > 0`, regardless of Requirement. */
  pendingReceiptCount: number;
}

export function getDashboardSupplySummary(positions: StockPosition[]): DashboardSupplySummary {
  let missingToPurchaseCount = 0;
  let pendingReceiptCount = 0;

  for (const position of positions) {
    if (position.missing_to_purchase_quantity !== null && Number(position.missing_to_purchase_quantity) > 0) {
      missingToPurchaseCount++;
    }
    if (Number(position.pending_receipt_quantity) > 0) {
      pendingReceiptCount++;
    }
  }

  return { missingToPurchaseCount, pendingReceiptCount };
}
