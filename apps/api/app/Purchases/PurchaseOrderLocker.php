<?php

namespace App\Purchases;

use App\Models\PurchaseOrder;

/**
 * SUPPLY-API-01C §45. The single place a PurchaseOrder row is
 * pessimistically locked for a mutation. Every mutation of the Order or
 * its Items (header update, confirm/cancel/return-to-draft, delete, add
 * item, update item, delete item) locks the PARENT PurchaseOrder row
 * first — this is what makes "confirm vs delete-last-item" (§46) and the
 * optimistic-concurrency `updated_at` check (§49-51) race-safe: a second
 * concurrent mutation's own `lockForUpdate()` blocks until the first
 * transaction commits, then observes the ALREADY-UPDATED state. Mirrors
 * ProjectLocker/ServiceOrderLocker/BudgetLocker.
 */
class PurchaseOrderLocker
{
    public function lock(PurchaseOrder|string $purchaseOrder): PurchaseOrder
    {
        $id = $purchaseOrder instanceof PurchaseOrder ? $purchaseOrder->id : $purchaseOrder;

        return PurchaseOrder::query()
            ->whereKey($id)
            ->lockForUpdate()
            ->firstOrFail();
    }
}
