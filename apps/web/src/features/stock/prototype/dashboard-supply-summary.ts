import { listSupplyPositions } from "./supply-metrics";

/**
 * Dashboard-only aggregation (Pilot "Dashboard — Resumo de
 * Suprimentos") — two COUNTS of Project+Material positions, never a
 * sum of quantities across materials (units are incompatible: saco,
 * m³, barra, un, kg...). Reuses `listSupplyPositions()` verbatim
 * (Estoque 1.1, untouched) — never recomputes `required`/`purchased`/
 * `received`/`consumed`/`stock`/`pendingReceipt`/`missingToPurchase`.
 */
export interface DashboardSupplySummary {
  /** Positions with a real Requirement whose `missingToPurchase > 0`.
   * A position with no Requirement (`required === null`) never counts
   * here — "não planejado" is not "falta comprar". */
  missingToPurchaseCount: number;
  /** Positions with `pendingReceipt > 0`, regardless of Requirement. */
  pendingReceiptCount: number;
}

export function getDashboardSupplySummary(): DashboardSupplySummary {
  const positions = listSupplyPositions();
  let missingToPurchaseCount = 0;
  let pendingReceiptCount = 0;

  for (const position of positions) {
    if (position.required !== null && (position.missingToPurchase ?? 0) > 0) {
      missingToPurchaseCount++;
    }
    if (position.pendingReceipt > 0) {
      pendingReceiptCount++;
    }
  }

  return { missingToPurchaseCount, pendingReceiptCount };
}
