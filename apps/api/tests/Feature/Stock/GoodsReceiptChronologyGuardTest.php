<?php

namespace Tests\Feature\Stock;

use App\Models\PurchaseOrder;
use App\Purchases\GoodsReceiptService;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Feature\Stock\Concerns\InteractsWithStock;
use Tests\TestCase;

/**
 * SUPPLY-API-01E §77, GD1-GD14. Extends the GoodsReceipt DELETE contract
 * (SUPPLY-API-01D) with the chronology guard ADR-017 registered as a
 * SUPPLY-API-01E preview.
 */
class GoodsReceiptChronologyGuardTest extends TestCase
{
    use InteractsWithStock, RefreshDatabase;

    /** GD1: deleting a Receipt with no dependent OUT works. */
    public function test_gd1_delete_with_no_dependents_works(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $project = $this->makeProjectForCompany($company);
        $material = $this->makeMaterialForCompany($company);
        [$order, , $receipt] = $this->createReceivedStock($project->id, $material->id, '10.000');

        $this->deleteJson($this->receiptsEndpoint($order['id'], $receipt['id']))->assertNoContent();
    }

    /** GD2: a later Consumption depending on the Receipt blocks its delete. */
    public function test_gd2_later_consumption_depending_blocks(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $project = $this->makeProjectForCompany($company);
        $material = $this->makeMaterialForCompany($company);
        [$order, , $receipt] = $this->createReceivedStock($project->id, $material->id, '10.000');
        $this->postJson($this->consumptionsEndpoint($project->id), $this->validConsumptionPayload(['material_id' => $material->id, 'quantity' => '10.000']));

        $this->deleteJson($this->receiptsEndpoint($order['id'], $receipt['id']))->assertStatus(422);
    }

    /** GD3: a later ADJUSTMENT_OUT depending on the Receipt blocks its delete. */
    public function test_gd3_later_adjustment_out_depending_blocks(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $project = $this->makeProjectForCompany($company);
        $material = $this->makeMaterialForCompany($company);
        [$order, , $receipt] = $this->createReceivedStock($project->id, $material->id, '10.000');
        $this->postJson($this->adjustmentsEndpoint($project->id), $this->validAdjustmentPayload(['material_id' => $material->id, 'type' => 'ADJUSTMENT_OUT', 'quantity' => '10.000']));

        $this->deleteJson($this->receiptsEndpoint($order['id'], $receipt['id']))->assertStatus(422);
    }

    /** GD4: a same-day dependent OUT blocks the delete when the day's net would go negative. */
    public function test_gd4_same_day_dependent_out_blocks(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $project = $this->makeProjectForCompany($company);
        $material = $this->makeMaterialForCompany($company);
        $today = now()->toDateString();
        [$order, , $receipt] = $this->createReceivedStock($project->id, $material->id, '10.000', $today);
        $this->postJson($this->consumptionsEndpoint($project->id), $this->validConsumptionPayload(['material_id' => $material->id, 'quantity' => '10.000', 'consumed_at' => $today]));

        $this->deleteJson($this->receiptsEndpoint($order['id'], $receipt['id']))->assertStatus(422);
    }

    /** GD5: an earlier OUT already valid because of OTHER stock does not block. */
    public function test_gd5_earlier_out_valid_with_other_stock_does_not_block(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $project = $this->makeProjectForCompany($company);
        $material = $this->makeMaterialForCompany($company);
        $this->postJson($this->adjustmentsEndpoint($project->id), $this->validAdjustmentPayload(['material_id' => $material->id, 'type' => 'ADJUSTMENT_IN', 'quantity' => '10.000', 'occurred_at' => now()->subDays(3)->toDateString()]));
        $this->postJson($this->consumptionsEndpoint($project->id), $this->validConsumptionPayload(['material_id' => $material->id, 'quantity' => '5.000', 'consumed_at' => now()->subDays(2)->toDateString()]));
        [$order, , $receipt] = $this->createReceivedStock($project->id, $material->id, '10.000');

        $this->deleteJson($this->receiptsEndpoint($order['id'], $receipt['id']))->assertNoContent();
    }

    /** GD6: an ADJUSTMENT_IN can independently sustain the delete. */
    public function test_gd6_adjustment_in_can_sustain_delete(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $project = $this->makeProjectForCompany($company);
        $material = $this->makeMaterialForCompany($company);
        [$order, , $receipt] = $this->createReceivedStock($project->id, $material->id, '10.000');
        $this->postJson($this->adjustmentsEndpoint($project->id), $this->validAdjustmentPayload(['material_id' => $material->id, 'type' => 'ADJUSTMENT_IN', 'quantity' => '10.000']));
        $this->postJson($this->consumptionsEndpoint($project->id), $this->validConsumptionPayload(['material_id' => $material->id, 'quantity' => '10.000']));

        $this->deleteJson($this->receiptsEndpoint($order['id'], $receipt['id']))->assertNoContent();
    }

    /** GD7: a multi-material Receipt with one invalid Material blocks the ENTIRE delete. */
    public function test_gd7_multi_material_one_invalid_blocks_entire_delete(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $project = $this->makeProjectForCompany($company);
        $cement = $this->makeMaterialForCompany($company);
        $sand = $this->makeMaterialForCompany($company);

        $order = $this->postJson('/api/v1/purchase-orders', $this->validPurchaseOrderPayload(['project_id' => $project->id]))->json();
        $cementItem = $this->postJson("/api/v1/purchase-orders/{$order['id']}/items", $this->validPurchaseOrderItemPayload(['material_id' => $cement->id, 'quantity' => '10.000']))->json();
        $sandItem = $this->postJson("/api/v1/purchase-orders/{$order['id']}/items", $this->validPurchaseOrderItemPayload(['material_id' => $sand->id, 'quantity' => '10.000']))->json();
        $fresh = $this->getJson("/api/v1/purchase-orders/{$order['id']}")->json();
        $confirmed = $this->postJson("/api/v1/purchase-orders/{$order['id']}/confirm", ['updated_at' => $fresh['updated_at']])->json();

        $receipt = $this->postJson($this->receiptsEndpoint($confirmed['id']), $this->validGoodsReceiptPayload([
            'items' => [
                ['purchase_order_item_id' => $cementItem['id'], 'quantity' => '10.000'],
                ['purchase_order_item_id' => $sandItem['id'], 'quantity' => '10.000'],
            ],
        ]))->json();

        // Sand depends entirely on this Receipt; cement has no dependent.
        $this->postJson($this->consumptionsEndpoint($project->id), $this->validConsumptionPayload(['material_id' => $sand->id, 'quantity' => '10.000']));

        $this->deleteJson($this->receiptsEndpoint($confirmed['id'], $receipt['id']))->assertStatus(422);

        // Both lines still exist — zero partial removal.
        $detail = $this->getJson("/api/v1/purchase-orders/{$confirmed['id']}")->json();
        $this->assertCount(1, $detail['goods_receipts']);
        $this->assertCount(2, $detail['goods_receipts'][0]['items']);
    }

    /** GD8: a failed delete preserves the Receipt and all its Items. */
    public function test_gd8_failed_delete_preserves_receipt_and_items(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $project = $this->makeProjectForCompany($company);
        $material = $this->makeMaterialForCompany($company);
        [$order, , $receipt] = $this->createReceivedStock($project->id, $material->id, '10.000');
        $this->postJson($this->consumptionsEndpoint($project->id), $this->validConsumptionPayload(['material_id' => $material->id, 'quantity' => '10.000']));

        $this->deleteJson($this->receiptsEndpoint($order['id'], $receipt['id']))->assertStatus(422);

        $detail = $this->getJson("/api/v1/purchase-orders/{$order['id']}")->json();
        $this->assertCount(1, $detail['goods_receipts']);
        $this->assertCount(1, $detail['goods_receipts'][0]['items']);
    }

    /** GD9: a failed delete does not bump the Order's version. */
    public function test_gd9_failed_delete_does_not_bump_version(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $project = $this->makeProjectForCompany($company);
        $material = $this->makeMaterialForCompany($company);
        [$order, , $receipt] = $this->createReceivedStock($project->id, $material->id, '10.000');
        $this->postJson($this->consumptionsEndpoint($project->id), $this->validConsumptionPayload(['material_id' => $material->id, 'quantity' => '10.000']));

        $before = $this->getJson("/api/v1/purchase-orders/{$order['id']}")->json();
        $this->deleteJson($this->receiptsEndpoint($order['id'], $receipt['id']))->assertStatus(422);
        $after = $this->getJson("/api/v1/purchase-orders/{$order['id']}")->json();

        $this->assertSame($before['updated_at'], $after['updated_at']);
    }

    /** GD10: a successful delete bumps the Order's version. */
    public function test_gd10_successful_delete_bumps_version(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $project = $this->makeProjectForCompany($company);
        $material = $this->makeMaterialForCompany($company);
        [$order, , $receipt] = $this->createReceivedStock($project->id, $material->id, '10.000');

        $before = $this->getJson("/api/v1/purchase-orders/{$order['id']}")->json();
        $this->deleteJson($this->receiptsEndpoint($order['id'], $receipt['id']))->assertNoContent();

        $orderModel = PurchaseOrder::withoutGlobalScopes()->find($order['id']);
        $this->assertNotSame($before['updated_at'], $orderModel->updated_at?->toJSON());
    }

    /** GD11: the same chronology guard applies once the Order is cancelled. */
    public function test_gd11_cancelled_order_chronology_guard_identical(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $project = $this->makeProjectForCompany($company);
        $material = $this->makeMaterialForCompany($company);
        $otherMaterial = $this->makeMaterialForCompany($company);

        $order = $this->postJson('/api/v1/purchase-orders', $this->validPurchaseOrderPayload(['project_id' => $project->id]))->json();
        $item = $this->postJson("/api/v1/purchase-orders/{$order['id']}/items", $this->validPurchaseOrderItemPayload(['material_id' => $material->id, 'quantity' => '5.000']))->json();
        // A second, never-received Item keeps the Order's overall fulfillment
        // "partial" (not fully received) after item1 is received in full —
        // this is what keeps cancel() allowed under §45 while still
        // preserving the Receipt (§46).
        $this->postJson("/api/v1/purchase-orders/{$order['id']}/items", $this->validPurchaseOrderItemPayload(['material_id' => $otherMaterial->id]));

        $fresh = $this->getJson("/api/v1/purchase-orders/{$order['id']}")->json();
        $confirmed = $this->postJson("/api/v1/purchase-orders/{$order['id']}/confirm", ['updated_at' => $fresh['updated_at']])->json();

        $receipt = $this->postJson($this->receiptsEndpoint($confirmed['id']), $this->validGoodsReceiptPayload([
            'items' => [['purchase_order_item_id' => $item['id'], 'quantity' => '5.000']],
        ]))->json();

        $freshAfterReceipt = $this->getJson("/api/v1/purchase-orders/{$order['id']}")->json();
        $this->assertSame('partial', $freshAfterReceipt['fulfillment_status']);

        $cancelled = $this->postJson("/api/v1/purchase-orders/{$order['id']}/cancel", ['updated_at' => $freshAfterReceipt['updated_at']])->json();

        $this->postJson($this->consumptionsEndpoint($project->id), $this->validConsumptionPayload(['material_id' => $material->id, 'quantity' => '5.000']));

        $this->deleteJson($this->receiptsEndpoint($cancelled['id'], $receipt['id']))->assertStatus(422);
    }

    /** GD12: deleting the final safe Receipt updates fulfillment back down. */
    public function test_gd12_deleting_safe_receipt_updates_fulfillment(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $project = $this->makeProjectForCompany($company);
        $material = $this->makeMaterialForCompany($company);
        [$order, , $receipt] = $this->createReceivedStock($project->id, $material->id, '10.000');

        $before = $this->getJson("/api/v1/purchase-orders/{$order['id']}")->json();
        $this->assertSame('received', $before['fulfillment_status']);

        $this->deleteJson($this->receiptsEndpoint($order['id'], $receipt['id']))->assertNoContent();

        $after = $this->getJson("/api/v1/purchase-orders/{$order['id']}")->json();
        $this->assertSame('not_received', $after['fulfillment_status']);
    }

    /** GD13: direct GoodsReceiptService::delete() re-resolves tenant, rejecting a foreign Order. */
    public function test_gd13_direct_service_tenant_defense_preserved(): void
    {
        [$companyA] = $this->actingAsNewCompanyMember();
        $projectA = $this->makeProjectForCompany($companyA);
        $materialA = $this->makeMaterialForCompany($companyA);
        [$orderA, , $receiptA] = $this->createReceivedStock($projectA->id, $materialA->id, '5.000');

        [$companyB] = $this->actingAsNewCompanyMember();

        $this->currentCompanyContext()->run($companyB, function () use ($orderA, $receiptA) {
            $this->expectException(ModelNotFoundException::class);
            app(GoodsReceiptService::class)->delete($orderA['id'], $receiptA['id']);
        });
    }

    /** GD14: the error is controlled — never a raw FK/SQL message. */
    public function test_gd14_controlled_error_never_raw_fk(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $project = $this->makeProjectForCompany($company);
        $material = $this->makeMaterialForCompany($company);
        [$order, , $receipt] = $this->createReceivedStock($project->id, $material->id, '10.000');
        $this->postJson($this->consumptionsEndpoint($project->id), $this->validConsumptionPayload(['material_id' => $material->id, 'quantity' => '10.000']));

        $response = $this->deleteJson($this->receiptsEndpoint($order['id'], $receipt['id']));

        $response->assertStatus(422);
        $this->assertStringNotContainsStringIgnoringCase('SQLSTATE', $response->getContent());
        $this->assertStringNotContainsStringIgnoringCase('constraint', $response->getContent());
    }
}
