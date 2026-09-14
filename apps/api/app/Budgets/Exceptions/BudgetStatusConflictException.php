<?php

namespace App\Budgets\Exceptions;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use RuntimeException;

/**
 * BUDGET-API-01. Thrown whenever the Budget's current status doesn't
 * allow the requested action — header/item mutation on a non-draft
 * Budget, submit on a non-draft Budget, or a decision (manual or public)
 * on an already-terminal/non-pending Budget. Laravel calls an
 * exception's own `render()` method automatically, so this renders
 * itself as 409 Conflict without any handler registration — mirrors
 * `App\ServiceOrders\Exceptions\ServiceOrderStatusConflictException`.
 */
class BudgetStatusConflictException extends RuntimeException
{
    public function render(Request $request): JsonResponse
    {
        return response()->json(['message' => $this->getMessage()], 409);
    }
}
