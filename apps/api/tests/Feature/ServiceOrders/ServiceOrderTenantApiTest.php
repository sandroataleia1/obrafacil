<?php

namespace Tests\Feature\ServiceOrders;

use App\Models\CatalogItem;
use App\Models\Company;
use App\Models\Customer;
use App\Models\CustomerAddress;
use App\Models\CustomerContact;
use App\Models\ServiceOrder;
use App\Models\User;
use App\ServiceOrders\ServiceOrderService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\Feature\ServiceOrders\Concerns\InteractsWithServiceOrders;
use Tests\TestCase;

/**
 * BACKEND-06 §55/§81. Cross-tenant protection: list never leaks,
 * show/update/actions 404, and cross-tenant ids in a payload are a
 * generic 422 indistinguishable from "doesn't exist".
 */
class ServiceOrderTenantApiTest extends TestCase
{
    use InteractsWithServiceOrders, RefreshDatabase;

    /** T1: Company A's list never shows Company B's orders. */
    public function test_t1_list_a_does_not_show_b(): void
    {
        [$companyB] = $this->actingAsNewCompanyMember();
        [$customerB, $addressB] = $this->makeCustomerWithAddressAndContact();
        $this->postJson('/api/v1/service-orders', $this->validServiceOrderPayload([
            'customer_id' => $customerB->id,
            'customer_address_id' => $addressB->id,
        ]))->assertStatus(201);

        $this->actingAsNewCompanyMember();
        $this->getJson('/api/v1/service-orders')->assertJsonCount(0, 'data');
    }

    /** T2: showing Company B's order as Company A is a 404. */
    public function test_t2_show_b_as_a_is_404(): void
    {
        $orderIdB = $this->createOrderInFreshCompany();

        $this->actingAsNewCompanyMember();
        $this->getJson("/api/v1/service-orders/{$orderIdB}")->assertStatus(404);
    }

    /** T3: updating Company B's order as Company A is a 404. */
    public function test_t3_update_b_as_a_is_404(): void
    {
        $orderIdB = $this->createOrderInFreshCompany();

        $this->actingAsNewCompanyMember();
        [$customer, $address] = $this->makeCustomerWithAddressAndContact();
        $this->putJson("/api/v1/service-orders/{$orderIdB}", $this->validServiceOrderPayload([
            'customer_id' => $customer->id,
            'customer_address_id' => $address->id,
        ]))->assertStatus(404);
    }

    /** T4: starting Company B's order as Company A is a 404. */
    public function test_t4_start_b_as_a_is_404(): void
    {
        $orderIdB = $this->createOrderInFreshCompany();

        $this->actingAsNewCompanyMember();
        $this->postJson("/api/v1/service-orders/{$orderIdB}/start")->assertStatus(404);
    }

    /** T5: completing Company B's order as Company A is a 404. */
    public function test_t5_complete_b_as_a_is_404(): void
    {
        $orderIdB = $this->createOrderInFreshCompany();

        $this->actingAsNewCompanyMember();
        $this->postJson("/api/v1/service-orders/{$orderIdB}/complete")->assertStatus(404);
    }

    /** T6: cancelling Company B's order as Company A is a 404. */
    public function test_t6_cancel_b_as_a_is_404(): void
    {
        $orderIdB = $this->createOrderInFreshCompany();

        $this->actingAsNewCompanyMember();
        $this->postJson("/api/v1/service-orders/{$orderIdB}/cancel", ['reason' => 'x'])->assertStatus(404);
    }

    /** T7: a nested item belonging to Company B's order is a 404 for Company A. */
    public function test_t7_nested_item_cross_tenant_is_404(): void
    {
        [$companyB, $orderIdB, $itemIdB] = $this->createOrderWithItemInFreshCompany();

        [$companyA] = $this->actingAsNewCompanyMember();
        [$customerA, $addressA] = $this->makeCustomerWithAddressAndContact();
        $orderIdA = $this->postJson('/api/v1/service-orders', $this->validServiceOrderPayload([
            'customer_id' => $customerA->id,
            'customer_address_id' => $addressA->id,
        ]))->json('id');

        // Company A's own order, but Company B's item id nested under it.
        $this->putJson("/api/v1/service-orders/{$orderIdA}/items/{$itemIdB}", ['quantity' => '2.000'])->assertStatus(404);
        $this->deleteJson("/api/v1/service-orders/{$orderIdA}/items/{$itemIdB}")->assertStatus(404);
        // Company B's order id entirely, from Company A's session.
        $this->putJson("/api/v1/service-orders/{$orderIdB}/items/{$itemIdB}", ['quantity' => '2.000'])->assertStatus(404);
    }

    /** T8: Company B's customer_id in Company A's create payload is a generic 422. */
    public function test_t8_customer_b_in_payload_a_is_422(): void
    {
        $customerB = $this->currentCompanyContext()->run(Company::factory()->create(), fn () => Customer::factory()->create());

        $this->actingAsNewCompanyMember();
        [, $address] = $this->makeCustomerWithAddressAndContact();

        $this->postJson('/api/v1/service-orders', $this->validServiceOrderPayload([
            'customer_id' => $customerB->id,
            'customer_address_id' => $address->id,
        ]))->assertStatus(422)->assertJsonValidationErrors(['customer_id']);
    }

    /** T9: Company B's address_id in Company A's payload is a generic 422. */
    public function test_t9_address_b_in_payload_a_is_422(): void
    {
        $addressB = $this->currentCompanyContext()->run(Company::factory()->create(), function () {
            $customer = Customer::factory()->create();

            return CustomerAddress::factory()->create(['customer_id' => $customer->id]);
        });

        $this->actingAsNewCompanyMember();
        [$customer] = $this->makeCustomerWithAddressAndContact();

        $this->postJson('/api/v1/service-orders', $this->validServiceOrderPayload([
            'customer_id' => $customer->id,
            'customer_address_id' => $addressB->id,
        ]))->assertStatus(422)->assertJsonValidationErrors(['customer_address_id']);
    }

    /** T10: Company B's contact_id in Company A's payload is a generic 422. */
    public function test_t10_contact_b_in_payload_a_is_422(): void
    {
        $contactB = $this->currentCompanyContext()->run(Company::factory()->create(), function () {
            $customer = Customer::factory()->create();

            return CustomerContact::factory()->create(['customer_id' => $customer->id]);
        });

        $this->actingAsNewCompanyMember();
        [$customer, $address] = $this->makeCustomerWithAddressAndContact();

        $this->postJson('/api/v1/service-orders', $this->validServiceOrderPayload([
            'customer_id' => $customer->id,
            'customer_address_id' => $address->id,
            'customer_contact_id' => $contactB->id,
        ]))->assertStatus(422)->assertJsonValidationErrors(['customer_contact_id']);
    }

    /** T11: Company B's catalog_item_id in Company A's item payload is a generic 422. */
    public function test_t11_catalog_b_in_payload_a_is_422(): void
    {
        $catalogB = $this->currentCompanyContext()->run(Company::factory()->create(), fn () => CatalogItem::factory()->create());

        $this->actingAsNewCompanyMember();
        [$customer, $address] = $this->makeCustomerWithAddressAndContact();

        $this->postJson('/api/v1/service-orders', $this->validServiceOrderPayload([
            'customer_id' => $customer->id,
            'customer_address_id' => $address->id,
            'items' => [['catalog_item_id' => $catalogB->id, 'quantity' => '1.000']],
        ]))->assertStatus(422)->assertJsonValidationErrors(['catalog_item_id']);
    }

    /** T12: a non-member responsible_user_id is rejected as a generic 422 (see also C20). */
    public function test_t12_non_member_responsible_is_422(): void
    {
        $this->actingAsNewCompanyMember();
        [$customer, $address] = $this->makeCustomerWithAddressAndContact();
        $outsider = User::factory()->create();

        $this->postJson('/api/v1/service-orders', $this->validServiceOrderPayload([
            'customer_id' => $customer->id,
            'customer_address_id' => $address->id,
            'responsible_user_id' => $outsider->id,
        ]))->assertStatus(422)->assertJsonValidationErrors(['responsible_user_id']);
    }

    /** T13: a syntactically valid but nonexistent id behaves identically to a cross-tenant id. */
    public function test_t13_random_id_and_cross_tenant_look_identical(): void
    {
        $randomId = (string) Str::uuid();
        $crossTenantId = $this->createOrderInFreshCompany();

        $this->actingAsNewCompanyMember();

        $randomResponse = $this->getJson("/api/v1/service-orders/{$randomId}");
        $crossTenantResponse = $this->getJson("/api/v1/service-orders/{$crossTenantId}");

        // Both a genuinely nonexistent id and a real id belonging to
        // another tenant produce the exact same 404 shape — nothing in
        // the response lets a client tell them apart (the only thing
        // that legitimately differs between the two is the id itself,
        // embedded in Laravel's debug-mode exception message).
        $randomResponse->assertStatus(404);
        $crossTenantResponse->assertStatus(404);
        $this->assertSame($randomResponse->json('exception'), $crossTenantResponse->json('exception'));
        $this->assertStringStartsWith('No query results for model [App\\Models\\ServiceOrder]', (string) $randomResponse->json('message'));
        $this->assertStringStartsWith('No query results for model [App\\Models\\ServiceOrder]', (string) $crossTenantResponse->json('message'));
    }

    /** T14: without a resolved company context, ServiceOrder queries fail closed (never return everything). */
    public function test_t14_fails_closed_without_context(): void
    {
        $this->expectException(\RuntimeException::class);
        ServiceOrder::query()->count();
    }

    private function createOrderInFreshCompany(): string
    {
        return $this->currentCompanyContext()->run(Company::factory()->create(), function () {
            $customer = Customer::factory()->create();
            $address = CustomerAddress::factory()->create(['customer_id' => $customer->id]);
            $user = User::factory()->create();

            $order = app(ServiceOrderService::class)->create([
                'customer_id' => $customer->id,
                'customer_address_id' => $address->id,
                'title' => 'O.S. de outra empresa',
            ], $user);

            return $order->id;
        });
    }

    /**
     * @return array{0: Company, 1: string, 2: string} [company, orderId, itemId]
     */
    private function createOrderWithItemInFreshCompany(): array
    {
        $company = Company::factory()->create();

        return $this->currentCompanyContext()->run($company, function () use ($company) {
            $customer = Customer::factory()->create();
            $address = CustomerAddress::factory()->create(['customer_id' => $customer->id]);
            $catalogItem = CatalogItem::factory()->create();
            $user = User::factory()->create();

            $order = app(ServiceOrderService::class)->create([
                'customer_id' => $customer->id,
                'customer_address_id' => $address->id,
                'title' => 'O.S. de outra empresa',
                'items' => [['catalog_item_id' => $catalogItem->id, 'quantity' => '1.000']],
            ], $user);

            return [$company, $order->id, $order->items()->first()->id];
        });
    }
}
