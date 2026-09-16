<?php

namespace Tests\Feature\Projects\Concerns;

use App\Enums\CompanyRole;
use App\Models\Company;
use App\Models\Customer;
use App\Models\User;
use App\Support\CurrentCompanyContext;
use Laravel\Sanctum\Sanctum;

trait InteractsWithProjects
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

    protected function makeCustomer(array $attributes = []): Customer
    {
        return $this->currentCompanyContext()->run(
            $this->activeTestCompany,
            fn () => Customer::factory()->create(array_merge(['name' => 'Cliente Teste'], $attributes))
        );
    }

    /**
     * @return array<string, mixed>
     */
    protected function validProjectPayload(array $overrides = []): array
    {
        return array_merge([
            'name' => 'Reforma Residencial',
            'customer_id' => $this->makeCustomer()->id,
        ], $overrides);
    }
}
