<?php

namespace Tests\Feature\ServiceOrders;

use App\Enums\CatalogItemType;
use App\Models\CatalogItem;
use App\Models\Company;
use App\Models\ServiceOrder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Feature\ServiceOrders\Concerns\InteractsWithServiceOrders;
use Tests\TestCase;

/**
 * BACKEND-06 §19-26/§43-46/§77. Item CRUD nested under
 * /service-orders/{serviceOrder}/items.
 */
class ServiceOrderItemApiTest extends TestCase
{
    use InteractsWithServiceOrders, RefreshDatabase;

    /**
     * @return array{0: Company, 1: string} [company, serviceOrderId]
     */
    private function createOpenOrder(array $overrides = []): array
    {
        [$company] = $this->actingAsNewCompanyMember();
        [$customer, $address] = $this->makeCustomerWithAddressAndContact();

        $response = $this->postJson('/api/v1/service-orders', $this->validServiceOrderPayload(array_merge([
            'customer_id' => $customer->id,
            'customer_address_id' => $address->id,
        ], $overrides)));

        return [$company, $response->json('id')];
    }

    /** I1: an O.S. with zero items is permitted (covered again here for the item-CRUD context). */
    public function test_i1_zero_items_permitted(): void
    {
        [, $orderId] = $this->createOpenOrder();

        $this->getJson("/api/v1/service-orders/{$orderId}")->assertJson(['items' => []]);
    }

    /** I2: adding an active CatalogItem succeeds. */
    public function test_i2_active_catalog_item_can_be_added(): void
    {
        [, $orderId] = $this->createOpenOrder();
        $catalogItem = $this->makeCatalogItem();

        $this->postJson("/api/v1/service-orders/{$orderId}/items", [
            'catalog_item_id' => $catalogItem->id,
            'quantity' => '1.000',
        ])->assertStatus(201);
    }

    /** I3: an inactive CatalogItem cannot be newly added. */
    public function test_i3_inactive_catalog_item_cannot_be_added(): void
    {
        [, $orderId] = $this->createOpenOrder();
        $inactive = $this->makeCatalogItem(['active' => false]);

        $this->postJson("/api/v1/service-orders/{$orderId}/items", [
            'catalog_item_id' => $inactive->id,
            'quantity' => '1.000',
        ])->assertStatus(422)->assertJsonValidationErrors(['catalog_item_id']);
    }

    /** I4: a cross-tenant catalog_item_id is a generic 422. */
    public function test_i4_cross_tenant_catalog_item_is_rejected(): void
    {
        [, $orderId] = $this->createOpenOrder();
        $otherItem = $this->currentCompanyContext()->run(
            Company::factory()->create(),
            fn () => CatalogItem::factory()->create()
        );

        $this->postJson("/api/v1/service-orders/{$orderId}/items", [
            'catalog_item_id' => $otherItem->id,
            'quantity' => '1.000',
        ])->assertStatus(422)->assertJsonValidationErrors(['catalog_item_id']);
    }

    /** I5: type/code/name/unit/description are snapshotted from the CatalogItem. */
    public function test_i5_snapshot_fields_are_copied(): void
    {
        [, $orderId] = $this->createOpenOrder();
        $catalogItem = $this->makeCatalogItem([
            'type' => CatalogItemType::Service,
            'code' => 'PINT-M2',
            'name' => 'Pintura de paredes',
            'unit' => 'm²',
            'description' => 'Duas demãos',
        ]);

        $response = $this->postJson("/api/v1/service-orders/{$orderId}/items", [
            'catalog_item_id' => $catalogItem->id,
            'quantity' => '1.000',
        ]);

        $response->assertJson([
            'type' => 'service',
            'code' => 'PINT-M2',
            'name' => 'Pintura de paredes',
            'unit' => 'm²',
            'description' => 'Duas demãos',
        ]);
    }

    /** I6: an omitted unit_price falls back to the CatalogItem's sale_price. */
    public function test_i6_omitted_unit_price_uses_sale_price(): void
    {
        [, $orderId] = $this->createOpenOrder();
        $catalogItem = $this->makeCatalogItem(['sale_price' => '77.50']);

        $this->postJson("/api/v1/service-orders/{$orderId}/items", [
            'catalog_item_id' => $catalogItem->id,
            'quantity' => '1.000',
        ])->assertJson(['unit_price' => '77.50']);
    }

    /** I7: sale_price null + unit_price omitted -> 422. */
    public function test_i7_no_price_available_is_rejected(): void
    {
        [, $orderId] = $this->createOpenOrder();
        $catalogItem = $this->makeCatalogItem(['sale_price' => null]);

        $this->postJson("/api/v1/service-orders/{$orderId}/items", [
            'catalog_item_id' => $catalogItem->id,
            'quantity' => '1.000',
        ])->assertStatus(422)->assertJsonValidationErrors(['unit_price']);
    }

    /** I8: an explicit unit_price overrides the catalog's sale_price. */
    public function test_i8_unit_price_override(): void
    {
        [, $orderId] = $this->createOpenOrder();
        $catalogItem = $this->makeCatalogItem(['sale_price' => '77.50']);

        $this->postJson("/api/v1/service-orders/{$orderId}/items", [
            'catalog_item_id' => $catalogItem->id,
            'quantity' => '1.000',
            'unit_price' => '99.99',
        ])->assertJson(['unit_price' => '99.99']);
    }

    /** I9: a decimal quantity (up to 3 places) is accepted. */
    public function test_i9_decimal_quantity_is_accepted(): void
    {
        [, $orderId] = $this->createOpenOrder();
        $catalogItem = $this->makeCatalogItem();

        $this->postJson("/api/v1/service-orders/{$orderId}/items", [
            'catalog_item_id' => $catalogItem->id,
            'quantity' => '12.750',
        ])->assertStatus(201)->assertJson(['quantity' => '12.750']);
    }

    /** I10: quantity=0 is rejected. */
    public function test_i10_zero_quantity_is_rejected(): void
    {
        [, $orderId] = $this->createOpenOrder();
        $catalogItem = $this->makeCatalogItem();

        $this->postJson("/api/v1/service-orders/{$orderId}/items", [
            'catalog_item_id' => $catalogItem->id,
            'quantity' => '0',
        ])->assertStatus(422)->assertJsonValidationErrors(['quantity']);
    }

    /** I11: a negative quantity is rejected. */
    public function test_i11_negative_quantity_is_rejected(): void
    {
        [, $orderId] = $this->createOpenOrder();
        $catalogItem = $this->makeCatalogItem();

        $this->postJson("/api/v1/service-orders/{$orderId}/items", [
            'catalog_item_id' => $catalogItem->id,
            'quantity' => '-1',
        ])->assertStatus(422)->assertJsonValidationErrors(['quantity']);
    }

    /** I12: line_discount defaults to 0.00. */
    public function test_i12_line_discount_defaults_to_zero(): void
    {
        [, $orderId] = $this->createOpenOrder();
        $catalogItem = $this->makeCatalogItem(['sale_price' => '10.00']);

        $this->postJson("/api/v1/service-orders/{$orderId}/items", [
            'catalog_item_id' => $catalogItem->id,
            'quantity' => '1.000',
        ])->assertJson(['line_discount' => '0.00']);
    }

    /** I13: a discount greater than the gross line is rejected. */
    public function test_i13_discount_greater_than_gross_is_rejected(): void
    {
        [, $orderId] = $this->createOpenOrder();
        $catalogItem = $this->makeCatalogItem(['sale_price' => '10.00']);

        $this->postJson("/api/v1/service-orders/{$orderId}/items", [
            'catalog_item_id' => $catalogItem->id,
            'quantity' => '1.000',
            'line_discount' => '10.01',
        ])->assertStatus(422)->assertJsonValidationErrors(['line_discount']);
    }

    /** I14: line_total = quantity × unit_price - line_discount. */
    public function test_i14_line_total_is_correct(): void
    {
        [, $orderId] = $this->createOpenOrder();
        $catalogItem = $this->makeCatalogItem(['sale_price' => '50.00']);

        $this->postJson("/api/v1/service-orders/{$orderId}/items", [
            'catalog_item_id' => $catalogItem->id,
            'quantity' => '3.000',
            'line_discount' => '5.00',
        ])->assertJson(['line_total' => '145.00']);
    }

    /** I15: POSTing an item recalculates the header totals. */
    public function test_i15_post_item_recalculates_totals(): void
    {
        [, $orderId] = $this->createOpenOrder();
        $catalogItem = $this->makeCatalogItem(['sale_price' => '50.00']);

        $this->postJson("/api/v1/service-orders/{$orderId}/items", [
            'catalog_item_id' => $catalogItem->id,
            'quantity' => '2.000',
        ])->assertStatus(201);

        $this->getJson("/api/v1/service-orders/{$orderId}")->assertJson(['subtotal' => '100.00', 'total' => '100.00']);
    }

    /** I16: PUTting an item recalculates the header totals. */
    public function test_i16_put_item_recalculates_totals(): void
    {
        [, $orderId] = $this->createOpenOrder();
        $catalogItem = $this->makeCatalogItem(['sale_price' => '50.00']);

        $itemId = $this->postJson("/api/v1/service-orders/{$orderId}/items", [
            'catalog_item_id' => $catalogItem->id,
            'quantity' => '2.000',
        ])->json('id');

        $this->putJson("/api/v1/service-orders/{$orderId}/items/{$itemId}", ['quantity' => '4.000'])
            ->assertOk()->assertJson(['line_total' => '200.00']);

        $this->getJson("/api/v1/service-orders/{$orderId}")->assertJson(['subtotal' => '200.00', 'total' => '200.00']);
    }

    /** I17: DELETEing an item recalculates the header totals. */
    public function test_i17_delete_item_recalculates_totals(): void
    {
        [, $orderId] = $this->createOpenOrder();
        $catalogItem = $this->makeCatalogItem(['sale_price' => '50.00']);

        $itemId = $this->postJson("/api/v1/service-orders/{$orderId}/items", [
            'catalog_item_id' => $catalogItem->id,
            'quantity' => '2.000',
        ])->json('id');

        $this->deleteJson("/api/v1/service-orders/{$orderId}/items/{$itemId}")->assertNoContent();

        $this->getJson("/api/v1/service-orders/{$orderId}")->assertJson(['subtotal' => '0.00', 'total' => '0.00', 'items' => []]);
    }

    /** I18: an item id belonging to a different order is a 404. */
    public function test_i18_cross_order_item_is_404(): void
    {
        [$company, $orderIdA] = $this->createOpenOrder();
        $catalogItem = $this->makeCatalogItem();
        $itemId = $this->postJson("/api/v1/service-orders/{$orderIdA}/items", [
            'catalog_item_id' => $catalogItem->id,
            'quantity' => '1.000',
        ])->json('id');

        [$customerB, $addressB] = $this->makeCustomerWithAddressAndContact();
        $orderIdB = $this->postJson('/api/v1/service-orders', $this->validServiceOrderPayload([
            'customer_id' => $customerB->id,
            'customer_address_id' => $addressB->id,
        ]))->json('id');

        $this->putJson("/api/v1/service-orders/{$orderIdB}/items/{$itemId}", ['quantity' => '2.000'])->assertStatus(404);
        $this->deleteJson("/api/v1/service-orders/{$orderIdB}/items/{$itemId}")->assertStatus(404);
    }

    /** I19: a terminal order blocks item mutation. */
    public function test_i19_terminal_order_blocks_item_mutation(): void
    {
        [, $orderId] = $this->createOpenOrder();
        $catalogItem = $this->makeCatalogItem();
        $itemId = $this->postJson("/api/v1/service-orders/{$orderId}/items", [
            'catalog_item_id' => $catalogItem->id,
            'quantity' => '1.000',
        ])->json('id');

        $this->postJson("/api/v1/service-orders/{$orderId}/complete")->assertOk();

        $this->postJson("/api/v1/service-orders/{$orderId}/items", [
            'catalog_item_id' => $catalogItem->id,
            'quantity' => '1.000',
        ])->assertStatus(409);
        $this->putJson("/api/v1/service-orders/{$orderId}/items/{$itemId}", ['quantity' => '2.000'])->assertStatus(409);
        $this->deleteJson("/api/v1/service-orders/{$orderId}/items/{$itemId}")->assertStatus(409);
    }

    /** I20: inactivating a CatalogItem afterwards does not alter an existing line's snapshot. */
    public function test_i20_inactivating_catalog_item_does_not_alter_existing_snapshot(): void
    {
        [$company, $orderId] = $this->createOpenOrder();
        $catalogItem = $this->makeCatalogItem(['name' => 'Serviço X', 'sale_price' => '20.00']);
        $itemId = $this->postJson("/api/v1/service-orders/{$orderId}/items", [
            'catalog_item_id' => $catalogItem->id,
            'quantity' => '1.000',
        ])->json('id');

        $this->currentCompanyContext()->run($company, function () use ($catalogItem) {
            $catalogItem->update(['active' => false, 'name' => 'Nome mudou']);
        });

        $this->getJson("/api/v1/service-orders/{$orderId}")->assertJsonFragment([
            'id' => $itemId,
            'name' => 'Serviço X',
            'unit_price' => '20.00',
        ]);
    }
}
