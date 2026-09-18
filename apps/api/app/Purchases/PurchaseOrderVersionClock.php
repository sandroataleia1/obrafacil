<?php

namespace App\Purchases;

use Carbon\Carbon;

/**
 * SUPPLY-API-01C1 §11/§14/§17. `updated_at` on PurchaseOrder/
 * PurchaseOrderItem is the optimistic-concurrency VERSION for that
 * aggregate, not just visual audit — a successful mutation must produce
 * a version strictly greater than the one it started from, even when
 * `now()` itself hasn't advanced past that version (two mutations inside
 * the same microsecond, or a frozen/mocked clock in a test). No
 * sleep()/usleep() anywhere — this is a logical guarantee, not a timing
 * trick.
 */
final class PurchaseOrderVersionClock
{
    public static function nextVersion(?Carbon $current): Carbon
    {
        $now = Carbon::now();

        if ($current === null || $now->greaterThan($current)) {
            return $now;
        }

        return $current->copy()->addMicrosecond();
    }
}
