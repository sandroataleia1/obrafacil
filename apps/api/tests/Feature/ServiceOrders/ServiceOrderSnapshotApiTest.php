<?php

namespace Tests\Feature\ServiceOrders;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Feature\ServiceOrders\Concerns\InteractsWithServiceOrders;
use Tests\TestCase;

/**
 * BACKEND-06 §4-9/§66/§82. Every snapshot field is copied once, at
 * selection time, and never re-derives from the live Customer/Address/
 * Contact/CatalogItem afterwards.
 */
class ServiceOrderSnapshotApiTest extends TestCase
{
    use InteractsWithServiceOrders, RefreshDatabase;

    /** H1: changing the Customer's name afterwards does not change the O.S. */
    public function test_h1_customer_name_change_does_not_propagate(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        [$customer, $address] = $this->makeCustomerWithAddressAndContact(['name' => 'Nome Original']);
        $orderId = $this->postJson('/api/v1/service-orders', $this->validServiceOrderPayload([
            'customer_id' => $customer->id,
            'customer_address_id' => $address->id,
        ]))->json('id');

        $this->currentCompanyContext()->run($company, fn () => $customer->update(['name' => 'Nome Mudou']));

        $this->getJson("/api/v1/service-orders/{$orderId}")->assertJson(['customer' => ['name' => 'Nome Original']]);
    }

    /** H2: changing the Customer's phone afterwards does not change the O.S. */
    public function test_h2_customer_phone_change_does_not_propagate(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        [$customer, $address] = $this->makeCustomerWithAddressAndContact(['phone' => '+5511911111111']);
        $orderId = $this->postJson('/api/v1/service-orders', $this->validServiceOrderPayload([
            'customer_id' => $customer->id,
            'customer_address_id' => $address->id,
        ]))->json('id');

        $this->currentCompanyContext()->run($company, fn () => $customer->update(['phone' => '+5511922222222']));

        $this->getJson("/api/v1/service-orders/{$orderId}")->assertJson(['customer' => ['phone' => '+5511911111111']]);
    }

    /** H3: changing the Address afterwards does not change the O.S. */
    public function test_h3_address_change_does_not_propagate(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        [$customer, $address] = $this->makeCustomerWithAddressAndContact();
        $address->update(['city' => 'Cidade Original']);
        $orderId = $this->postJson('/api/v1/service-orders', $this->validServiceOrderPayload([
            'customer_id' => $customer->id,
            'customer_address_id' => $address->id,
        ]))->json('id');

        $this->currentCompanyContext()->run($company, fn () => $address->update(['city' => 'Cidade Mudou']));

        $this->getJson("/api/v1/service-orders/{$orderId}")->assertJson(['execution_address' => ['city' => 'Cidade Original']]);
    }

    /** H4: deleting the Address leaves the FK null but the snapshot intact. */
    public function test_h4_address_deletion_nulls_fk_keeps_snapshot(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        [$customer, $address] = $this->makeCustomerWithAddressAndContact();
        $address->update(['label' => 'Endereço Original', 'city' => 'Cidade X']);
        $orderId = $this->postJson('/api/v1/service-orders', $this->validServiceOrderPayload([
            'customer_id' => $customer->id,
            'customer_address_id' => $address->id,
        ]))->json('id');

        $this->currentCompanyContext()->run($company, fn () => $address->delete());

        $response = $this->getJson("/api/v1/service-orders/{$orderId}");
        $response->assertJson(['customer_address_id' => null, 'execution_address' => ['label' => 'Endereço Original', 'city' => 'Cidade X']]);
    }

    /** H5: changing the Contact afterwards does not change the O.S. */
    public function test_h5_contact_change_does_not_propagate(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        [$customer, $address, $contact] = $this->makeCustomerWithAddressAndContact();
        $contact->update(['name' => 'Contato Original']);
        $orderId = $this->postJson('/api/v1/service-orders', $this->validServiceOrderPayload([
            'customer_id' => $customer->id,
            'customer_address_id' => $address->id,
            'customer_contact_id' => $contact->id,
        ]))->json('id');

        $this->currentCompanyContext()->run($company, fn () => $contact->update(['name' => 'Contato Mudou']));

        $this->getJson("/api/v1/service-orders/{$orderId}")->assertJson(['contact' => ['name' => 'Contato Original']]);
    }

    /** H6: deleting the Contact leaves the FK null but the snapshot intact. */
    public function test_h6_contact_deletion_nulls_fk_keeps_snapshot(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        [$customer, $address, $contact] = $this->makeCustomerWithAddressAndContact();
        $contact->update(['name' => 'Contato Original']);
        $orderId = $this->postJson('/api/v1/service-orders', $this->validServiceOrderPayload([
            'customer_id' => $customer->id,
            'customer_address_id' => $address->id,
            'customer_contact_id' => $contact->id,
        ]))->json('id');

        $this->currentCompanyContext()->run($company, fn () => $contact->delete());

        $response = $this->getJson("/api/v1/service-orders/{$orderId}");
        $response->assertJson(['customer_contact_id' => null, 'contact' => ['name' => 'Contato Original']]);
    }

    /** H7: inactivating a CatalogItem afterwards does not change an existing line item. */
    public function test_h7_catalog_inactivation_does_not_change_line(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        [$customer, $address] = $this->makeCustomerWithAddressAndContact();
        $catalogItem = $this->makeCatalogItem(['name' => 'Item Original']);
        $orderId = $this->postJson('/api/v1/service-orders', $this->validServiceOrderPayload([
            'customer_id' => $customer->id,
            'customer_address_id' => $address->id,
            'items' => [['catalog_item_id' => $catalogItem->id, 'quantity' => '1.000']],
        ]))->json('id');

        $this->currentCompanyContext()->run($company, fn () => $catalogItem->update(['active' => false]));

        $this->getJson("/api/v1/service-orders/{$orderId}")->assertJsonFragment(['name' => 'Item Original']);
    }

    /** H8: changing the CatalogItem's name afterwards does not change an existing line item. */
    public function test_h8_catalog_name_change_does_not_propagate(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        [$customer, $address] = $this->makeCustomerWithAddressAndContact();
        $catalogItem = $this->makeCatalogItem(['name' => 'Nome Original']);
        $orderId = $this->postJson('/api/v1/service-orders', $this->validServiceOrderPayload([
            'customer_id' => $customer->id,
            'customer_address_id' => $address->id,
            'items' => [['catalog_item_id' => $catalogItem->id, 'quantity' => '1.000']],
        ]))->json('id');

        $this->currentCompanyContext()->run($company, fn () => $catalogItem->update(['name' => 'Nome Mudou']));

        $this->getJson("/api/v1/service-orders/{$orderId}")->assertJsonFragment(['name' => 'Nome Original']);
    }

    /** H9: changing the CatalogItem's sale_price afterwards does not change the line's unit_price. */
    public function test_h9_catalog_sale_price_change_does_not_propagate(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        [$customer, $address] = $this->makeCustomerWithAddressAndContact();
        $catalogItem = $this->makeCatalogItem(['sale_price' => '50.00']);
        $orderId = $this->postJson('/api/v1/service-orders', $this->validServiceOrderPayload([
            'customer_id' => $customer->id,
            'customer_address_id' => $address->id,
            'items' => [['catalog_item_id' => $catalogItem->id, 'quantity' => '1.000']],
        ]))->json('id');

        $this->currentCompanyContext()->run($company, fn () => $catalogItem->update(['sale_price' => '999.00']));

        $this->getJson("/api/v1/service-orders/{$orderId}")->assertJsonFragment(['unit_price' => '50.00']);
    }

    /** H10: completing an O.S. still preserves every snapshot immutably (no field is recomputed on completion). */
    public function test_h10_completed_order_keeps_snapshots_immutable(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        [$customer, $address, $contact] = $this->makeCustomerWithAddressAndContact(['name' => 'Cliente Final']);
        $orderId = $this->postJson('/api/v1/service-orders', $this->validServiceOrderPayload([
            'customer_id' => $customer->id,
            'customer_address_id' => $address->id,
            'customer_contact_id' => $contact->id,
        ]))->json('id');

        $this->postJson("/api/v1/service-orders/{$orderId}/complete")->assertOk();

        $this->currentCompanyContext()->run($company, function () use ($customer, $address, $contact) {
            $customer->update(['name' => 'Outro nome']);
            $address->update(['city' => 'Outra cidade']);
            $contact->update(['name' => 'Outro contato']);
        });

        $this->getJson("/api/v1/service-orders/{$orderId}")->assertJson([
            'status' => 'completed',
            'customer' => ['name' => 'Cliente Final'],
        ]);
    }
}
