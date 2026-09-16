<?php

namespace App\Projects\Exceptions;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use RuntimeException;

/**
 * PROJECT-API-01 §37. Thrown when a PUT's `updated_at` precondition
 * doesn't match the Project's real current value — someone else changed
 * it since the client last loaded it. Laravel calls an exception's own
 * `render()` automatically when present, so this renders itself as 409
 * without any handler registration (mirrors ServiceOrderStatusConflictException).
 */
class ProjectConcurrencyConflictException extends RuntimeException
{
    public function render(Request $request): JsonResponse
    {
        return response()->json(['message' => $this->getMessage()], 409);
    }
}
