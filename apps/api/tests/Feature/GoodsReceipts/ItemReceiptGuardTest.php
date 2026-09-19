<?php

namespace Tests\Feature\GoodsReceipts;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Feature\GoodsReceipts\Concerns\InteractsWithGoodsReceipts;
use Tests\TestCase;

/**
 * SUPPLY-API-01D §70, IG1-IG14.
 */
class ItemReceiptGuardTest extends TestCase
{
    use InteractsWithGoodsReceipts, RefreshDatabase;

    /** IG1: a partially received Item cannot reduce quantity below what's received. */
    public function test_ig1_partial_cannot_reduce_below_received(): void
    {
        $this->actingAsNewCompanyMember();
        [$order, $item] = $this->createOrderedOrderWithItem(['quantity' => '10.000']);
        $this->postJson($this->receiptsEndpoint($order['id']), $this->validGoodsReceiptPayload([
            'items' => [['purchase_order_item_id' => $item['id'], 'quantity' => '6.000']],
        ]))->assertCreated();

        $freshItem = $this->getJson("/api/v1/purchase-orders/{$order['id']}")->json('items.0');

        $this->putJson("/api/v1/purchase-orders/{$order['id']}/items/{$item['id']}", [
            'description' => $freshItem['description'], 'quantity' => '5.999', 'unit_price' => $freshItem['unit_price'],
            'updated_at' => $freshItem['updated_at'],
        ])->assertStatus(422)->assertJsonValidationErrors('quantity');
    }

    /** IG2: a partially received Item CAN reduce quantity to exactly the received amount. */
    public function test_ig2_can_reduce_exactly_to_received(): void
    {
        $this->actingAsNewCompanyMember();
        [$order, $item] = $this->createOrderedOrderWithItem(['quantity' => '10.000']);
        $this->postJson($this->receiptsEndpoint($order['id']), $this->validGoodsReceiptPayload([
            'items' => [['purchase_order_item_id' => $item['id'], 'quantity' => '6.000']],
        ]))->assertCreated();

        $freshItem = $this->getJson("/api/v1/purchase-orders/{$order['id']}")->json('items.0');

        $this->putJson("/api/v1/purchase-orders/{$order['id']}/items/{$item['id']}", [
            'description' => $freshItem['description'], 'quantity' => '6.000', 'unit_price' => $freshItem['unit_price'],
            'updated_at' => $freshItem['updated_at'],
        ])->assertOk()->assertJsonPath('quantity', '6.000');
    }

    /** IG3: a partially received Item can INCREASE quantity freely. */
    public function test_ig3_partial_can_increase_quantity(): void
    {
        $this->actingAsNewCompanyMember();
        [$order, $item] = $this->createOrderedOrderWithItem(['quantity' => '10.000']);
        $this->postJson($this->receiptsEndpoint($order['id']), $this->validGoodsReceiptPayload([
            'items' => [['purchase_order_item_id' => $item['id'], 'quantity' => '6.000']],
        ]))->assertCreated();

        $freshItem = $this->getJson("/api/v1/purchase-orders/{$order['id']}")->json('items.0');

        $this->putJson("/api/v1/purchase-orders/{$order['id']}/items/{$item['id']}", [
            'description' => $freshItem['description'], 'quantity' => '20.000', 'unit_price' => $freshItem['unit_price'],
            'updated_at' => $freshItem['updated_at'],
        ])->assertOk()->assertJsonPath('quantity', '20.000');
    }

    /** IG4: a fully received Item cannot reduce quantity. */
    public function test_ig4_fully_received_frozen_downward(): void
    {
        $this->actingAsNewCompanyMember();
        [$order, $item] = $this->createOrderedOrderWithItem(['quantity' => '10.000']);
        $this->postJson($this->receiptsEndpoint($order['id']), $this->validGoodsReceiptPayload([
            'items' => [['purchase_order_item_id' => $item['id'], 'quantity' => '10.000']],
        ]))->assertCreated();

        $freshItem = $this->getJson("/api/v1/purchase-orders/{$order['id']}")->json('items.0');

        $this->putJson("/api/v1/purchase-orders/{$order['id']}/items/{$item['id']}", [
            'description' => $freshItem['description'], 'quantity' => '9.000', 'unit_price' => $freshItem['unit_price'],
            'updated_at' => $freshItem['updated_at'],
        ])->assertStatus(422)->assertJsonValidationErrors('quantity');
    }

    /** IG5: a fully received Item cannot increase quantity either. */
    public function test_ig5_fully_received_frozen_upward(): void
    {
        $this->actingAsNewCompanyMember();
        [$order, $item] = $this->createOrderedOrderWithItem(['quantity' => '10.000']);
        $this->postJson($this->receiptsEndpoint($order['id']), $this->validGoodsReceiptPayload([
            'items' => [['purchase_order_item_id' => $item['id'], 'quantity' => '10.000']],
        ]))->assertCreated();

        $freshItem = $this->getJson("/api/v1/purchase-orders/{$order['id']}")->json('items.0');

        $this->putJson("/api/v1/purchase-orders/{$order['id']}/items/{$item['id']}", [
            'description' => $freshItem['description'], 'quantity' => '11.000', 'unit_price' => $freshItem['unit_price'],
            'updated_at' => $freshItem['updated_at'],
        ])->assertStatus(422)->assertJsonValidationErrors('quantity');
    }

    /** IG6: a fully received Item's description can still be edited. */
    public function test_ig6_fully_received_description_edit_allowed(): void
    {
        $this->actingAsNewCompanyMember();
        [$order, $item] = $this->createOrderedOrderWithItem(['quantity' => '10.000']);
        $this->postJson($this->receiptsEndpoint($order['id']), $this->validGoodsReceiptPayload([
            'items' => [['purchase_order_item_id' => $item['id'], 'quantity' => '10.000']],
        ]))->assertCreated();

        $freshItem = $this->getJson("/api/v1/purchase-orders/{$order['id']}")->json('items.0');

        $this->putJson("/api/v1/purchase-orders/{$order['id']}/items/{$item['id']}", [
            'description' => 'Descrição revisada', 'quantity' => '10.000', 'unit_price' => $freshItem['unit_price'],
            'updated_at' => $freshItem['updated_at'],
        ])->assertOk()->assertJsonPath('description', 'Descrição revisada');
    }

    /** IG7: a fully received Item's unit_price can still be edited (positive), while ordered. */
    public function test_ig7_fully_received_positive_price_edit_allowed(): void
    {
        $this->actingAsNewCompanyMember();
        [$order, $item] = $this->createOrderedOrderWithItem(['quantity' => '10.000']);
        $this->postJson($this->receiptsEndpoint($order['id']), $this->validGoodsReceiptPayload([
            'items' => [['purchase_order_item_id' => $item['id'], 'quantity' => '10.000']],
        ]))->assertCreated();

        $freshItem = $this->getJson("/api/v1/purchase-orders/{$order['id']}")->json('items.0');

        $this->putJson("/api/v1/purchase-orders/{$order['id']}/items/{$item['id']}", [
            'description' => $freshItem['description'], 'quantity' => '10.000', 'unit_price' => '99.90',
            'updated_at' => $freshItem['updated_at'],
        ])->assertOk()->assertJsonPath('unit_price', '99.90');
    }

    /** IG8: a received Item cannot be deleted. */
    public function test_ig8_received_item_cannot_delete(): void
    {
        $this->actingAsNewCompanyMember();
        [$order, $item] = $this->createOrderedOrderWithItem(['quantity' => '10.000']);
        $this->postJson($this->receiptsEndpoint($order['id']), $this->validGoodsReceiptPayload([
            'items' => [['purchase_order_item_id' => $item['id'], 'quantity' => '1.000']],
        ]))->assertCreated();

        $this->deleteJson("/api/v1/purchase-orders/{$order['id']}/items/{$item['id']}")
            ->assertStatus(422)->assertJsonValidationErrors('item');

        $this->assertDatabaseHas('purchase_order_items', ['id' => $item['id']]);
    }

    /** IG9: a zero-received Item delete still follows the ordinary SUPPLY-API-01C rules (e.g. last-item-while-ordered guard). */
    public function test_ig9_zero_received_item_delete_follows_01c_rules(): void
    {
        $this->actingAsNewCompanyMember();
        [$order, $item] = $this->createOrderedOrderWithItem();

        $this->deleteJson("/api/v1/purchase-orders/{$order['id']}/items/{$item['id']}")->assertStatus(409);
    }

    /** IG10: a fully (order-level) received Order cannot add a new Item. */
    public function test_ig10_full_order_cannot_add_item(): void
    {
        $this->actingAsNewCompanyMember();
        [$order, $item] = $this->createOrderedOrderWithItem(['quantity' => '10.000']);
        $this->postJson($this->receiptsEndpoint($order['id']), $this->validGoodsReceiptPayload([
            'items' => [['purchase_order_item_id' => $item['id'], 'quantity' => '10.000']],
        ]))->assertCreated();

        $this->postJson("/api/v1/purchase-orders/{$order['id']}/items", $this->validPurchaseOrderItemPayload())
            ->assertStatus(409);
    }

    /** IG11: a partially received Order CAN still add a new Item. */
    public function test_ig11_partial_order_can_add_item(): void
    {
        $this->actingAsNewCompanyMember();
        [$order, $item] = $this->createOrderedOrderWithItem(['quantity' => '10.000']);
        $this->postJson($this->receiptsEndpoint($order['id']), $this->validGoodsReceiptPayload([
            'items' => [['purchase_order_item_id' => $item['id'], 'quantity' => '4.000']],
        ]))->assertCreated();

        $this->postJson("/api/v1/purchase-orders/{$order['id']}/items", $this->validPurchaseOrderItemPayload())
            ->assertCreated();
    }

    /**
     * IG12: the Item update guard uses DB receipt totals — a hostile
     * `received_quantity` in the payload is explicitly prohibited (422)
     * before ever reaching the Service, AND, separately, the real guard
     * always re-reads the total fresh from the DB inside the Order lock
     * (never trusts the request either way).
     */
    public function test_ig12_item_update_uses_db_receipt_totals(): void
    {
        $this->actingAsNewCompanyMember();
        [$order, $item] = $this->createOrderedOrderWithItem(['quantity' => '10.000']);
        $this->postJson($this->receiptsEndpoint($order['id']), $this->validGoodsReceiptPayload([
            'items' => [['purchase_order_item_id' => $item['id'], 'quantity' => '6.000']],
        ]))->assertCreated();

        $freshItem = $this->getJson("/api/v1/purchase-orders/{$order['id']}")->json('items.0');

        // A hostile "received_quantity" is rejected outright — the field
        // is prohibited, never reaching the guard at all.
        $this->putJson("/api/v1/purchase-orders/{$order['id']}/items/{$item['id']}", [
            'description' => $freshItem['description'], 'quantity' => '2.000', 'unit_price' => $freshItem['unit_price'],
            'received_quantity' => '0.000',
            'updated_at' => $freshItem['updated_at'],
        ])->assertStatus(422)->assertJsonValidationErrors('received_quantity');

        // Without that hostile field, the real guard still reads the true
        // DB total (6.000) and rejects an attempt to go below it.
        $this->putJson("/api/v1/purchase-orders/{$order['id']}/items/{$item['id']}", [
            'description' => $freshItem['description'], 'quantity' => '2.000', 'unit_price' => $freshItem['unit_price'],
            'updated_at' => $freshItem['updated_at'],
        ])->assertStatus(422)->assertJsonValidationErrors('quantity');
    }

    /** IG13/IG14 (real concurrency) live in GoodsReceiptConcurrencyTest — RC3/RC4. */
}
