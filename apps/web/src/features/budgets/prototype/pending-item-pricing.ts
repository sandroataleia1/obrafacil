/**
 * Prototype pricing for UI validation only — turns a pending calculator
 * item into a budget stage using the mocked prices in `src/mocks/pricing.ts`.
 * Real prices will come from organization/material data through Laravel.
 */

import { auxiliaryMaterialPrice, masonryMaterialUnitPrice } from "@/mocks/pricing";
import type { PendingBudgetItem } from "./pending-budget-item";
import type { CalculatedBudgetStage } from "../types";

export function pendingItemToStage(item: PendingBudgetItem): CalculatedBudgetStage {
  const unitPrice = masonryMaterialUnitPrice[item.materialId] ?? 0;

  const materialsCost =
    item.quantity * unitPrice +
    item.auxiliaryMaterials.cementBags * auxiliaryMaterialPrice.cementPerBag +
    item.auxiliaryMaterials.limeBags * auxiliaryMaterialPrice.limePerBag +
    item.auxiliaryMaterials.sandM3 * auxiliaryMaterialPrice.sandPerM3;

  return {
    id: `${item.title.toLowerCase()}-${Date.now()}`,
    kind: "calculated",
    name: item.title,
    item: {
      materialName: item.materialName,
      quantity: item.quantity,
      unit: item.unit,
    },
    materialsCost: Math.round(materialsCost * 100) / 100,
    laborCost: 0,
  };
}
