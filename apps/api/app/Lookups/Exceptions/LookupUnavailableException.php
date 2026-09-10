<?php

namespace App\Lookups\Exceptions;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Timeout, connection failure, upstream 5xx, or upstream 429 (§21/§22) —
 * the message is always the same generic, safe text; the real detail
 * (provider name, upstream status, exception class) is only ever logged,
 * never returned to the client (§21 — no stack trace, no upstream body).
 */
class LookupUnavailableException extends LookupException
{
    public function render(Request $request): JsonResponse
    {
        return response()->json([
            'message' => 'Serviço de consulta temporariamente indisponível.',
        ], 503);
    }
}
