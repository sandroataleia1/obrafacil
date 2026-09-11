<?php

namespace App\ServiceOrders\Exceptions;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use RuntimeException;

/**
 * BACKEND-06 §41/§49-52. Thrown whenever the ServiceOrder's current status
 * doesn't allow the requested action — header/items mutation on a
 * terminal (completed/cancelled) order (§41/§52), or a status-action
 * (start/complete/cancel) that's invalid for the current status (§49:
 * repeating `start`; §52: any action on a terminal order). Laravel calls
 * an exception's own `render()` method automatically when present, so
 * this renders itself as 409 Conflict without any handler registration.
 */
class ServiceOrderStatusConflictException extends RuntimeException
{
    public function render(Request $request): JsonResponse
    {
        return response()->json(['message' => $this->getMessage()], 409);
    }
}
