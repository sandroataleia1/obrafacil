<?php

namespace Tests\Feature\MaterialRequirements\Concerns;

use App\Enums\CompanyRole;
use App\Models\Company;
use App\Models\Customer;
use App\Models\Material;
use App\Models\MaterialRequirement;
use App\Models\Project;
use App\Models\User;
use App\Support\CurrentCompanyContext;
use Laravel\Sanctum\Sanctum;

trait InteractsWithMaterialRequirements
{
    private ?Company $activeTestCompany = null;

    protected function currentCompanyContext(): CurrentCompanyContext
    {
        return app(CurrentCompanyContext::class);
    }

    /**
     * @return array{0: Company, 1: User}
     */
    protected function makeCompanyWithMember(array $companyAttributes = [], array $userAttributes = []): array
    {
        $company = Company::factory()->create($companyAttributes);
        $user = User::factory()->create($userAttributes);
        $company->memberships()->create(['user_id' => $user->id, 'role' => CompanyRole::Owner]);

        return [$company, $user];
    }

    /**
     * @return array{0: Company, 1: User}
     */
    protected function actingAsNewCompanyMember(array $companyAttributes = [], array $userAttributes = []): array
    {
        [$company, $user] = $this->makeCompanyWithMember($companyAttributes, $userAttributes);
        Sanctum::actingAs($user);
        $this->activeTestCompany = $company;

        return [$company, $user];
    }

    protected function makeMaterialForCompany(Company $company, array $attributes = []): Material
    {
        return $this->currentCompanyContext()->run(
            $company,
            fn () => Material::factory()->create($attributes)
        );
    }

    protected function makeProjectForCompany(Company $company, array $attributes = []): Project
    {
        return $this->currentCompanyContext()->run(
            $company,
            fn () => Project::factory()->create(array_merge(
                ['customer_id' => Customer::factory()],
                $attributes
            ))
        );
    }

    protected function makeRequirementForCompany(Company $company, array $attributes = []): MaterialRequirement
    {
        return $this->currentCompanyContext()->run(
            $company,
            function () use ($attributes) {
                $attributes['project_id'] ??= Project::factory()->create(['customer_id' => Customer::factory()])->id;
                $attributes['material_id'] ??= Material::factory()->create()->id;

                return MaterialRequirement::factory()->create($attributes);
            }
        );
    }

    /**
     * @return array<string, mixed>
     */
    protected function validRequirementPayload(array $overrides = []): array
    {
        return array_merge([
            'required_quantity' => '10.000',
        ], $overrides);
    }
}
