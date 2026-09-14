<?php

namespace Tests\Feature\Budgets\Concerns;

use App\Enums\CompanyRole;
use App\Models\CatalogItem;
use App\Models\Company;
use App\Models\Customer;
use App\Models\User;
use App\Support\CurrentCompanyContext;
use Laravel\Sanctum\Sanctum;

trait InteractsWithBudgets
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

    protected function makeCatalogItem(array $attributes = []): CatalogItem
    {
        return $this->currentCompanyContext()->run(
            $this->activeTestCompany,
            fn () => CatalogItem::factory()->create(array_merge(['sale_price' => '150.00', 'cost_price' => '90.00'], $attributes))
        );
    }

    /**
     * @return array<string, mixed>
     */
    protected function validBudgetPayload(array $overrides = []): array
    {
        return array_merge([
            'title' => 'Reforma de banheiro',
        ], $overrides);
    }

    /**
     * @return array<string, mixed>
     */
    protected function manualItemPayload(array $overrides = []): array
    {
        return array_merge([
            'source_type' => 'manual',
            'name' => 'Mão de obra',
            'unit' => 'un',
            'quantity' => '1.000',
            'unit_price' => '100.00',
        ], $overrides);
    }

    /**
     * @return array<string, mixed>
     */
    protected function catalogItemPayload(CatalogItem $catalogItem, array $overrides = []): array
    {
        return array_merge([
            'source_type' => 'catalog',
            'catalog_item_id' => $catalogItem->id,
            'quantity' => '1.000',
        ], $overrides);
    }

    /**
     * @return array<string, mixed>
     */
    protected function calculatorItemPayload(array $overrides = []): array
    {
        return array_merge([
            'source_type' => 'calculator',
            'calculator_type' => 'floor',
            'name' => 'Piso calculado',
            'unit' => 'm2',
            'quantity' => '10.000',
            'unit_price' => '80.00',
            'calculation_snapshot' => ['largura' => '4', 'comprimento' => '2.5'],
        ], $overrides);
    }
}
