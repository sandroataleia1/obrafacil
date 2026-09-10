<?php

namespace App\Lookups\Exceptions;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * A 2xx response that doesn't parse as JSON, or is missing the fields
 * this adapter considers essential (e.g. no city/state for a CEP, no
 * legal name for a CNPJ) — treated the same as "unavailable" from the
 * client's perspective (§18/§21): the lookup simply didn't work, and the
 * user can retry or fill the form manually either way.
 */
class LookupInvalidResponseException extends LookupException
{
    public function render(Request $request): JsonResponse
    {
        return response()->json([
            'message' => 'Serviço de consulta temporariamente indisponível.',
        ], 503);
    }
}
