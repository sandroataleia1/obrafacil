<?php

namespace App\Purchases\Exceptions;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use RuntimeException;

/**
 * SUPPLY-API-01C §49-51. Thrown when a PUT/action's `updated_at`
 * precondition doesn't match the row's real current value — someone else
 * changed it since the client last loaded it. Mirrors
 * ProjectConcurrencyConflictException/ServiceOrderStatusConflictException
 * — renders itself as 409 without any handler registration.
 */
class PurchaseOrderConcurrencyConflictException extends RuntimeException
{
    public function render(Request $request): JsonResponse
    {
        return response()->json(['message' => $this->getMessage()], 409);
    }
}
