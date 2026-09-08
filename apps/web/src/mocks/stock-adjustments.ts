import type { StockAdjustment } from "@/features/stock/types";

/**
 * Two demo adjustments (Pilot-Ready "Estoque 1.1" §30 — D3/D6 needed a
 * genuinely new case, everything else already existed):
 *
 * - Cimento CP-II @ Edícula Fundos: a physical loss during internal
 *   transport, discovered and corrected after the fact, against a pair
 *   that already has real GoodsReceipt/Consumption history (80 sc
 *   received, 50 sc consumed).
 * - Tubo PVC 100 mm @ Edícula Fundos: an opening balance registered
 *   via adjustment for a Material that has a real purchase commitment
 *   (`purchase-order-tubo-sem-recebimento`, 10 un ordered, still zero
 *   GoodsReceipt) but no MaterialRequirement — demonstrates both
 *   "estoque inicial via AdjustmentIn" (D3) and "comprado/estoque sem
 *   Requirement" (D6) without inventing a purchase or a requirement
 *   that doesn't already exist.
 */
export const stockAdjustments: StockAdjustment[] = [
  {
    id: "stock-adjustment-cimento-edicula-1",
    projectId: "edicula-fundos-obra",
    materialId: "material-cimento-cp2",
    type: "ADJUSTMENT_OUT",
    quantity: 2,
    occurredAt: "2026-08-30",
    reason: "Quebra de 2 sacos durante o transporte interno.",
    createdAt: "2026-08-30",
    updatedAt: "2026-08-30",
  },
  {
    id: "stock-adjustment-tubo-pvc-edicula-1",
    projectId: "edicula-fundos-obra",
    materialId: "material-tubo-pvc-100mm",
    type: "ADJUSTMENT_IN",
    quantity: 4,
    occurredAt: "2026-08-28",
    reason: "Estoque inicial — unidades emprestadas de outra obra, antes do pedido chegar.",
    createdAt: "2026-08-28",
    updatedAt: "2026-08-28",
  },
];
