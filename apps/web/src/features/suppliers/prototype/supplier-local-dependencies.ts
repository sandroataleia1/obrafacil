/**
 * SUPPLY-FRONTEND-01A §45-46. TRANSITIONAL helper, mirrors
 * `features/materials/prototype/material-local-dependencies.ts` — Supplier
 * is now the real API master, but PurchaseOrder is still a local browser
 * prototype the backend has never heard of. Until PurchaseOrder migrates
 * (SUPPLY-FRONTEND-01B), the frontend is the only place that can know
 * "does THIS browser have a local PurchaseOrder pointing at this
 * Supplier" — so this guard stays necessary in addition to the real
 * backend guard, which only sees API-created PurchaseOrders (there are
 * none yet).
 */

import { listPurchaseOrdersBySupplier } from "@/features/purchases/prototype/purchase-order-store";

export function hasLocalPurchaseOrder(supplierId: string): boolean {
  return listPurchaseOrdersBySupplier(supplierId).length > 0;
}
