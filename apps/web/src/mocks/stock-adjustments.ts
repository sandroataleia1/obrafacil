import type { StockAdjustment } from "@/features/stock/types";

/**
 * One demo adjustment, against a Project+Material that already has
 * real GoodsReceipt/Consumption history (Cimento CP-II @ Edícula
 * Fundos: 80 sc received, 50 sc consumed) — a physical loss during
 * internal transport, discovered and corrected after the fact.
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
];
