<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\LookupCompanyRegistryRequest;
use App\Http\Resources\CompanyRegistryLookupResource;
use App\Lookups\CompanyRegistryLookupService;

/**
 * Thin by design (§39) — no BrasilAPI mapping, normalization, caching, or
 * provider logic lives here.
 */
class CompanyRegistryLookupController extends Controller
{
    public function __construct(private readonly CompanyRegistryLookupService $service) {}

    public function show(LookupCompanyRegistryRequest $request): CompanyRegistryLookupResource
    {
        $result = $this->service->lookup($request->validated('cnpj'));

        return new CompanyRegistryLookupResource($result);
    }
}
