/**
 * Domain operations for Supplier that need to know about
 * PurchaseOrder — kept out of `supplier-store.ts` (pure persistence)
 * the same way `material.ts` sits above `material-store.ts`.
 *
 * A Supplier with any PurchaseOrder can never be deleted — every
 * PurchaseOrder.supplierId must always resolve to a real Supplier.
 * Inactivation (`status: "inactive"`) remains the normal removal path
 * once a Supplier has any history; `deleteSupplier()` in the store
 * stays reachable only for a Supplier with zero PurchaseOrders.
 *
 * Importing from `features/purchases` here is intentional and
 * non-circular, mirroring `features/materials/prototype/material.ts`:
 * `features/purchases/prototype/purchase-order.ts` only imports
 * `getSupplier` from `supplier-store.ts` (pure persistence), never
 * from this file.
 */

import { listPurchaseOrdersBySupplier } from "@/features/purchases/prototype/purchase-order-store";
import { deleteSupplier as deleteSupplierRecord } from "./supplier-store";
import type { Supplier } from "../types";

export type DomainResult = { ok: true } | { ok: false; error: string };

export function supplierHasPurchaseOrders(supplierId: string): boolean {
  return listPurchaseOrdersBySupplier(supplierId).length > 0;
}

export function removeSupplier(supplier: Supplier): DomainResult {
  if (supplierHasPurchaseOrders(supplier.id)) {
    return {
      ok: false,
      error: "Este fornecedor possui pedidos de compra registrados e não pode ser excluído.",
    };
  }
  deleteSupplierRecord(supplier.id);
  return { ok: true };
}
