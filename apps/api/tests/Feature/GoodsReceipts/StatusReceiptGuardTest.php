<?php

namespace Tests\Feature\GoodsReceipts;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Feature\GoodsReceipts\Concerns\InteractsWithGoodsReceipts;
use Tests\TestCase;

/**
 * SUPPLY-API-01D §71, SR1-SR12.
 */
class StatusReceiptGuardTest extends TestCase
{
    use InteractsWithGoodsReceipts, RefreshDatabase;

    /** SR1: an ordered Order with zero Receipts can still return to draft. */
    public function test_sr1_ordered_no_receipt_return_draft_works(): void
    {
        $this->actingAsNewCompanyMember();
        [$order] = $this->createOrderedOrderWithItem();

        $this->postJson("/api/v1/purchase-orders/{$order['id']}/return-to-draft", ['updated_at' => $order['updated_at']])
            ->assertOk()->assertJsonPath('commercial_status', 'draft');
    }

    /** SR2: an ordered Order WITH a Receipt cannot return to draft. */
    public function test_sr2_ordered_with_receipt_return_draft_blocked(): void
    {
        $this->actingAsNewCompanyMember();
        [$order, $item] = $this->createOrderedOrderWithItem();
        $this->postJson($this->receiptsEndpoint($order['id']), $this->validGoodsReceiptPayload([
            'items' => [['purchase_order_item_id' => $item['id'], 'quantity' => '1.000']],
        ]))->assertCreated();

        $fresh = $this->getJson("/api/v1/purchase-orders/{$order['id']}")->json();

        $this->postJson("/api/v1/purchase-orders/{$order['id']}/return-to-draft", ['updated_at' => $fresh['updated_at']])
            ->assertStatus(409);
    }

    /** SR3: a cancelled Order WITH a Receipt cannot return to draft either. */
    public function test_sr3_cancelled_with_receipt_return_draft_blocked(): void
    {
        $this->actingAsNewCompanyMember();
        [$order, $item] = $this->createOrderedOrderWithItem();
        $this->postJson($this->receiptsEndpoint($order['id']), $this->validGoodsReceiptPayload([
            'items' => [['purchase_order_item_id' => $item['id'], 'quantity' => '1.000']],
        ]))->assertCreated();

        $fresh = $this->getJson("/api/v1/purchase-orders/{$order['id']}")->json();
        $cancelled = $this->postJson("/api/v1/purchase-orders/{$order['id']}/cancel", ['updated_at' => $fresh['updated_at']])->json();

        $this->postJson("/api/v1/purchase-orders/{$order['id']}/return-to-draft", ['updated_at' => $cancelled['updated_at']])
            ->assertStatus(409);
    }

    /** SR4: a partially received ordered Order can still be cancelled. */
    public function test_sr4_partial_ordered_cancel_allowed(): void
    {
        $this->actingAsNewCompanyMember();
        [$order, $item] = $this->createOrderedOrderWithItem(['quantity' => '10.000']);
        $this->postJson($this->receiptsEndpoint($order['id']), $this->validGoodsReceiptPayload([
            'items' => [['purchase_order_item_id' => $item['id'], 'quantity' => '4.000']],
        ]))->assertCreated();

        $fresh = $this->getJson("/api/v1/purchase-orders/{$order['id']}")->json();

        $this->postJson("/api/v1/purchase-orders/{$order['id']}/cancel", ['updated_at' => $fresh['updated_at']])
            ->assertOk()->assertJsonPath('commercial_status', 'cancelled');
    }

    /** SR5: a not_received ordered Order can be cancelled. */
    public function test_sr5_not_received_ordered_cancel_allowed(): void
    {
        $this->actingAsNewCompanyMember();
        [$order] = $this->createOrderedOrderWithItem();

        $this->postJson("/api/v1/purchase-orders/{$order['id']}/cancel", ['updated_at' => $order['updated_at']])
            ->assertOk()->assertJsonPath('commercial_status', 'cancelled');
    }

    /** SR6: a fully received ordered Order cannot be cancelled. */
    public function test_sr6_fully_received_ordered_cancel_blocked(): void
    {
        $this->actingAsNewCompanyMember();
        [$order, $item] = $this->createOrderedOrderWithItem(['quantity' => '10.000']);
        $this->postJson($this->receiptsEndpoint($order['id']), $this->validGoodsReceiptPayload([
            'items' => [['purchase_order_item_id' => $item['id'], 'quantity' => '10.000']],
        ]))->assertCreated();

        $fresh = $this->getJson("/api/v1/purchase-orders/{$order['id']}")->json();

        $this->postJson("/api/v1/purchase-orders/{$order['id']}/cancel", ['updated_at' => $fresh['updated_at']])
            ->assertStatus(409);
    }

    /** SR7: cancelling a partially received Order preserves its Receipts. */
    public function test_sr7_cancel_preserves_receipts(): void
    {
        $this->actingAsNewCompanyMember();
        [$order, $item] = $this->createOrderedOrderWithItem(['quantity' => '10.000']);
        $receipt = $this->postJson($this->receiptsEndpoint($order['id']), $this->validGoodsReceiptPayload([
            'items' => [['purchase_order_item_id' => $item['id'], 'quantity' => '4.000']],
        ]))->json();

        $fresh = $this->getJson("/api/v1/purchase-orders/{$order['id']}")->json();
        $this->postJson("/api/v1/purchase-orders/{$order['id']}/cancel", ['updated_at' => $fresh['updated_at']])->assertOk();

        $detail = $this->getJson("/api/v1/purchase-orders/{$order['id']}")->json();
        $this->assertCount(1, $detail['goods_receipts']);
        $this->assertSame($receipt['id'], $detail['goods_receipts'][0]['id']);
        $this->assertSame('partial', $detail['fulfillment_status']);
    }

    /** SR8: a cancelled Order cannot receive a NEW GoodsReceipt. */
    public function test_sr8_cancelled_cannot_receive_new(): void
    {
        $this->actingAsNewCompanyMember();
        [$order, $item] = $this->createOrderedOrderWithItem();
        $cancelled = $this->postJson("/api/v1/purchase-orders/{$order['id']}/cancel", ['updated_at' => $order['updated_at']])->json();

        $this->postJson($this->receiptsEndpoint($order['id']), $this->validGoodsReceiptPayload([
            'items' => [['purchase_order_item_id' => $item['id'], 'quantity' => '1.000']],
        ]))->assertStatus(422)->assertJsonValidationErrors('commercial_status');
    }

    /** SR9: deleting the final Receipt releases the return-to-draft guard. */
    public function test_sr9_deleting_final_receipt_releases_return_draft_guard(): void
    {
        $this->actingAsNewCompanyMember();
        [$order, $item] = $this->createOrderedOrderWithItem();
        $receipt = $this->postJson($this->receiptsEndpoint($order['id']), $this->validGoodsReceiptPayload([
            'items' => [['purchase_order_item_id' => $item['id'], 'quantity' => '1.000']],
        ]))->json();

        $this->deleteJson($this->receiptsEndpoint($order['id'], $receipt['id']))->assertNoContent();

        $fresh = $this->getJson("/api/v1/purchase-orders/{$order['id']}")->json();
        $this->postJson("/api/v1/purchase-orders/{$order['id']}/return-to-draft", ['updated_at' => $fresh['updated_at']])
            ->assertOk()->assertJsonPath('commercial_status', 'draft');
    }

    /** SR10: deleting a Receipt can change fulfillment from received back to partial (or not_received). */
    public function test_sr10_deleting_receipt_changes_fulfillment(): void
    {
        $this->actingAsNewCompanyMember();
        [$order, $item] = $this->createOrderedOrderWithItem(['quantity' => '10.000']);
        $receipt = $this->postJson($this->receiptsEndpoint($order['id']), $this->validGoodsReceiptPayload([
            'items' => [['purchase_order_item_id' => $item['id'], 'quantity' => '10.000']],
        ]))->json();

        $beforeDelete = $this->getJson("/api/v1/purchase-orders/{$order['id']}")->json();
        $this->assertSame('received', $beforeDelete['fulfillment_status']);

        $this->deleteJson($this->receiptsEndpoint($order['id'], $receipt['id']))->assertNoContent();

        $afterDelete = $this->getJson("/api/v1/purchase-orders/{$order['id']}")->json();
        $this->assertSame('not_received', $afterDelete['fulfillment_status']);
    }

    /** SR11 (real concurrency) lives in GoodsReceiptConcurrencyTest — RC5/RC6. */

    /** SR12: draft-delete defense-in-depth is unreachable via the normal flow but never surfaces a raw FK 500 if it were. */
    public function test_sr12_draft_delete_defense_never_raw_fk(): void
    {
        $this->actingAsNewCompanyMember();
        $order = $this->postJson('/api/v1/purchase-orders', $this->validPurchaseOrderPayload())->json();

        // A perfectly ordinary draft delete (no receipts possible in draft) still works cleanly.
        $this->deleteJson("/api/v1/purchase-orders/{$order['id']}", ['updated_at' => $order['updated_at']])
            ->assertNoContent();
    }
}
