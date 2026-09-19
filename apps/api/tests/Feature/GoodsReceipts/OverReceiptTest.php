<?php

namespace Tests\Feature\GoodsReceipts;

use App\Models\GoodsReceiptItem;
use App\Models\PurchaseOrder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Feature\GoodsReceipts\Concerns\InteractsWithGoodsReceipts;
use Tests\TestCase;

/**
 * SUPPLY-API-01D §68, OR1-OR10.
 */
class OverReceiptTest extends TestCase
{
    use InteractsWithGoodsReceipts, RefreshDatabase;

    /** OR1: receiving exactly the remaining balance is accepted. */
    public function test_or1_exact_remaining_accepted(): void
    {
        $this->actingAsNewCompanyMember();
        [$order, $item] = $this->createOrderedOrderWithItem(['quantity' => '10.000']);

        $this->postJson($this->receiptsEndpoint($order['id']), $this->validGoodsReceiptPayload([
            'items' => [['purchase_order_item_id' => $item['id'], 'quantity' => '10.000']],
        ]))->assertCreated();
    }

    /** OR2: receiving more than the remaining balance is 422. */
    public function test_or2_greater_than_remaining_is_422(): void
    {
        $this->actingAsNewCompanyMember();
        [$order, $item] = $this->createOrderedOrderWithItem(['quantity' => '10.000']);

        $this->postJson($this->receiptsEndpoint($order['id']), $this->validGoodsReceiptPayload([
            'items' => [['purchase_order_item_id' => $item['id'], 'quantity' => '10.001']],
        ]))->assertStatus(422)->assertJsonValidationErrors('items.0.quantity');
    }

    /** OR3: cumulative prior Receipts are considered — a second receipt respects what was already received. */
    public function test_or3_cumulative_prior_receipts_considered(): void
    {
        $this->actingAsNewCompanyMember();
        [$order, $item] = $this->createOrderedOrderWithItem(['quantity' => '10.000']);

        $this->postJson($this->receiptsEndpoint($order['id']), $this->validGoodsReceiptPayload([
            'items' => [['purchase_order_item_id' => $item['id'], 'quantity' => '7.000']],
        ]))->assertCreated();

        $this->postJson($this->receiptsEndpoint($order['id']), $this->validGoodsReceiptPayload([
            'items' => [['purchase_order_item_id' => $item['id'], 'quantity' => '3.000']],
        ]))->assertCreated();

        $this->postJson($this->receiptsEndpoint($order['id']), $this->validGoodsReceiptPayload([
            'items' => [['purchase_order_item_id' => $item['id'], 'quantity' => '0.001']],
        ]))->assertStatus(422)->assertJsonValidationErrors('items.0.quantity');
    }

    /** OR4: two lines in the same Receipt are checked independently against their OWN remaining balance. */
    public function test_or4_two_lines_independently_checked(): void
    {
        $this->actingAsNewCompanyMember();
        $order = $this->postJson('/api/v1/purchase-orders', $this->validPurchaseOrderPayload())->json();
        $itemA = $this->postJson("/api/v1/purchase-orders/{$order['id']}/items", $this->validPurchaseOrderItemPayload(['quantity' => '10.000']))->json();
        $itemB = $this->postJson("/api/v1/purchase-orders/{$order['id']}/items", $this->validPurchaseOrderItemPayload(['quantity' => '2.000']))->json();
        $fresh = $this->getJson("/api/v1/purchase-orders/{$order['id']}")->json();
        $this->postJson("/api/v1/purchase-orders/{$order['id']}/confirm", ['updated_at' => $fresh['updated_at']])->assertOk();

        $this->postJson($this->receiptsEndpoint($order['id']), $this->validGoodsReceiptPayload([
            'items' => [
                ['purchase_order_item_id' => $itemA['id'], 'quantity' => '10.000'],
                ['purchase_order_item_id' => $itemB['id'], 'quantity' => '2.001'],
            ],
        ]))->assertStatus(422)->assertJsonValidationErrors('items.1.quantity');
    }

    /** OR5: a rejected over-receipt inserts zero rows (both lines, even the valid one). */
    public function test_or5_over_receipt_inserts_zero_rows(): void
    {
        $this->actingAsNewCompanyMember();
        $order = $this->postJson('/api/v1/purchase-orders', $this->validPurchaseOrderPayload())->json();
        $itemA = $this->postJson("/api/v1/purchase-orders/{$order['id']}/items", $this->validPurchaseOrderItemPayload(['quantity' => '10.000']))->json();
        $itemB = $this->postJson("/api/v1/purchase-orders/{$order['id']}/items", $this->validPurchaseOrderItemPayload(['quantity' => '2.000']))->json();
        $fresh = $this->getJson("/api/v1/purchase-orders/{$order['id']}")->json();
        $this->postJson("/api/v1/purchase-orders/{$order['id']}/confirm", ['updated_at' => $fresh['updated_at']])->assertOk();

        $this->postJson($this->receiptsEndpoint($order['id']), $this->validGoodsReceiptPayload([
            'items' => [
                ['purchase_order_item_id' => $itemA['id'], 'quantity' => '5.000'],
                ['purchase_order_item_id' => $itemB['id'], 'quantity' => '3.000'],
            ],
        ]))->assertStatus(422);

        $this->assertDatabaseCount('goods_receipts', 0);
        $this->assertDatabaseCount('goods_receipt_items', 0);
    }

    /** OR7: the final received quantity, across sequential requests, never exceeds ordered. */
    public function test_or7_final_received_never_exceeds_ordered(): void
    {
        $this->actingAsNewCompanyMember();
        [$order, $item] = $this->createOrderedOrderWithItem(['quantity' => '10.000']);

        $this->postJson($this->receiptsEndpoint($order['id']), $this->validGoodsReceiptPayload([
            'items' => [['purchase_order_item_id' => $item['id'], 'quantity' => '6.000']],
        ]))->assertCreated();

        $this->postJson($this->receiptsEndpoint($order['id']), $this->validGoodsReceiptPayload([
            'items' => [['purchase_order_item_id' => $item['id'], 'quantity' => '5.000']],
        ]))->assertStatus(422);

        $total = GoodsReceiptItem::withoutGlobalScopes()->where('purchase_order_item_id', $item['id'])->sum('quantity');
        $this->assertLessThanOrEqual(10.0, (float) $total);
        $this->assertSame('6.000', number_format((float) $total, 3, '.', ''));
    }

    /** OR8: exact decimal 0.001 boundary behaves correctly (neither float rounding up nor down). */
    public function test_or8_exact_decimal_0_001_boundary(): void
    {
        $this->actingAsNewCompanyMember();
        [$order, $item] = $this->createOrderedOrderWithItem(['quantity' => '1.001']);

        $this->postJson($this->receiptsEndpoint($order['id']), $this->validGoodsReceiptPayload([
            'items' => [['purchase_order_item_id' => $item['id'], 'quantity' => '1.000']],
        ]))->assertCreated();

        $this->postJson($this->receiptsEndpoint($order['id']), $this->validGoodsReceiptPayload([
            'items' => [['purchase_order_item_id' => $item['id'], 'quantity' => '0.001']],
        ]))->assertCreated();

        $this->postJson($this->receiptsEndpoint($order['id']), $this->validGoodsReceiptPayload([
            'items' => [['purchase_order_item_id' => $item['id'], 'quantity' => '0.001']],
        ]))->assertStatus(422);
    }

    /** OR9: repeated small receipts never drift due to float rounding — exact decimal accumulation. */
    public function test_or9_no_float_rounding_drift(): void
    {
        $this->actingAsNewCompanyMember();
        [$order, $item] = $this->createOrderedOrderWithItem(['quantity' => '1.000']);

        for ($i = 0; $i < 10; $i++) {
            $this->postJson($this->receiptsEndpoint($order['id']), $this->validGoodsReceiptPayload([
                'items' => [['purchase_order_item_id' => $item['id'], 'quantity' => '0.100']],
            ]))->assertCreated();
        }

        $this->postJson($this->receiptsEndpoint($order['id']), $this->validGoodsReceiptPayload([
            'items' => [['purchase_order_item_id' => $item['id'], 'quantity' => '0.001']],
        ]))->assertStatus(422);

        $detail = $this->getJson("/api/v1/purchase-orders/{$order['id']}")->json();
        $this->assertSame('received', $detail['items'][0]['fulfillment_status']);
        $this->assertSame('0.000', $detail['items'][0]['remaining_quantity']);
    }

    /** OR10: a rejected (over-receipt) Receipt attempt does NOT bump the parent Order's version. */
    public function test_or10_failed_receipt_does_not_bump_order_version(): void
    {
        $this->actingAsNewCompanyMember();
        [$order, $item] = $this->createOrderedOrderWithItem(['quantity' => '10.000']);
        $v1 = $order['updated_at'];

        $this->postJson($this->receiptsEndpoint($order['id']), $this->validGoodsReceiptPayload([
            'items' => [['purchase_order_item_id' => $item['id'], 'quantity' => '10.001']],
        ]))->assertStatus(422);

        $fresh = PurchaseOrder::withoutGlobalScopes()->findOrFail($order['id']);
        $this->assertSame($v1, $fresh->updated_at->toJSON());
    }

    /** OR6 is the real-concurrency version of OR2 — see PurchaseOrderMaterialConcurrencyTest-style suite in GoodsReceiptConcurrencyTest (RC2). */
}
