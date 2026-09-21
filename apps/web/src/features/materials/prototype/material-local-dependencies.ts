/**
 * SUPPLY-FRONTEND-01A §28-29. TRANSITIONAL helper — Material is now the
 * real API master, but MaterialRequirement/PurchaseOrderItem/
 * MaterialConsumption/StockAdjustment are STILL local browser
 * prototypes the backend (PostgreSQL) has never heard of. Until each of
 * those migrates to the API (SUPPLY-FRONTEND-01B/01C/...), the frontend
 * is the only place that can know "does THIS browser have a local child
 * still pointing at this Material" — so unit-lock/delete guards here
 * stay necessary in addition to the real backend guard
 * (`MaterialService::hasDependents()`), which only sees API-created
 * dependents.
 *
 * Deliberately does NOT import anything from `material-store.ts` or any
 * other Material-master concern — this file only ever reads the four
 * LOCAL CHILD stores, never Material identity itself.
 */

import { listItemsByMaterial } from "@/features/purchases/prototype/purchase-order-item-store";
import { listMaterialConsumptions } from "./material-consumption-store";
import { listRequirements } from "./material-requirement-store";
import { listAllStockAdjustments } from "@/features/stock/prototype/stock-adjustment-store";

export function hasLocalMaterialRequirement(materialId: string): boolean {
  return listRequirements().some((requirement) => requirement.materialId === materialId);
}

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
    hasLocalMaterialRequirement(materialId) ||
    hasLocalPurchaseOrderItem(materialId) ||
    hasLocalConsumption(materialId) ||
    hasLocalStockAdjustment(materialId)
  );
}
