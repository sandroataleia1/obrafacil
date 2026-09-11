<?php

namespace Tests\Feature\ServiceOrders\Concerns;

use App\Enums\CompanyRole;
use App\Models\CatalogItem;
use App\Models\Company;
use App\Models\Customer;
use App\Models\CustomerAddress;
use App\Models\CustomerContact;
use App\Models\User;
use App\Support\CurrentCompanyContext;
use Laravel\Sanctum\Sanctum;

trait InteractsWithServiceOrders
{
    /**
     * Set by actingAsNewCompanyMember() — lets makeCustomerWithAddressAndContact()/
     * makeCatalogItem() below run inside the right CurrentCompanyContext
     * without every call site having to wrap itself in
     * currentCompanyContext()->run() (BelongsToCompany's creating hook
     * requires an active context even for plain factory ->create() calls
     * made directly in a test method, outside of an HTTP request).
     */
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

    /**
     * Creates a Customer + primary CustomerAddress + CustomerContact for
     * the company most recently set up via actingAsNewCompanyMember().
     *
     * @return array{0: Customer, 1: CustomerAddress, 2: CustomerContact}
     */
    protected function makeCustomerWithAddressAndContact(array $customerAttributes = []): array
    {
        return $this->currentCompanyContext()->run($this->activeTestCompany, function () use ($customerAttributes) {
            $customer = Customer::factory()->create(array_merge(['name' => 'Cliente Teste'], $customerAttributes));
            $address = CustomerAddress::factory()->create(['customer_id' => $customer->id, 'label' => 'Casa']);
            $contact = CustomerContact::factory()->create(['customer_id' => $customer->id, 'name' => 'Contato Teste']);

            return [$customer, $address, $contact];
        });
    }

    protected function makeCatalogItem(array $attributes = []): CatalogItem
    {
        return $this->currentCompanyContext()->run(
            $this->activeTestCompany,
            fn () => CatalogItem::factory()->create(array_merge(['sale_price' => '150.00'], $attributes))
        );
    }

    /**
     * @return array<string, mixed>
     */
    protected function validServiceOrderPayload(array $overrides = []): array
    {
        return array_merge([
            'title' => 'Manutenção elétrica',
            'description' => 'Troca de disjuntor',
        ], $overrides);
    }
}
