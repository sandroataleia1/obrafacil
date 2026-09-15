<?php

namespace App\Http\Controllers\Api\V1;

use App\Companies\CompanyProfileService;
use App\Http\Controllers\Controller;
use App\Http\Requests\UpdateCompanyProfileRequest;
use App\Http\Resources\CompanyProfileResource;
use App\Support\CurrentCompanyContext;

/**
 * GET/PUT /api/v1/company/profile — the Company resolved by
 * `resolve-current-company` IS the profile (§1/§5). There is no
 * company id anywhere in this route; a client can never read or edit
 * another Company's profile through it, by construction (§19).
 */
class CompanyProfileController extends Controller
{
    public function __construct(
        private readonly CompanyProfileService $service,
        private readonly CurrentCompanyContext $context,
    ) {}

    public function show(): CompanyProfileResource
    {
        return new CompanyProfileResource($this->context->get());
    }

    public function update(UpdateCompanyProfileRequest $request): CompanyProfileResource
    {
        $company = $this->service->update($this->context->get(), $request->validated());

        return new CompanyProfileResource($company);
    }
}
