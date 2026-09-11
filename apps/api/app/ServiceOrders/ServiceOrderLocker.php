<?php

namespace App\ServiceOrders;

use App\Models\ServiceOrder;

/**
 * BACKEND-06B §2-4. The single place a ServiceOrder row is pessimistically
 * locked for a mutation. `service_orders.id` is the transactional mutex
 * for that O.S. — every mutating Service method (header update, status
 * actions, item add/update/delete) MUST call this from within its own
 * `DB::transaction()` closure before touching anything else, and treat
 * only the returned, freshly-locked instance as authoritative. Never call
 * this outside an open transaction — `SELECT ... FOR UPDATE` without a
 * surrounding transaction is a no-op lock (released the instant the
 * statement completes), which would defeat the whole point.
 *
 * A real PostgreSQL row-level lock (`FOR UPDATE`) is sufficient here —
 * deliberately not an advisory lock, since the thing being serialized is
 * exactly one row this app already owns and queries transactionally.
 */
class ServiceOrderLocker
{
    public function lock(ServiceOrder|string $order): ServiceOrder
    {
        $id = $order instanceof ServiceOrder ? $order->id : $order;

        return ServiceOrder::query()
            ->whereKey($id)
            ->lockForUpdate()
            ->firstOrFail();
    }
}
