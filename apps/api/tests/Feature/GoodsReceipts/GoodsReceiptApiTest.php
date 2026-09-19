<?php

namespace Tests\Feature\GoodsReceipts;

use App\Models\User;
use App\Purchases\GoodsReceiptService;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\Feature\GoodsReceipts\Concerns\InteractsWithGoodsReceipts;
use Tests\TestCase;

/**
 * SUPPLY-API-01D §67, GR1-GR20.
 */
class GoodsReceiptApiTest extends TestCase
{
    use InteractsWithGoodsReceipts, RefreshDatabase;

    /** GR1: unauthenticated -> 401. */
    public function test_gr1_unauthenticated_is_rejected(): void
    {
        $this->postJson($this->receiptsEndpoint('any-id'), [])->assertStatus(401);
    }

    /** GR2: authenticated with zero memberships -> fail-closed 403. */
    public function test_gr2_no_active_company_fails_closed(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->postJson($this->receiptsEndpoint((string) Str::uuid()), [])->assertStatus(403);
    }

    /** GR3: create a Receipt for an ordered PurchaseOrder. */
    public function test_gr3_create_ordered_receipt(): void
    {
        $this->actingAsNewCompanyMember();
        [$order, $item] = $this->createOrderedOrderWithItem(['quantity' => '10.000']);

        $response = $this->postJson($this->receiptsEndpoint($order['id']), $this->validGoodsReceiptPayload([
            'items' => [['purchase_order_item_id' => $item['id'], 'quantity' => '4.000']],
        ]));

        $response->assertCreated();
    }

    /** GR4: a draft PurchaseOrder rejects a new Receipt. */
    public function test_gr4_draft_rejected(): void
    {
        $this->actingAsNewCompanyMember();
        $order = $this->postJson('/api/v1/purchase-orders', $this->validPurchaseOrderPayload())->json();
        $item = $this->postJson("/api/v1/purchase-orders/{$order['id']}/items", $this->validPurchaseOrderItemPayload())->json();

        $this->postJson($this->receiptsEndpoint($order['id']), $this->validGoodsReceiptPayload([
            'items' => [['purchase_order_item_id' => $item['id'], 'quantity' => '1.000']],
        ]))->assertStatus(422)->assertJsonValidationErrors('commercial_status');
    }

    /** GR5: a cancelled PurchaseOrder rejects a new Receipt. */
    public function test_gr5_cancelled_rejected(): void
    {
        $this->actingAsNewCompanyMember();
        $order = $this->postJson('/api/v1/purchase-orders', $this->validPurchaseOrderPayload())->json();
        $item = $this->postJson("/api/v1/purchase-orders/{$order['id']}/items", $this->validPurchaseOrderItemPayload())->json();
        $cancelled = $this->postJson("/api/v1/purchase-orders/{$order['id']}/cancel", ['updated_at' => $order['updated_at']])->json();

        $this->postJson($this->receiptsEndpoint($order['id']), $this->validGoodsReceiptPayload([
            'items' => [['purchase_order_item_id' => $item['id'], 'quantity' => '1.000']],
        ]))->assertStatus(422)->assertJsonValidationErrors('commercial_status');
    }

    /** GR6: received_at is required and date-only. */
    public function test_gr6_received_at_required_date_only(): void
    {
        $this->actingAsNewCompanyMember();
        [$order, $item] = $this->createOrderedOrderWithItem();

        $this->postJson($this->receiptsEndpoint($order['id']), [
            'items' => [['purchase_order_item_id' => $item['id'], 'quantity' => '1.000']],
        ])->assertStatus(422)->assertJsonValidationErrors('received_at');

        $this->postJson($this->receiptsEndpoint($order['id']), [
            'received_at' => '2026-01-15T10:00:00Z',
            'items' => [['purchase_order_item_id' => $item['id'], 'quantity' => '1.000']],
        ])->assertStatus(422)->assertJsonValidationErrors('received_at');
    }

    /** GR7: at least one line is required. */
    public function test_gr7_at_least_one_line(): void
    {
        $this->actingAsNewCompanyMember();
        [$order] = $this->createOrderedOrderWithItem();

        $this->postJson($this->receiptsEndpoint($order['id']), $this->validGoodsReceiptPayload(['items' => []]))
            ->assertStatus(422)->assertJsonValidationErrors('items');
    }

    /** GR8: line quantity must be > 0. */
    public function test_gr8_quantity_must_be_positive(): void
    {
        $this->actingAsNewCompanyMember();
        [$order, $item] = $this->createOrderedOrderWithItem();

        $this->postJson($this->receiptsEndpoint($order['id']), $this->validGoodsReceiptPayload([
            'items' => [['purchase_order_item_id' => $item['id'], 'quantity' => '0']],
        ]))->assertStatus(422)->assertJsonValidationErrors('items.0.quantity');
    }

    /** GR9: the same Item twice in one Receipt is rejected. */
    public function test_gr9_duplicate_item_same_receipt_rejected(): void
    {
        $this->actingAsNewCompanyMember();
        [$order, $item] = $this->createOrderedOrderWithItem(['quantity' => '10.000']);

        $this->postJson($this->receiptsEndpoint($order['id']), $this->validGoodsReceiptPayload([
            'items' => [
                ['purchase_order_item_id' => $item['id'], 'quantity' => '2.000'],
                ['purchase_order_item_id' => $item['id'], 'quantity' => '3.000'],
            ],
        ]))->assertStatus(422)->assertJsonValidationErrors('items.1.purchase_order_item_id');
    }

    /** GR10: an Item id from a different Order is rejected. */
    public function test_gr10_foreign_order_item_rejected(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        [$order] = $this->createOrderedOrderWithItem();
        [$otherOrder, $otherItem] = $this->createOrderedOrderWithItem();

        $this->postJson($this->receiptsEndpoint($order['id']), $this->validGoodsReceiptPayload([
            'items' => [['purchase_order_item_id' => $otherItem['id'], 'quantity' => '1.000']],
        ]))->assertStatus(422)->assertJsonValidationErrors('items.0.purchase_order_item_id');
    }

    /** GR11: a cross-tenant Item id is rejected. */
    public function test_gr11_cross_tenant_item_rejected(): void
    {
        [$companyA] = $this->makeCompanyWithMember();
        $orderA = $this->makePurchaseOrderForCompany($companyA, ['commercial_status' => 'ordered']);
        $itemA = $this->makeItemForPurchaseOrder($companyA, $orderA);

        $this->actingAsNewCompanyMember();
        [$order] = $this->createOrderedOrderWithItem();

        $this->postJson($this->receiptsEndpoint($order['id']), $this->validGoodsReceiptPayload([
            'items' => [['purchase_order_item_id' => $itemA->id, 'quantity' => '1.000']],
        ]))->assertStatus(422)->assertJsonValidationErrors('items.0.purchase_order_item_id');
    }

    /** GR12: a multi-line create succeeds. */
    public function test_gr12_multi_line_create(): void
    {
        $this->actingAsNewCompanyMember();
        $order = $this->postJson('/api/v1/purchase-orders', $this->validPurchaseOrderPayload())->json();
        $itemA = $this->postJson("/api/v1/purchase-orders/{$order['id']}/items", $this->validPurchaseOrderItemPayload(['quantity' => '10.000']))->json();
        $itemB = $this->postJson("/api/v1/purchase-orders/{$order['id']}/items", $this->validPurchaseOrderItemPayload(['quantity' => '5.000']))->json();
        $fresh = $this->getJson("/api/v1/purchase-orders/{$order['id']}")->json();
        $this->postJson("/api/v1/purchase-orders/{$order['id']}/confirm", ['updated_at' => $fresh['updated_at']])->assertOk();

        $response = $this->postJson($this->receiptsEndpoint($order['id']), $this->validGoodsReceiptPayload([
            'items' => [
                ['purchase_order_item_id' => $itemA['id'], 'quantity' => '6.000'],
                ['purchase_order_item_id' => $itemB['id'], 'quantity' => '5.000'],
            ],
        ]));

        $response->assertCreated();
        $this->assertCount(2, $response->json('items'));
    }

    /** GR13: a multi-line create with one invalid line rolls back atomically — zero rows persisted. */
    public function test_gr13_multi_line_atomic_rollback(): void
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

    /** GR14: notes is nullable and trimmed. */
    public function test_gr14_notes_nullable_and_trim(): void
    {
        $this->actingAsNewCompanyMember();
        [$order, $item] = $this->createOrderedOrderWithItem();

        $response = $this->postJson($this->receiptsEndpoint($order['id']), $this->validGoodsReceiptPayload([
            'notes' => '  Entrega parcial  ',
            'items' => [['purchase_order_item_id' => $item['id'], 'quantity' => '1.000']],
        ]));

        $response->assertCreated()->assertJsonPath('notes', 'Entrega parcial');

        $order2 = $this->postJson('/api/v1/purchase-orders', $this->validPurchaseOrderPayload())->json();
        $item2 = $this->postJson("/api/v1/purchase-orders/{$order2['id']}/items", $this->validPurchaseOrderItemPayload())->json();
        $fresh2 = $this->getJson("/api/v1/purchase-orders/{$order2['id']}")->json();
        $this->postJson("/api/v1/purchase-orders/{$order2['id']}/confirm", ['updated_at' => $fresh2['updated_at']])->assertOk();

        $this->postJson($this->receiptsEndpoint($order2['id']), $this->validGoodsReceiptPayload([
            'notes' => '',
            'items' => [['purchase_order_item_id' => $item2['id'], 'quantity' => '1.000']],
        ]))->assertCreated()->assertJsonPath('notes', null);
    }

    /** GR15: the Resource returns quantity as a canonical decimal string. */
    public function test_gr15_resource_quantity_string(): void
    {
        $this->actingAsNewCompanyMember();
        [$order, $item] = $this->createOrderedOrderWithItem(['quantity' => '10.000']);

        $response = $this->postJson($this->receiptsEndpoint($order['id']), $this->validGoodsReceiptPayload([
            'items' => [['purchase_order_item_id' => $item['id'], 'quantity' => '2.5']],
        ]));

        $response->assertCreated()->assertJsonPath('items.0.quantity', '2.500');
        $this->assertIsString($response->json('items.0.quantity'));
    }

    /** GR16: the Receipt history in the Order detail is ordered chronologically. */
    public function test_gr16_receipt_history_ordered_chronologically(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        [$order, $item] = $this->createOrderedOrderWithItem(['quantity' => '10.000']);

        $this->postJson($this->receiptsEndpoint($order['id']), $this->validGoodsReceiptPayload([
            'received_at' => '2026-01-20',
            'items' => [['purchase_order_item_id' => $item['id'], 'quantity' => '2.000']],
        ]))->assertCreated();

        $this->postJson($this->receiptsEndpoint($order['id']), $this->validGoodsReceiptPayload([
            'received_at' => '2026-01-10',
            'items' => [['purchase_order_item_id' => $item['id'], 'quantity' => '3.000']],
        ]))->assertCreated();

        $detail = $this->getJson("/api/v1/purchase-orders/{$order['id']}")->json();
        $dates = array_column($detail['goods_receipts'], 'received_at');
        $this->assertSame(['2026-01-10', '2026-01-20'], $dates);
    }

    /** GR17: delete a Receipt. */
    public function test_gr17_delete_receipt(): void
    {
        $this->actingAsNewCompanyMember();
        [$order, $item] = $this->createOrderedOrderWithItem();

        $receipt = $this->postJson($this->receiptsEndpoint($order['id']), $this->validGoodsReceiptPayload([
            'items' => [['purchase_order_item_id' => $item['id'], 'quantity' => '1.000']],
        ]))->json();

        $this->deleteJson($this->receiptsEndpoint($order['id'], $receipt['id']))->assertNoContent();

        $this->assertDatabaseMissing('goods_receipts', ['id' => $receipt['id']]);
        $this->assertDatabaseMissing('goods_receipt_items', ['goods_receipt_id' => $receipt['id']]);
    }

    /** GR18: a Receipt id from a DIFFERENT Order is 404 on the nested route. */
    public function test_gr18_wrong_order_receipt_404(): void
    {
        $this->actingAsNewCompanyMember();
        [$orderA, $itemA] = $this->createOrderedOrderWithItem();
        [$orderB] = $this->createOrderedOrderWithItem();

        $receiptA = $this->postJson($this->receiptsEndpoint($orderA['id']), $this->validGoodsReceiptPayload([
            'items' => [['purchase_order_item_id' => $itemA['id'], 'quantity' => '1.000']],
        ]))->json();

        $this->deleteJson($this->receiptsEndpoint($orderB['id'], $receiptA['id']))->assertStatus(404);
    }

    /** GR19: direct GoodsReceiptService calls are tenant-defended. */
    public function test_gr19_direct_service_tenant_defense(): void
    {
        [$companyA] = $this->makeCompanyWithMember();
        $orderA = $this->makePurchaseOrderForCompany($companyA, ['commercial_status' => 'ordered']);

        [$companyB] = $this->actingAsNewCompanyMember();

        $caught = null;
        $this->currentCompanyContext()->run($companyB, function () use ($orderA, &$caught) {
            try {
                app(GoodsReceiptService::class)->create($orderA, [
                    'received_at' => now()->toDateString(),
                    'items' => [],
                ]);
            } catch (ModelNotFoundException $e) {
                $caught = $e;
            }
        });

        $this->assertNotNull($caught);
    }

    /** GR20: create/delete of a Receipt each strictly advance the parent Order's version. */
    public function test_gr20_create_and_delete_advance_parent_version(): void
    {
        $this->actingAsNewCompanyMember();
        [$order, $item] = $this->createOrderedOrderWithItem();
        $v1 = Carbon::parse($order['updated_at']);

        $receipt = $this->postJson($this->receiptsEndpoint($order['id']), $this->validGoodsReceiptPayload([
            'items' => [['purchase_order_item_id' => $item['id'], 'quantity' => '1.000']],
        ]))->json();

        $afterCreate = $this->getJson("/api/v1/purchase-orders/{$order['id']}")->json();
        $v2 = Carbon::parse($afterCreate['updated_at']);
        $this->assertTrue($v2->greaterThan($v1));

        $this->deleteJson($this->receiptsEndpoint($order['id'], $receipt['id']))->assertNoContent();

        $afterDelete = $this->getJson("/api/v1/purchase-orders/{$order['id']}")->json();
        $v3 = Carbon::parse($afterDelete['updated_at']);
        $this->assertTrue($v3->greaterThan($v2));
    }
}
