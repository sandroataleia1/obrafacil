<?php

namespace Tests\Feature\Stock;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Feature\Stock\Concerns\InteractsWithStock;
use Tests\TestCase;

/**
 * SUPPLY-API-01E §79, SP1-SP18.
 */
class StockPositionApiTest extends TestCase
{
    use InteractsWithStock, RefreshDatabase;

    /** SP1: a pair with only a physical movement is listed. */
    public function test_sp1_movement_only_pair_listed(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $project = $this->makeProjectForCompany($company);
        $material = $this->makeMaterialForCompany($company);
        $this->postJson($this->adjustmentsEndpoint($project->id), $this->validAdjustmentPayload(['material_id' => $material->id]));

        $response = $this->getJson($this->stockPositionsEndpoint());

        $response->assertOk();
        $this->assertCount(1, $response->json('data'));
    }

    /** SP2: a pair with only a MaterialRequirement is listed. */
    public function test_sp2_requirement_only_pair_listed(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $project = $this->makeProjectForCompany($company);
        $material = $this->makeMaterialForCompany($company);
        $this->postJson("/api/v1/projects/{$project->id}/material-requirements", ['material_id' => $material->id, 'required_quantity' => '10.000']);

        $response = $this->getJson($this->stockPositionsEndpoint());

        $this->assertCount(1, $response->json('data'));
        $this->assertSame('10.000', $response->json('data.0.required_quantity'));
    }

    /** SP3: a pair with only an ordered PurchaseOrder Item is listed. */
    public function test_sp3_ordered_purchase_only_pair_listed(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $material = $this->makeMaterialForCompany($company);
        $order = $this->postJson('/api/v1/purchase-orders', $this->validPurchaseOrderPayload())->json();
        $this->postJson("/api/v1/purchase-orders/{$order['id']}/items", $this->validPurchaseOrderItemPayload(['material_id' => $material->id]));
        $fresh = $this->getJson("/api/v1/purchase-orders/{$order['id']}")->json();
        $this->postJson("/api/v1/purchase-orders/{$order['id']}/confirm", ['updated_at' => $fresh['updated_at']]);

        $response = $this->getJson($this->stockPositionsEndpoint().'?project_id='.$order['project']['id']);

        $this->assertCount(1, $response->json('data'));
    }

    /** SP4: a draft-only pair is absent. */
    public function test_sp4_draft_only_pair_absent(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $material = $this->makeMaterialForCompany($company);
        $order = $this->postJson('/api/v1/purchase-orders', $this->validPurchaseOrderPayload())->json();
        $this->postJson("/api/v1/purchase-orders/{$order['id']}/items", $this->validPurchaseOrderItemPayload(['material_id' => $material->id]));

        $response = $this->getJson($this->stockPositionsEndpoint().'?project_id='.$order['project']['id']);

        $this->assertCount(0, $response->json('data'));
    }

    /** SP5: a cancelled order with no Receipt leaves no pair. */
    public function test_sp5_cancelled_no_receipt_pair_absent(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $material = $this->makeMaterialForCompany($company);
        $order = $this->postJson('/api/v1/purchase-orders', $this->validPurchaseOrderPayload())->json();
        $this->postJson("/api/v1/purchase-orders/{$order['id']}/items", $this->validPurchaseOrderItemPayload(['material_id' => $material->id]));
        $fresh = $this->getJson("/api/v1/purchase-orders/{$order['id']}")->json();
        $this->postJson("/api/v1/purchase-orders/{$order['id']}/cancel", ['updated_at' => $fresh['updated_at']])->assertOk();

        $response = $this->getJson($this->stockPositionsEndpoint().'?project_id='.$order['project']['id']);

        $this->assertCount(0, $response->json('data'));
    }

    /** SP6: a cancelled order WITH a Receipt still shows the pair (via the physical movement). */
    public function test_sp6_cancelled_with_receipt_pair_present(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $project = $this->makeProjectForCompany($company);
        $material = $this->makeMaterialForCompany($company);
        [$order] = $this->createReceivedStock($project->id, $material->id, '5.000');
        $fresh = $this->getJson("/api/v1/purchase-orders/{$order['id']}")->json();
        $this->postJson("/api/v1/purchase-orders/{$order['id']}/cancel", ['updated_at' => $fresh['updated_at']]);

        $response = $this->getJson($this->stockPositionsEndpoint().'?project_id='.$project->id);

        $this->assertCount(1, $response->json('data'));
    }

    /** SP7: required is null when unplanned. */
    public function test_sp7_required_null_when_unplanned(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $project = $this->makeProjectForCompany($company);
        $material = $this->makeMaterialForCompany($company);
        $this->createReceivedStock($project->id, $material->id, '5.000');

        $response = $this->getJson($this->stockDetailEndpoint($project->id, $material->id));

        $this->assertNull($response->json('required_quantity'));
    }

    /** SP8: purchased for an ordered order is the full item quantity. */
    public function test_sp8_purchased_ordered_full_quantity(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $project = $this->makeProjectForCompany($company);
        $material = $this->makeMaterialForCompany($company);
        $order = $this->postJson('/api/v1/purchase-orders', $this->validPurchaseOrderPayload(['project_id' => $project->id]))->json();
        $this->postJson("/api/v1/purchase-orders/{$order['id']}/items", $this->validPurchaseOrderItemPayload(['material_id' => $material->id, 'quantity' => '20.000']));
        $fresh = $this->getJson("/api/v1/purchase-orders/{$order['id']}")->json();
        $this->postJson("/api/v1/purchase-orders/{$order['id']}/confirm", ['updated_at' => $fresh['updated_at']]);

        $response = $this->getJson($this->stockDetailEndpoint($project->id, $material->id));

        $this->assertSame('20.000', $response->json('purchased_quantity'));
    }

    /** SP9: purchased for a cancelled order equals only what was received. */
    public function test_sp9_purchased_cancelled_equals_received_only(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $project = $this->makeProjectForCompany($company);
        $material = $this->makeMaterialForCompany($company);
        [$order] = $this->createReceivedStock($project->id, $material->id, '4.000');
        // Order has a single fully-received item, so cancel is allowed only
        // if fulfillment isn't "received" — add a second unreceived item first.
        $otherMaterial = $this->makeMaterialForCompany($company);
        $this->postJson("/api/v1/purchase-orders/{$order['id']}/items", $this->validPurchaseOrderItemPayload(['material_id' => $otherMaterial->id, 'quantity' => '10.000']));
        $fresh = $this->getJson("/api/v1/purchase-orders/{$order['id']}")->json();
        $this->postJson("/api/v1/purchase-orders/{$order['id']}/cancel", ['updated_at' => $fresh['updated_at']]);

        $response = $this->getJson($this->stockDetailEndpoint($project->id, $material->id));

        $this->assertSame('4.000', $response->json('purchased_quantity'));
    }

    /** SP10: received sums all physical Receipts regardless of order status. */
    public function test_sp10_received_all_physical_receipts(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $project = $this->makeProjectForCompany($company);
        $material = $this->makeMaterialForCompany($company);
        $this->createReceivedStock($project->id, $material->id, '6.000');

        $response = $this->getJson($this->stockDetailEndpoint($project->id, $material->id));

        $this->assertSame('6.000', $response->json('received_quantity'));
    }

    /** SP11: consumed is the total of all Consumptions. */
    public function test_sp11_consumed_total(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $project = $this->makeProjectForCompany($company);
        $material = $this->makeMaterialForCompany($company);
        $this->createReceivedStock($project->id, $material->id, '10.000');
        $this->postJson($this->consumptionsEndpoint($project->id), $this->validConsumptionPayload(['material_id' => $material->id, 'quantity' => '3.000']));

        $response = $this->getJson($this->stockDetailEndpoint($project->id, $material->id));

        $this->assertSame('3.000', $response->json('consumed_quantity'));
    }

    /** SP12: stock includes Adjustments. */
    public function test_sp12_stock_includes_adjustments(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $project = $this->makeProjectForCompany($company);
        $material = $this->makeMaterialForCompany($company);
        $this->createReceivedStock($project->id, $material->id, '10.000');
        $this->postJson($this->adjustmentsEndpoint($project->id), $this->validAdjustmentPayload(['material_id' => $material->id, 'type' => 'ADJUSTMENT_IN', 'quantity' => '5.000']));

        $response = $this->getJson($this->stockDetailEndpoint($project->id, $material->id));

        $this->assertSame('15.000', $response->json('stock_quantity'));
    }

    /** SP13: pending only counts ordered items, never cancelled/draft. */
    public function test_sp13_pending_ordered_only(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $project = $this->makeProjectForCompany($company);
        $material = $this->makeMaterialForCompany($company);
        $order = $this->postJson('/api/v1/purchase-orders', $this->validPurchaseOrderPayload(['project_id' => $project->id]))->json();
        $item = $this->postJson("/api/v1/purchase-orders/{$order['id']}/items", $this->validPurchaseOrderItemPayload(['material_id' => $material->id, 'quantity' => '10.000']))->json();
        $fresh = $this->getJson("/api/v1/purchase-orders/{$order['id']}")->json();
        $confirmed = $this->postJson("/api/v1/purchase-orders/{$order['id']}/confirm", ['updated_at' => $fresh['updated_at']])->json();
        $this->postJson($this->receiptsEndpoint($confirmed['id']), $this->validGoodsReceiptPayload([
            'items' => [['purchase_order_item_id' => $item['id'], 'quantity' => '4.000']],
        ]));

        $response = $this->getJson($this->stockDetailEndpoint($project->id, $material->id));

        $this->assertSame('6.000', $response->json('pending_receipt_quantity'));
    }

    /** SP14: missing_to_purchase formula is exact. */
    public function test_sp14_missing_formula_exact(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $project = $this->makeProjectForCompany($company);
        $material = $this->makeMaterialForCompany($company);
        $this->postJson("/api/v1/projects/{$project->id}/material-requirements", ['material_id' => $material->id, 'required_quantity' => '100.000']);
        $this->createReceivedStock($project->id, $material->id, '30.000');
        $this->postJson($this->consumptionsEndpoint($project->id), $this->validConsumptionPayload(['material_id' => $material->id, 'quantity' => '10.000']));

        $response = $this->getJson($this->stockDetailEndpoint($project->id, $material->id));

        // required 100 - consumed 10 - stock 20 - pending 0 = 70
        $this->assertSame('70.000', $response->json('missing_to_purchase_quantity'));
    }

    /** SP15: search filters by Material name. */
    public function test_sp15_search_by_material_name(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $project = $this->makeProjectForCompany($company);
        $cement = $this->makeMaterialForCompany($company, ['name' => 'Cimento CP-II']);
        $sand = $this->makeMaterialForCompany($company, ['name' => 'Areia média']);
        $this->postJson($this->adjustmentsEndpoint($project->id), $this->validAdjustmentPayload(['material_id' => $cement->id]));
        $this->postJson($this->adjustmentsEndpoint($project->id), $this->validAdjustmentPayload(['material_id' => $sand->id]));

        $response = $this->getJson($this->stockPositionsEndpoint().'?search=Cimento');

        $this->assertCount(1, $response->json('data'));
        $this->assertSame('Cimento CP-II', $response->json('data.0.material.name'));
    }

    /** SP16: project_id filters the list. */
    public function test_sp16_project_filter(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $projectA = $this->makeProjectForCompany($company);
        $projectB = $this->makeProjectForCompany($company);
        $material = $this->makeMaterialForCompany($company);
        $this->postJson($this->adjustmentsEndpoint($projectA->id), $this->validAdjustmentPayload(['material_id' => $material->id]));
        $this->postJson($this->adjustmentsEndpoint($projectB->id), $this->validAdjustmentPayload(['material_id' => $material->id]));

        $response = $this->getJson($this->stockPositionsEndpoint().'?project_id='.$projectA->id);

        $this->assertCount(1, $response->json('data'));
        $this->assertSame($projectA->id, $response->json('data.0.project.id'));
    }

    /** SP17: pagination respects per_page and returns meta. */
    public function test_sp17_pagination(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $project = $this->makeProjectForCompany($company);
        for ($i = 0; $i < 3; $i++) {
            $material = $this->makeMaterialForCompany($company);
            $this->postJson($this->adjustmentsEndpoint($project->id), $this->validAdjustmentPayload(['material_id' => $material->id]));
        }

        $response = $this->getJson($this->stockPositionsEndpoint().'?per_page=2');

        $this->assertCount(2, $response->json('data'));
        $this->assertSame(3, $response->json('meta.total'));
    }

    /** SP18: a valid Project+Material with zero history returns zeros, not a 404. */
    public function test_sp18_zero_history_detail_returns_zeros(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $project = $this->makeProjectForCompany($company);
        $material = $this->makeMaterialForCompany($company);

        $response = $this->getJson($this->stockDetailEndpoint($project->id, $material->id));

        $response->assertOk()->assertJson([
            'required_quantity' => null,
            'purchased_quantity' => '0.000',
            'received_quantity' => '0.000',
            'consumed_quantity' => '0.000',
            'stock_quantity' => '0.000',
            'pending_receipt_quantity' => '0.000',
            'missing_to_purchase_quantity' => null,
        ]);
    }
}
