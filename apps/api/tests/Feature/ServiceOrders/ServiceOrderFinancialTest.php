<?php

namespace Tests\Feature\ServiceOrders;

use App\ServiceOrders\Money;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Feature\ServiceOrders\Concerns\InteractsWithServiceOrders;
use Tests\TestCase;

/**
 * BACKEND-06 §25-30/§78. Money formula: subtotal = SUM(line_total),
 * total = subtotal - order_discount + travel_fee.
 */
class ServiceOrderFinancialTest extends TestCase
{
    use InteractsWithServiceOrders, RefreshDatabase;

    /** F1: subtotal sums every line's line_total. */
    public function test_f1_subtotal_sums_lines(): void
    {
        $this->actingAsNewCompanyMember();
        [$customer, $address] = $this->makeCustomerWithAddressAndContact();
        $itemA = $this->makeCatalogItem(['sale_price' => '10.00']);
        $itemB = $this->makeCatalogItem(['sale_price' => '25.00']);

        $response = $this->postJson('/api/v1/service-orders', $this->validServiceOrderPayload([
            'customer_id' => $customer->id,
            'customer_address_id' => $address->id,
            'items' => [
                ['catalog_item_id' => $itemA->id, 'quantity' => '2.000'],
                ['catalog_item_id' => $itemB->id, 'quantity' => '1.000'],
            ],
        ]));

        $response->assertJson(['subtotal' => '45.00']);
    }

    /** F2: order_discount is applied on top of the items' subtotal. */
    public function test_f2_order_discount_applies(): void
    {
        $this->actingAsNewCompanyMember();
        [$customer, $address] = $this->makeCustomerWithAddressAndContact();
        $item = $this->makeCatalogItem(['sale_price' => '100.00']);

        $response = $this->postJson('/api/v1/service-orders', $this->validServiceOrderPayload([
            'customer_id' => $customer->id,
            'customer_address_id' => $address->id,
            'order_discount' => '20.00',
            'items' => [['catalog_item_id' => $item->id, 'quantity' => '1.000']],
        ]));

        $response->assertJson(['subtotal' => '100.00', 'order_discount' => '20.00', 'total' => '80.00']);
    }

    /** F3: travel_fee is added after the discount. */
    public function test_f3_travel_fee_added_after_discount(): void
    {
        $this->actingAsNewCompanyMember();
        [$customer, $address] = $this->makeCustomerWithAddressAndContact();
        $item = $this->makeCatalogItem(['sale_price' => '100.00']);

        $response = $this->postJson('/api/v1/service-orders', $this->validServiceOrderPayload([
            'customer_id' => $customer->id,
            'customer_address_id' => $address->id,
            'order_discount' => '20.00',
            'travel_fee' => '30.00',
            'items' => [['catalog_item_id' => $item->id, 'quantity' => '1.000']],
        ]));

        $response->assertJson(['total' => '110.00']);
    }

    /** F4: the exact canonical formula holds. */
    public function test_f4_exact_formula(): void
    {
        $this->actingAsNewCompanyMember();
        [$customer, $address] = $this->makeCustomerWithAddressAndContact();
        $item = $this->makeCatalogItem(['sale_price' => '150.00']);

        $response = $this->postJson('/api/v1/service-orders', $this->validServiceOrderPayload([
            'customer_id' => $customer->id,
            'customer_address_id' => $address->id,
            'order_discount' => '15.50',
            'travel_fee' => '45.25',
            'items' => [['catalog_item_id' => $item->id, 'quantity' => '2.000']],
        ]));

        // subtotal=300.00, total = 300.00 - 15.50 + 45.25 = 329.75
        $response->assertJson(['subtotal' => '300.00', 'total' => '329.75']);
    }

    /** F5: a discount greater than subtotal is rejected. */
    public function test_f5_discount_greater_than_subtotal_is_rejected(): void
    {
        $this->actingAsNewCompanyMember();
        [$customer, $address] = $this->makeCustomerWithAddressAndContact();
        $item = $this->makeCatalogItem(['sale_price' => '100.00']);

        $this->postJson('/api/v1/service-orders', $this->validServiceOrderPayload([
            'customer_id' => $customer->id,
            'customer_address_id' => $address->id,
            'order_discount' => '100.01',
            'items' => [['catalog_item_id' => $item->id, 'quantity' => '1.000']],
        ]))->assertStatus(422)->assertJsonValidationErrors(['order_discount']);
    }

    /** F6: a negative travel_fee is rejected. */
    public function test_f6_negative_travel_fee_is_rejected(): void
    {
        $this->actingAsNewCompanyMember();
        [$customer, $address] = $this->makeCustomerWithAddressAndContact();

        $this->postJson('/api/v1/service-orders', $this->validServiceOrderPayload([
            'customer_id' => $customer->id,
            'customer_address_id' => $address->id,
            'travel_fee' => '-10.00',
        ]))->assertStatus(422)->assertJsonValidationErrors(['travel_fee']);
    }

    /** F7: zero items with a travel fee is a valid O.S. */
    public function test_f7_zero_items_with_travel_fee(): void
    {
        $this->actingAsNewCompanyMember();
        [$customer, $address] = $this->makeCustomerWithAddressAndContact();

        $this->postJson('/api/v1/service-orders', $this->validServiceOrderPayload([
            'customer_id' => $customer->id,
            'customer_address_id' => $address->id,
            'travel_fee' => '90.00',
        ]))->assertStatus(201)->assertJson(['subtotal' => '0.00', 'order_discount' => '0.00', 'total' => '90.00']);
    }

    /** F8: zero items with a positive discount is rejected. */
    public function test_f8_zero_items_with_discount_is_rejected(): void
    {
        $this->actingAsNewCompanyMember();
        [$customer, $address] = $this->makeCustomerWithAddressAndContact();

        $this->postJson('/api/v1/service-orders', $this->validServiceOrderPayload([
            'customer_id' => $customer->id,
            'customer_address_id' => $address->id,
            'order_discount' => '0.01',
        ]))->assertStatus(422)->assertJsonValidationErrors(['order_discount']);
    }

    /** F9: sale_price < cost_price on the CatalogItem is irrelevant to O.S. math. */
    public function test_f9_sale_below_cost_is_irrelevant(): void
    {
        $this->actingAsNewCompanyMember();
        [$customer, $address] = $this->makeCustomerWithAddressAndContact();
        $item = $this->makeCatalogItem(['cost_price' => '500.00', 'sale_price' => '10.00']);

        $this->postJson('/api/v1/service-orders', $this->validServiceOrderPayload([
            'customer_id' => $customer->id,
            'customer_address_id' => $address->id,
            'items' => [['catalog_item_id' => $item->id, 'quantity' => '1.000']],
        ]))->assertStatus(201)->assertJson(['subtotal' => '10.00']);
    }

    /** F10: the smallest monetary unit (0.01) round-trips exactly. */
    public function test_f10_one_cent(): void
    {
        $this->actingAsNewCompanyMember();
        [$customer, $address] = $this->makeCustomerWithAddressAndContact();
        $item = $this->makeCatalogItem(['sale_price' => '0.01']);

        $this->postJson('/api/v1/service-orders', $this->validServiceOrderPayload([
            'customer_id' => $customer->id,
            'customer_address_id' => $address->id,
            'items' => [['catalog_item_id' => $item->id, 'quantity' => '1.000']],
        ]))->assertJson(['subtotal' => '0.01']);
    }

    /** F11: decimal quantity × price rounds using the documented half-up rule. */
    public function test_f11_documented_rounding_half_up(): void
    {
        // 3 × 0.335 = 1.005 -> half-up rounds to 1.01 (not banker's 1.00).
        $this->assertSame('1.01', Money::round('1.005', 2));
        $this->assertSame('2.35', Money::round('2.345', 2));
        $this->assertSame('2.34', Money::round('2.344', 2));
        $this->assertSame('-2.35', Money::round('-2.345', 2));
    }

    /** F12: no float drift across a long chain of additions. */
    public function test_f12_no_float_drift(): void
    {
        $sum = '0.00';
        for ($i = 0; $i < 1000; $i++) {
            $sum = Money::add($sum, '0.10');
        }

        // 1000 × 0.10 = 100.00 exactly — a float accumulation of 0.1 would
        // drift away from this (classic 0.1 + 0.1 + ... imprecision).
        $this->assertSame('100.00', $sum);
    }

    /** F13: money is always a JSON string, never a float. */
    public function test_f13_money_is_json_string(): void
    {
        $this->actingAsNewCompanyMember();
        [$customer, $address] = $this->makeCustomerWithAddressAndContact();

        $response = $this->postJson('/api/v1/service-orders', $this->validServiceOrderPayload([
            'customer_id' => $customer->id,
            'customer_address_id' => $address->id,
            'travel_fee' => '10.00',
        ]));

        $raw = $response->getContent();
        $this->assertStringContainsString('"total":"10.00"', $raw);
        $this->assertStringNotContainsString('"total":10', $raw);
    }

    /** F14: editing an item's quantity updates the header totals (see also I16). */
    public function test_f14_item_edit_updates_header_totals(): void
    {
        $this->actingAsNewCompanyMember();
        [$customer, $address] = $this->makeCustomerWithAddressAndContact();
        $item = $this->makeCatalogItem(['sale_price' => '10.00']);

        $orderId = $this->postJson('/api/v1/service-orders', $this->validServiceOrderPayload([
            'customer_id' => $customer->id,
            'customer_address_id' => $address->id,
            'items' => [['catalog_item_id' => $item->id, 'quantity' => '1.000']],
        ]))->json('id');
        $itemId = $this->getJson("/api/v1/service-orders/{$orderId}")->json('items.0.id');

        $this->putJson("/api/v1/service-orders/{$orderId}/items/{$itemId}", ['quantity' => '5.000'])->assertOk();
        $this->getJson("/api/v1/service-orders/{$orderId}")->assertJson(['subtotal' => '50.00', 'total' => '50.00']);
    }

    /** F15: changing an O.S.'s travel_fee never changes the company's default setting. */
    public function test_f15_order_travel_fee_change_does_not_touch_setting(): void
    {
        $this->actingAsNewCompanyMember();
        $this->putJson('/api/v1/service-orders/settings', ['default_travel_fee' => '80.00'])->assertOk();
        [$customer, $address] = $this->makeCustomerWithAddressAndContact();

        $orderId = $this->postJson('/api/v1/service-orders', $this->validServiceOrderPayload([
            'customer_id' => $customer->id,
            'customer_address_id' => $address->id,
        ]))->json('id');

        $this->putJson("/api/v1/service-orders/{$orderId}", $this->validServiceOrderPayload([
            'customer_id' => $customer->id,
            'customer_address_id' => $address->id,
            'travel_fee' => '999.00',
        ]))->assertOk();

        $this->getJson('/api/v1/service-orders/settings')->assertJson(['default_travel_fee' => '80.00']);
    }

    /** F16: changing the company's default setting never changes an existing O.S. (see also S8). */
    public function test_f16_setting_change_does_not_touch_order(): void
    {
        $this->actingAsNewCompanyMember();
        $this->putJson('/api/v1/service-orders/settings', ['default_travel_fee' => '80.00'])->assertOk();
        [$customer, $address] = $this->makeCustomerWithAddressAndContact();

        $orderId = $this->postJson('/api/v1/service-orders', $this->validServiceOrderPayload([
            'customer_id' => $customer->id,
            'customer_address_id' => $address->id,
        ]))->json('id');

        $this->putJson('/api/v1/service-orders/settings', ['default_travel_fee' => '500.00'])->assertOk();

        $this->getJson("/api/v1/service-orders/{$orderId}")->assertJson(['travel_fee' => '80.00']);
    }
}
