<?php

namespace Tests\Feature\ServiceOrders;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Feature\ServiceOrders\Concerns\InteractsWithServiceOrders;
use Tests\TestCase;

/**
 * BACKEND-06 §56-63/§80. GET /service-orders (list) and GET
 * /service-orders/{id} (show).
 */
class ServiceOrderListApiTest extends TestCase
{
    use InteractsWithServiceOrders, RefreshDatabase;

    private function createOrder(array $overrides = []): string
    {
        [$customer, $address, $contact] = $this->makeCustomerWithAddressAndContact();

        return $this->postJson('/api/v1/service-orders', $this->validServiceOrderPayload(array_merge([
            'customer_id' => $customer->id,
            'customer_address_id' => $address->id,
            'customer_contact_id' => $contact->id,
        ], $overrides)))->json('id');
    }

    /** L1: pagination shape. */
    public function test_l1_pagination(): void
    {
        $this->actingAsNewCompanyMember();
        for ($i = 0; $i < 3; $i++) {
            $this->createOrder();
        }

        $response = $this->getJson('/api/v1/service-orders?per_page=2&page=1');

        $response->assertOk();
        $this->assertCount(2, $response->json('data'));
        $this->assertSame(3, $response->json('meta.total'));
    }

    /** L2: per_page is clamped to 100. */
    public function test_l2_per_page_clamped_to_100(): void
    {
        $this->actingAsNewCompanyMember();
        $this->createOrder();

        $response = $this->getJson('/api/v1/service-orders?per_page=500');

        $response->assertOk();
        $this->assertSame(100, $response->json('meta.per_page'));
    }

    /** L3: deterministic ordering — newest first. */
    public function test_l3_deterministic_order(): void
    {
        $this->actingAsNewCompanyMember();
        $first = $this->createOrder();
        $second = $this->createOrder();

        $response = $this->getJson('/api/v1/service-orders');

        $this->assertSame($second, $response->json('data.0.id'));
        $this->assertSame($first, $response->json('data.1.id'));
    }

    /** L4: search by number. */
    public function test_l4_search_by_number(): void
    {
        $this->actingAsNewCompanyMember();
        $this->createOrder();

        $this->getJson('/api/v1/service-orders?search=OS-000001')
            ->assertJsonCount(1, 'data');
    }

    /** L5: search by title. */
    public function test_l5_search_by_title(): void
    {
        $this->actingAsNewCompanyMember();
        $this->createOrder(['title' => 'Troca de disjuntor', 'description' => null]);
        $this->createOrder(['title' => 'Instalação de tomada', 'description' => null]);

        $this->getJson('/api/v1/service-orders?search=disjuntor')->assertJsonCount(1, 'data');
    }

    /** L6: search by customer snapshot name. */
    public function test_l6_search_by_customer_snapshot(): void
    {
        $this->actingAsNewCompanyMember();
        [$customer, $address] = $this->makeCustomerWithAddressAndContact(['name' => 'João Engenheiro']);
        $this->postJson('/api/v1/service-orders', $this->validServiceOrderPayload([
            'customer_id' => $customer->id,
            'customer_address_id' => $address->id,
        ]))->assertStatus(201);

        $this->getJson('/api/v1/service-orders?search=João')->assertJsonCount(1, 'data');
    }

    /** L7: search by contact snapshot name. */
    public function test_l7_search_by_contact_snapshot(): void
    {
        $this->actingAsNewCompanyMember();
        [$customer, $address, $contact] = $this->makeCustomerWithAddressAndContact();
        $contact->update(['name' => 'Maria Contato Especial']);
        $this->postJson('/api/v1/service-orders', $this->validServiceOrderPayload([
            'customer_id' => $customer->id,
            'customer_address_id' => $address->id,
            'customer_contact_id' => $contact->id,
        ]))->assertStatus(201);

        $this->getJson('/api/v1/service-orders?search=Especial')->assertJsonCount(1, 'data');
    }

    /** L8: search by execution address/city. */
    public function test_l8_search_by_address_city(): void
    {
        $this->actingAsNewCompanyMember();
        [$customer, $address] = $this->makeCustomerWithAddressAndContact();
        $address->update(['city' => 'Uberlândia']);
        $this->postJson('/api/v1/service-orders', $this->validServiceOrderPayload([
            'customer_id' => $customer->id,
            'customer_address_id' => $address->id,
        ]))->assertStatus(201);

        $this->getJson('/api/v1/service-orders?search=Uberlândia')->assertJsonCount(1, 'data');
    }

    /** L9: filter by status. */
    public function test_l9_filter_by_status(): void
    {
        $this->actingAsNewCompanyMember();
        $orderId = $this->createOrder();
        $this->createOrder();
        $this->postJson("/api/v1/service-orders/{$orderId}/cancel", ['reason' => 'x'])->assertOk();

        $response = $this->getJson('/api/v1/service-orders?status=cancelled');
        $response->assertJsonCount(1, 'data');
        $this->assertSame($orderId, $response->json('data.0.id'));
    }

    /** An invalid status filter is a 422. */
    public function test_l9b_invalid_status_filter_is_422(): void
    {
        $this->actingAsNewCompanyMember();

        $this->getJson('/api/v1/service-orders?status=bogus')->assertStatus(422);
    }

    /** L10: filter by customer_id. */
    public function test_l10_filter_by_customer(): void
    {
        $this->actingAsNewCompanyMember();
        [$customerA, $addressA] = $this->makeCustomerWithAddressAndContact();
        $orderA = $this->postJson('/api/v1/service-orders', $this->validServiceOrderPayload([
            'customer_id' => $customerA->id,
            'customer_address_id' => $addressA->id,
        ]))->json('id');
        $this->createOrder();

        $response = $this->getJson("/api/v1/service-orders?customer_id={$customerA->id}");
        $response->assertJsonCount(1, 'data');
        $this->assertSame($orderA, $response->json('data.0.id'));
    }

    /** L11: list item shape. */
    public function test_l11_list_shape(): void
    {
        $this->actingAsNewCompanyMember();
        $this->createOrder();

        $response = $this->getJson('/api/v1/service-orders');

        $response->assertJsonStructure(['data' => [[
            'id', 'number', 'status', 'title',
            'customer' => ['id', 'name'],
            'execution_address' => ['label', 'city', 'state'],
            'contact' => ['name', 'role'],
            'scheduled_start_at', 'subtotal', 'order_discount', 'travel_fee', 'total',
            'created_at', 'updated_at',
        ]]]);
    }

    /** L12: show includes items[]. */
    public function test_l12_show_includes_items(): void
    {
        $this->actingAsNewCompanyMember();
        [$customer, $address] = $this->makeCustomerWithAddressAndContact();
        $catalogItem = $this->makeCatalogItem();
        $orderId = $this->postJson('/api/v1/service-orders', $this->validServiceOrderPayload([
            'customer_id' => $customer->id,
            'customer_address_id' => $address->id,
            'items' => [['catalog_item_id' => $catalogItem->id, 'quantity' => '1.000']],
        ]))->json('id');

        $this->getJson("/api/v1/service-orders/{$orderId}")->assertJsonStructure([
            'items' => [['id', 'catalog_item_id', 'type', 'code', 'name', 'unit', 'description', 'quantity', 'unit_price', 'line_discount', 'line_total', 'notes', 'sort_order']],
        ]);
    }

    /** L13: money/quantity are always strings. */
    public function test_l13_money_strings(): void
    {
        $this->actingAsNewCompanyMember();
        $this->createOrder();

        $raw = $this->getJson('/api/v1/service-orders')->getContent();
        $this->assertStringContainsString('"subtotal":"0.00"', $raw);
    }

    /** L14: company_id is never exposed in list or show. */
    public function test_l14_company_id_never_exposed(): void
    {
        $this->actingAsNewCompanyMember();
        $orderId = $this->createOrder();

        $listRaw = $this->getJson('/api/v1/service-orders')->getContent();
        $showRaw = $this->getJson("/api/v1/service-orders/{$orderId}")->getContent();

        $this->assertStringNotContainsString('company_id', $listRaw);
        $this->assertStringNotContainsString('company_id', $showRaw);
    }
}
