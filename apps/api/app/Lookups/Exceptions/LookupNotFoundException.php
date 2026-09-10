<?php

namespace App\Lookups\Exceptions;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * A well-formed, locally-valid CEP/CNPJ that the provider genuinely has
 * no record of (§19/§20) — never confused with a locally-invalid input
 * (that's a 422, caught before any HTTP call is even made).
 */
class LookupNotFoundException extends LookupException
{
    public function render(Request $request): JsonResponse
    {
        return response()->json(['message' => $this->getMessage()], 404);
    }
}
