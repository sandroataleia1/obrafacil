<?php

namespace App\Purchases\Exceptions;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use RuntimeException;

/**
 * SUPPLY-API-01C §20-23/§27. Thrown whenever the PurchaseOrder's current
 * commercial_status doesn't allow the requested action — header/item
 * mutation on a cancelled Order (§20/§27), or a status action (confirm/
 * cancel/return-to-draft) that isn't a valid transition from the current
 * status (§23: e.g. confirm() when status isn't draft, which is exactly
 * what keeps `cancelled -> ordered` from ever happening directly).
 * Mirrors ServiceOrderStatusConflictException — renders itself as 409
 * without any handler registration.
 */
class PurchaseOrderStatusConflictException extends RuntimeException
{
    public function render(Request $request): JsonResponse
    {
        return response()->json(['message' => $this->getMessage()], 409);
    }
}
