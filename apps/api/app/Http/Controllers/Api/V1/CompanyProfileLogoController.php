<?php

namespace App\Http\Controllers\Api\V1;

use App\Companies\CompanyLogoService;
use App\Http\Controllers\Controller;
use App\Http\Requests\DestroyCompanyLogoRequest;
use App\Http\Requests\StoreCompanyLogoRequest;
use App\Http\Resources\CompanyProfileResource;
use App\Support\CurrentCompanyContext;

/**
 * POST/DELETE /api/v1/company/profile/logo — owner/admin only (§11/§13).
 */
class CompanyProfileLogoController extends Controller
{
    public function __construct(
        private readonly CompanyLogoService $service,
        private readonly CurrentCompanyContext $context,
    ) {}

    public function store(StoreCompanyLogoRequest $request): CompanyProfileResource
    {
        $company = $this->service->store($this->context->get(), $request->file('logo'));

        return new CompanyProfileResource($company);
    }

    public function destroy(DestroyCompanyLogoRequest $request): CompanyProfileResource
    {
        $company = $this->service->delete($this->context->get());

        return new CompanyProfileResource($company);
    }
}
