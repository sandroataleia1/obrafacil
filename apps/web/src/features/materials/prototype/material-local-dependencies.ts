/**
 * SUPPLY-FRONTEND-01A §28-29 / SUPPLY-FRONTEND-01B §32-34 / SUPPLY-
 * FRONTEND-01C §53. TRANSITIONAL helper — Material is the real API
 * master, and MaterialRequirement/PurchaseOrderItem are ALSO real as of
 * this gate (backend now protects unit-change/delete against both
 * directly). MaterialConsumption/StockAdjustment remain local browser
 * prototypes the backend has never heard of, so this guard now only
 * covers those two — duplicating the Requirement/PurchaseOrderItem
 * checks here would just re-run a rule the backend 422 already
 * enforces.
 *
 * Deliberately does NOT import anything from `material-store.ts` or any
 * other Material-master concern — this file only ever reads the two
 * remaining LOCAL CHILD stores, never Material identity itself.
 */

import { listMaterialConsumptions } from "./material-consumption-store";
import { listAllStockAdjustments } from "@/features/stock/prototype/stock-adjustment-store";

export function hasLocalConsumption(materialId: string): boolean {
  return listMaterialConsumptions().some((consumption) => consumption.materialId === materialId);
}

export function hasLocalStockAdjustment(materialId: string): boolean {
  return listAllStockAdjustments().some((adjustment) => adjustment.materialId === materialId);
}

export function hasAnyLocalMaterialDependency(materialId: string): boolean {
  return hasLocalConsumption(materialId) || hasLocalStockAdjustment(materialId);
}
