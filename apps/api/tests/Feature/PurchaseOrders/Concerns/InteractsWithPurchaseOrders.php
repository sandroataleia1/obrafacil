<?php

namespace Tests\Feature\PurchaseOrders\Concerns;

use App\Enums\CompanyRole;
use App\Models\Company;
use App\Models\Customer;
use App\Models\Material;
use App\Models\Project;
use App\Models\PurchaseOrder;
use App\Models\PurchaseOrderItem;
use App\Models\Supplier;
use App\Models\User;
use App\Support\CurrentCompanyContext;
use Laravel\Sanctum\Sanctum;

trait InteractsWithPurchaseOrders
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
        return $this->currentCompanyContext()->run($company, fn () => Supplier::factory()->create($attributes));
    }

    protected function makeProjectForCompany(Company $company, array $attributes = []): Project
    {
        return $this->currentCompanyContext()->run(
            $company,
            fn () => Project::factory()->create(array_merge(['customer_id' => Customer::factory()], $attributes))
        );
    }

    protected function makeMaterialForCompany(Company $company, array $attributes = []): Material
    {
        return $this->currentCompanyContext()->run($company, fn () => Material::factory()->create($attributes));
    }

    protected function makePurchaseOrderForCompany(Company $company, array $attributes = []): PurchaseOrder
    {
        return $this->currentCompanyContext()->run(
            $company,
            function () use ($attributes) {
                $attributes['supplier_id'] ??= Supplier::factory()->create()->id;
                $attributes['project_id'] ??= Project::factory()->create(['customer_id' => Customer::factory()])->id;

                return PurchaseOrder::factory()->create($attributes);
            }
        );
    }

    protected function makeItemForPurchaseOrder(Company $company, PurchaseOrder $purchaseOrder, array $attributes = []): PurchaseOrderItem
    {
        return $this->currentCompanyContext()->run(
            $company,
            function () use ($purchaseOrder, $attributes) {
                $attributes['purchase_order_id'] = $purchaseOrder->id;
                $attributes['material_id'] ??= Material::factory()->create()->id;

                return PurchaseOrderItem::factory()->create($attributes);
            }
        );
    }

    /**
     * @return array<string, mixed>
     */
    protected function validPurchaseOrderPayload(array $overrides = []): array
    {
        return array_merge([
            'supplier_id' => $this->makeSupplierForCompany($this->activeTestCompany)->id,
            'project_id' => $this->makeProjectForCompany($this->activeTestCompany)->id,
            'order_date' => now()->toDateString(),
        ], $overrides);
    }

    /**
     * @return array<string, mixed>
     */
    protected function validPurchaseOrderItemPayload(array $overrides = []): array
    {
        return array_merge([
            'material_id' => $this->makeMaterialForCompany($this->activeTestCompany)->id,
            'description' => 'Cimento CP-II 50kg Votoran',
            'quantity' => '10.000',
            'unit_price' => '25.90',
        ], $overrides);
    }
}
