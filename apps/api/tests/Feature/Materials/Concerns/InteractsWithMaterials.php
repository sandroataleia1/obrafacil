<?php

namespace Tests\Feature\Materials\Concerns;

use App\Enums\CompanyRole;
use App\Models\Company;
use App\Models\Material;
use App\Models\User;
use App\Support\CurrentCompanyContext;
use Laravel\Sanctum\Sanctum;

trait InteractsWithMaterials
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

    /**
     * @return array<string, mixed>
     */
    protected function validMaterialPayload(array $overrides = []): array
    {
        return array_merge([
            'name' => 'Cimento CP-II 50kg',
            'unit_code' => 'sc',
        ], $overrides);
    }
}
