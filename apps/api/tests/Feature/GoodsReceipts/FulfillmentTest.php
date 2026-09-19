<?php

namespace Tests\Feature\GoodsReceipts;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use Tests\Feature\GoodsReceipts\Concerns\InteractsWithGoodsReceipts;
use Tests\TestCase;

/**
 * SUPPLY-API-01D §69, FF1-FF12.
 */
class FulfillmentTest extends TestCase
{
    use InteractsWithGoodsReceipts, RefreshDatabase;

    /** FF1: zero received -> not_received. */
    public function test_ff1_zero_received_is_not_received(): void
    {
        $this->actingAsNewCompanyMember();
        [$order, $item] = $this->createOrderedOrderWithItem();

        $detail = $this->getJson("/api/v1/purchase-orders/{$order['id']}")->json();
        $this->assertSame('not_received', $detail['items'][0]['fulfillment_status']);
        $this->assertSame('not_received', $detail['fulfillment_status']);
    }

    /** FF2: partially received Item -> partial. */
    public function test_ff2_partial(): void
    {
        $this->actingAsNewCompanyMember();
        [$order, $item] = $this->createOrderedOrderWithItem(['quantity' => '10.000']);

        $this->postJson($this->receiptsEndpoint($order['id']), $this->validGoodsReceiptPayload([
            'items' => [['purchase_order_item_id' => $item['id'], 'quantity' => '4.000']],
        ]))->assertCreated();

        $detail = $this->getJson("/api/v1/purchase-orders/{$order['id']}")->json();
        $this->assertSame('partial', $detail['items'][0]['fulfillment_status']);
    }

    /** FF3: exactly the ordered quantity received -> received. */
    public function test_ff3_exact_is_received(): void
    {
        $this->actingAsNewCompanyMember();
        [$order, $item] = $this->createOrderedOrderWithItem(['quantity' => '10.000']);

        $this->postJson($this->receiptsEndpoint($order['id']), $this->validGoodsReceiptPayload([
            'items' => [['purchase_order_item_id' => $item['id'], 'quantity' => '10.000']],
        ]))->assertCreated();

        $detail = $this->getJson("/api/v1/purchase-orders/{$order['id']}")->json();
        $this->assertSame('received', $detail['items'][0]['fulfillment_status']);
    }

    /** FF4: remaining_quantity is an exact decimal string. */
    public function test_ff4_remaining_string_exact(): void
    {
        $this->actingAsNewCompanyMember();
        [$order, $item] = $this->createOrderedOrderWithItem(['quantity' => '10.000']);

        $this->postJson($this->receiptsEndpoint($order['id']), $this->validGoodsReceiptPayload([
            'items' => [['purchase_order_item_id' => $item['id'], 'quantity' => '3.333']],
        ]))->assertCreated();

        $detail = $this->getJson("/api/v1/purchase-orders/{$order['id']}")->json();
        $this->assertSame('6.667', $detail['items'][0]['remaining_quantity']);
        $this->assertIsString($detail['items'][0]['remaining_quantity']);
    }

    /** FF5: an Order with all-zero-received items -> not_received. */
    public function test_ff5_order_all_zero_is_not_received(): void
    {
        $this->actingAsNewCompanyMember();
        $order = $this->postJson('/api/v1/purchase-orders', $this->validPurchaseOrderPayload())->json();
        $this->postJson("/api/v1/purchase-orders/{$order['id']}/items", $this->validPurchaseOrderItemPayload())->assertCreated();
        $this->postJson("/api/v1/purchase-orders/{$order['id']}/items", $this->validPurchaseOrderItemPayload())->assertCreated();

        $detail = $this->getJson("/api/v1/purchase-orders/{$order['id']}")->json();
        $this->assertSame('not_received', $detail['fulfillment_status']);
    }

    /** FF6: a mixed Order (some items received, some not) -> partial. */
    public function test_ff6_mixed_is_partial(): void
    {
        $this->actingAsNewCompanyMember();
        $order = $this->postJson('/api/v1/purchase-orders', $this->validPurchaseOrderPayload())->json();
        $itemA = $this->postJson("/api/v1/purchase-orders/{$order['id']}/items", $this->validPurchaseOrderItemPayload(['quantity' => '5.000']))->json();
        $itemB = $this->postJson("/api/v1/purchase-orders/{$order['id']}/items", $this->validPurchaseOrderItemPayload(['quantity' => '5.000']))->json();
        $fresh = $this->getJson("/api/v1/purchase-orders/{$order['id']}")->json();
        $this->postJson("/api/v1/purchase-orders/{$order['id']}/confirm", ['updated_at' => $fresh['updated_at']])->assertOk();

        $this->postJson($this->receiptsEndpoint($order['id']), $this->validGoodsReceiptPayload([
            'items' => [['purchase_order_item_id' => $itemA['id'], 'quantity' => '5.000']],
        ]))->assertCreated();

        $detail = $this->getJson("/api/v1/purchase-orders/{$order['id']}")->json();
        $this->assertSame('received', $detail['items'][0]['fulfillment_status']);
        $this->assertSame('not_received', $detail['items'][1]['fulfillment_status']);
        $this->assertSame('partial', $detail['fulfillment_status']);
    }

    /** FF7: an Order with ALL items fully received -> received. */
    public function test_ff7_all_received_is_received(): void
    {
        $this->actingAsNewCompanyMember();
        $order = $this->postJson('/api/v1/purchase-orders', $this->validPurchaseOrderPayload())->json();
        $itemA = $this->postJson("/api/v1/purchase-orders/{$order['id']}/items", $this->validPurchaseOrderItemPayload(['quantity' => '5.000']))->json();
        $itemB = $this->postJson("/api/v1/purchase-orders/{$order['id']}/items", $this->validPurchaseOrderItemPayload(['quantity' => '5.000']))->json();
        $fresh = $this->getJson("/api/v1/purchase-orders/{$order['id']}")->json();
        $this->postJson("/api/v1/purchase-orders/{$order['id']}/confirm", ['updated_at' => $fresh['updated_at']])->assertOk();

        $this->postJson($this->receiptsEndpoint($order['id']), $this->validGoodsReceiptPayload([
            'items' => [
                ['purchase_order_item_id' => $itemA['id'], 'quantity' => '5.000'],
                ['purchase_order_item_id' => $itemB['id'], 'quantity' => '5.000'],
            ],
        ]))->assertCreated();

        $detail = $this->getJson("/api/v1/purchase-orders/{$order['id']}")->json();
        $this->assertSame('received', $detail['fulfillment_status']);
    }

    /** FF8: heterogeneous units/Materials are never summed together — each Item's own fulfillment stays independent. */
    public function test_ff8_heterogeneous_units_never_summed(): void
    {
        $this->actingAsNewCompanyMember();
        $order = $this->postJson('/api/v1/purchase-orders', $this->validPurchaseOrderPayload())->json();
        $itemKg = $this->postJson("/api/v1/purchase-orders/{$order['id']}/items", $this->validPurchaseOrderItemPayload([
            'material_id' => $this->makeMaterialForCompany($this->activeTestCompany, ['unit_code' => 'kg'])->id, 'quantity' => '100.000',
        ]))->json();
        $itemUn = $this->postJson("/api/v1/purchase-orders/{$order['id']}/items", $this->validPurchaseOrderItemPayload([
            'material_id' => $this->makeMaterialForCompany($this->activeTestCompany, ['unit_code' => 'un'])->id, 'quantity' => '3.000',
        ]))->json();
        $fresh = $this->getJson("/api/v1/purchase-orders/{$order['id']}")->json();
        $this->postJson("/api/v1/purchase-orders/{$order['id']}/confirm", ['updated_at' => $fresh['updated_at']])->assertOk();

        $this->postJson($this->receiptsEndpoint($order['id']), $this->validGoodsReceiptPayload([
            'items' => [['purchase_order_item_id' => $itemUn['id'], 'quantity' => '3.000']],
        ]))->assertCreated();

        $detail = $this->getJson("/api/v1/purchase-orders/{$order['id']}")->json();
        $kgLine = collect($detail['items'])->firstWhere('id', $itemKg['id']);
        $unLine = collect($detail['items'])->firstWhere('id', $itemUn['id']);
        $this->assertSame('100.000', $kgLine['remaining_quantity']);
        $this->assertSame('0.000', $unLine['remaining_quantity']);
        $this->assertSame('partial', $detail['fulfillment_status']);
    }

    /** FF9: ListResource includes fulfillment_status. */
    public function test_ff9_list_resource_fulfillment(): void
    {
        $this->actingAsNewCompanyMember();
        [$order, $item] = $this->createOrderedOrderWithItem(['quantity' => '10.000']);
        $this->postJson($this->receiptsEndpoint($order['id']), $this->validGoodsReceiptPayload([
            'items' => [['purchase_order_item_id' => $item['id'], 'quantity' => '10.000']],
        ]))->assertCreated();

        $list = $this->getJson('/api/v1/purchase-orders')->json();
        $row = collect($list['data'])->firstWhere('id', $order['id']);
        $this->assertSame('received', $row['fulfillment_status']);
    }

    /** FF10: Detail Resource includes fulfillment_status. */
    public function test_ff10_detail_resource_fulfillment(): void
    {
        $this->actingAsNewCompanyMember();
        [$order] = $this->createOrderedOrderWithItem();

        $detail = $this->getJson("/api/v1/purchase-orders/{$order['id']}")->json();
        $this->assertArrayHasKey('fulfillment_status', $detail);
    }

    /** FF11: Item Resource includes received_quantity/remaining_quantity. */
    public function test_ff11_item_resource_received_remaining(): void
    {
        $this->actingAsNewCompanyMember();
        [$order, $item] = $this->createOrderedOrderWithItem();

        $this->assertArrayHasKey('received_quantity', $item);
        $this->assertArrayHasKey('remaining_quantity', $item);
        $this->assertArrayHasKey('fulfillment_status', $item);
    }

    /** FF12: fulfillment fields are derived — absent from the schema. */
    public function test_ff12_fields_are_derived_absent_from_schema(): void
    {
        $this->assertFalse(Schema::hasColumn('purchase_orders', 'fulfillment_status'));
        $this->assertFalse(Schema::hasColumn('purchase_order_items', 'received_quantity'));
        $this->assertFalse(Schema::hasColumn('purchase_order_items', 'remaining_quantity'));
        $this->assertFalse(Schema::hasColumn('purchase_order_items', 'fulfillment_status'));
    }
}
