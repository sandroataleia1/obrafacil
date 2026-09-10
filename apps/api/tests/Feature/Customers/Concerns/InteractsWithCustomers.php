<?php

namespace Tests\Feature\Customers\Concerns;

use App\Enums\CompanyRole;
use App\Models\Company;
use App\Models\User;
use App\Support\CurrentCompanyContext;
use Laravel\Sanctum\Sanctum;

trait InteractsWithCustomers
{
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

        return [$company, $user];
    }

    /**
     * @return array<string, mixed>
     */
    protected function validCustomerPayload(array $overrides = []): array
    {
        return array_merge([
            'kind' => 'individual',
            'name' => 'João da Silva',
            'phone' => '+5511999999999',
            'email' => 'joao@example.com',
        ], $overrides);
    }

    /**
     * @return array<string, mixed>
     */
    protected function validAddressPayload(array $overrides = []): array
    {
        return array_merge([
            'label' => 'Casa',
            'type' => 'residential',
            'postal_code' => '30140110',
            'street' => 'Rua das Flores',
            'number' => '123',
            'complement' => 'Apto 302',
            'neighborhood' => 'Centro',
            'city' => 'Belo Horizonte',
            'state' => 'MG',
            'reference_point' => 'Ao lado da farmácia',
        ], $overrides);
    }

    /**
     * @return array<string, mixed>
     */
    protected function validContactPayload(array $overrides = []): array
    {
        return array_merge([
            'name' => 'Maria Souza',
            'role' => 'Engenheira civil',
            'department' => 'Engenharia',
            'phone' => '+5531999999999',
            'whatsapp' => '+5531988888888',
            'email' => 'maria@example.com',
        ], $overrides);
    }
}
