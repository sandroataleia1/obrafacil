/**
 * SUPPLY-FRONTEND-01A §28-29 / SUPPLY-FRONTEND-01B §32-34. TRANSITIONAL
 * helper — Material is the real API master, and as of this gate
 * MaterialRequirement is ALSO real (backend now protects unit-change/
 * delete against it directly — `MaterialRequirementService`/Postgres FK).
 * PurchaseOrderItem/MaterialConsumption/StockAdjustment are STILL local
 * browser prototypes the backend has never heard of, so this guard now
 * only covers those three — duplicating the Requirement check here would
 * just re-run a rule the backend 422 already enforces.
 *
 * Deliberately does NOT import anything from `material-store.ts` or any
 * other Material-master concern — this file only ever reads the three
 * remaining LOCAL CHILD stores, never Material identity itself.
 */

import { listItemsByMaterial } from "@/features/purchases/prototype/purchase-order-item-store";
import { listMaterialConsumptions } from "./material-consumption-store";
import { listAllStockAdjustments } from "@/features/stock/prototype/stock-adjustment-store";

export function hasLocalPurchaseOrderItem(materialId: string): boolean {
  return listItemsByMaterial(materialId).length > 0;
}

export function hasLocalConsumption(materialId: string): boolean {
  return listMaterialConsumptions().some((consumption) => consumption.materialId === materialId);
}

export function hasLocalStockAdjustment(materialId: string): boolean {
  return listAllStockAdjustments().some((adjustment) => adjustment.materialId === materialId);
}

export function hasAnyLocalMaterialDependency(materialId: string): boolean {
  return (
    hasLocalPurchaseOrderItem(materialId) ||
    hasLocalConsumption(materialId) ||
    hasLocalStockAdjustment(materialId)
  );
}
