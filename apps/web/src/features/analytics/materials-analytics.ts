/**
 * Materials facts for the analytics layer. SUPPLY-FRONTEND-01D §37-44:
 * `StockPosition` (real API, `GET /v1/stock/positions`) IS the
 * planning/pending-quantities authority now — the local
 * `calculateMaterialPlanning`/Legacy Purchase/Requirement fan-out this
 * file used to reuse is gone. `pendingToBuyCount` counts pairs where
 * the backend already computed a positive
 * `missing_to_purchase_quantity` (null means "não planejado" — no
 * Requirement, never counted here); `pendingToReceiveCount` counts
 * pairs with a positive `pending_receipt_quantity` (ordered but not yet
 * received, regardless of whether the material was also required).
 * Pure function only — no store reads, no writes.
 */

import type { StockPosition } from "@/features/stock/types";
import type { ProjectMaterialsFacts } from "./types";

export function buildProjectMaterialsFacts(positions: StockPosition[]): ProjectMaterialsFacts {
  let pendingToBuyCount = 0;
  let pendingToReceiveCount = 0;

  for (const position of positions) {
    if (position.missing_to_purchase_quantity !== null && Number(position.missing_to_purchase_quantity) > 0) {
      pendingToBuyCount += 1;
    }
    if (Number(position.pending_receipt_quantity) > 0) {
      pendingToReceiveCount += 1;
    }
  }

  return { pendingToBuyCount, pendingToReceiveCount };
}
