<?php

namespace Tests\Feature\Suppliers\Concerns;

use App\Enums\CompanyRole;
use App\Models\Company;
use App\Models\Supplier;
use App\Models\User;
use App\Support\CurrentCompanyContext;
use Laravel\Sanctum\Sanctum;

trait InteractsWithSuppliers
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

    protected function makeSupplierForCompany(Company $company, array $attributes = []): Supplier
    {
        return $this->currentCompanyContext()->run(
            $company,
            fn () => Supplier::factory()->create($attributes)
        );
    }

    /**
     * @return array<string, mixed>
     */
    protected function validSupplierPayload(array $overrides = []): array
    {
        return array_merge([
            'name' => 'Depósito Central Materiais',
        ], $overrides);
    }
}
