<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\LookupPostalCodeRequest;
use App\Http\Resources\PostalCodeLookupResource;
use App\Lookups\PostalCodeLookupService;

/**
 * Thin by design (§39) — no ViaCEP mapping, normalization, caching, or
 * provider logic lives here. Every Lookups exception has its own
 * render(), so a not-found/unavailable result never needs a try/catch
 * here either.
 */
class PostalCodeLookupController extends Controller
{
    public function __construct(private readonly PostalCodeLookupService $service) {}

    public function show(LookupPostalCodeRequest $request): PostalCodeLookupResource
    {
        $result = $this->service->lookup($request->validated('cep'));

        return new PostalCodeLookupResource($result);
    }
}
