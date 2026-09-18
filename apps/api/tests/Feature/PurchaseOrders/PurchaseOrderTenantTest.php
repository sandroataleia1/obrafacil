<?php

namespace Tests\Feature\PurchaseOrders;

use App\Purchases\PurchaseOrderItemService;
use App\Purchases\PurchaseOrderService;
use App\Purchases\PurchaseOrderStatusService;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Validation\ValidationException;
use Tests\Feature\PurchaseOrders\Concerns\InteractsWithPurchaseOrders;
use Tests\TestCase;

/**
 * SUPPLY-API-01C §79, PT1-PT14.
 */
class PurchaseOrderTenantTest extends TestCase
{
    use InteractsWithPurchaseOrders, RefreshDatabase;

    private const string ORDERS = '/api/v1/purchase-orders';

    /** PT1: an Order belonging to Company A is invisible (404) from Company B. */
    public function test_pt1_order_a_invisible_in_company_b(): void
    {
        [$companyA] = $this->makeCompanyWithMember();
        $orderA = $this->makePurchaseOrderForCompany($companyA);

        $this->actingAsNewCompanyMember();

        $this->getJson(self::ORDERS."/{$orderA->id}")->assertStatus(404);
    }

    /** PT2: an Item belonging to Company A is invisible (404) from Company B, even via its own Order id. */
    public function test_pt2_item_a_invisible_in_company_b(): void
    {
        [$companyA] = $this->makeCompanyWithMember();
        $orderA = $this->makePurchaseOrderForCompany($companyA);
        $itemA = $this->makeItemForPurchaseOrder($companyA, $orderA);

        $this->actingAsNewCompanyMember();

        $this->putJson(self::ORDERS."/{$orderA->id}/items/{$itemA->id}", [
            'description' => 'x', 'quantity' => '1.000', 'unit_price' => '1.00', 'updated_at' => $itemA->updated_at->toJSON(),
        ])->assertStatus(404);
    }

    /** PT3: a Supplier belonging to Company A cannot be used to create an Order in Company B. */
    public function test_pt3_supplier_a_cannot_create_order_b(): void
    {
        [$companyA] = $this->makeCompanyWithMember();
        $supplierA = $this->makeSupplierForCompany($companyA);

        $this->actingAsNewCompanyMember();

        $this->postJson(self::ORDERS, $this->validPurchaseOrderPayload(['supplier_id' => $supplierA->id]))
            ->assertStatus(422)->assertJsonValidationErrors('supplier_id');
    }

    /** PT4: a Project belonging to Company A cannot be used to create an Order in Company B. */
    public function test_pt4_project_a_cannot_create_order_b(): void
    {
        [$companyA] = $this->makeCompanyWithMember();
        $projectA = $this->makeProjectForCompany($companyA);

        $this->actingAsNewCompanyMember();

        $this->postJson(self::ORDERS, $this->validPurchaseOrderPayload(['project_id' => $projectA->id]))
            ->assertStatus(422)->assertJsonValidationErrors('project_id');
    }

    /** PT5: a Material belonging to Company A cannot be used to create an Item in Company B. */
    public function test_pt5_material_a_cannot_create_item_b(): void
    {
        [$companyA] = $this->makeCompanyWithMember();
        $materialA = $this->makeMaterialForCompany($companyA);

        $this->actingAsNewCompanyMember();
        $orderB = $this->postJson(self::ORDERS, $this->validPurchaseOrderPayload())->json();

        $this->postJson(self::ORDERS."/{$orderB['id']}/items", $this->validPurchaseOrderItemPayload(['material_id' => $materialA->id]))
            ->assertStatus(422)->assertJsonValidationErrors('material_id');
    }

    /** PT6: a hostile company_id in the create payload is prohibited (422). */
    public function test_pt6_hostile_company_id_rejected(): void
    {
        [$companyA] = $this->makeCompanyWithMember();

        $this->actingAsNewCompanyMember();

        $this->postJson(self::ORDERS, $this->validPurchaseOrderPayload(['company_id' => $companyA->id]))
            ->assertStatus(422)->assertJsonValidationErrors('company_id');
    }

    /** PT7: a direct PurchaseOrderService::create() call validates the Supplier, never trusting the caller. */
    public function test_pt7_direct_create_validates_supplier(): void
    {
        [$companyA] = $this->makeCompanyWithMember();
        $supplierA = $this->makeSupplierForCompany($companyA);

        [$companyB] = $this->actingAsNewCompanyMember();
        $projectB = $this->makeProjectForCompany($companyB);

        $caught = null;
        $this->currentCompanyContext()->run($companyB, function () use ($supplierA, $projectB, &$caught) {
            try {
                app(PurchaseOrderService::class)->create([
                    'supplier_id' => $supplierA->id, 'project_id' => $projectB->id, 'order_date' => now()->toDateString(),
                ]);
            } catch (ValidationException $e) {
                $caught = $e;
            }
        });

        $this->assertNotNull($caught);
        $this->assertArrayHasKey('supplier_id', $caught->errors());
    }

    /** PT8: a direct PurchaseOrderService::create() call validates the Project, never trusting the caller. */
    public function test_pt8_direct_create_validates_project(): void
    {
        [$companyA] = $this->makeCompanyWithMember();
        $projectA = $this->makeProjectForCompany($companyA);

        [$companyB] = $this->actingAsNewCompanyMember();
        $supplierB = $this->makeSupplierForCompany($companyB);

        $caught = null;
        $this->currentCompanyContext()->run($companyB, function () use ($supplierB, $projectA, &$caught) {
            try {
                app(PurchaseOrderService::class)->create([
                    'supplier_id' => $supplierB->id, 'project_id' => $projectA->id, 'order_date' => now()->toDateString(),
                ]);
            } catch (ValidationException $e) {
                $caught = $e;
            }
        });

        $this->assertNotNull($caught);
        $this->assertArrayHasKey('project_id', $caught->errors());
    }

    /** PT9: a direct PurchaseOrderItemService::addItem() call validates the Material, never trusting the caller. */
    public function test_pt9_direct_item_create_validates_material(): void
    {
        [$companyA] = $this->makeCompanyWithMember();
        $materialA = $this->makeMaterialForCompany($companyA);

        [$companyB] = $this->actingAsNewCompanyMember();
        $orderB = $this->makePurchaseOrderForCompany($companyB);

        $caught = null;
        $this->currentCompanyContext()->run($companyB, function () use ($orderB, $materialA, &$caught) {
            try {
                app(PurchaseOrderItemService::class)->addItem($orderB, [
                    'material_id' => $materialA->id, 'description' => 'x', 'quantity' => '1.000', 'unit_price' => '1.00',
                ]);
            } catch (ValidationException $e) {
                $caught = $e;
            }
        });

        $this->assertNotNull($caught);
        $this->assertArrayHasKey('material_id', $caught->errors());
    }

    /** PT10: a direct PurchaseOrderService::updateHeader() call with a foreign-tenant Order is rejected. */
    public function test_pt10_direct_order_update_foreign_blocked(): void
    {
        [$companyA] = $this->makeCompanyWithMember();
        $orderA = $this->makePurchaseOrderForCompany($companyA);

        [$companyB] = $this->actingAsNewCompanyMember();

        $caught = null;
        $this->currentCompanyContext()->run($companyB, function () use ($orderA, &$caught) {
            try {
                app(PurchaseOrderService::class)->updateHeader($orderA, [
                    'notes' => 'hostil', 'updated_at' => $orderA->updated_at->toJSON(),
                ]);
            } catch (ModelNotFoundException $e) {
                $caught = $e;
            }
        });

        $this->assertNotNull($caught);
    }

    /** PT11: a direct PurchaseOrderService::deleteDraft() call with a foreign-tenant Order is rejected. */
    public function test_pt11_direct_order_delete_foreign_blocked(): void
    {
        [$companyA] = $this->makeCompanyWithMember();
        $orderA = $this->makePurchaseOrderForCompany($companyA);

        [$companyB] = $this->actingAsNewCompanyMember();

        $caught = null;
        $this->currentCompanyContext()->run($companyB, function () use ($orderA, &$caught) {
            try {
                app(PurchaseOrderService::class)->deleteDraft($orderA, $orderA->updated_at->toJSON());
            } catch (ModelNotFoundException $e) {
                $caught = $e;
            }
        });

        $this->assertNotNull($caught);
        $this->assertDatabaseHas('purchase_orders', ['id' => $orderA->id]);
    }

    /** PT12: a direct PurchaseOrderStatusService call with a foreign-tenant Order is rejected. */
    public function test_pt12_direct_status_foreign_blocked(): void
    {
        [$companyA] = $this->makeCompanyWithMember();
        $orderA = $this->makePurchaseOrderForCompany($companyA);

        [$companyB] = $this->actingAsNewCompanyMember();

        $caught = null;
        $this->currentCompanyContext()->run($companyB, function () use ($orderA, &$caught) {
            try {
                app(PurchaseOrderStatusService::class)->cancel($orderA, $orderA->updated_at->toJSON());
            } catch (ModelNotFoundException $e) {
                $caught = $e;
            }
        });

        $this->assertNotNull($caught);
        $this->assertDatabaseHas('purchase_orders', ['id' => $orderA->id, 'commercial_status' => 'draft']);
    }

    /** PT13: a direct PurchaseOrderItemService::updateItem() call with a foreign-tenant Order/Item is rejected. */
    public function test_pt13_direct_item_update_foreign_blocked(): void
    {
        [$companyA] = $this->makeCompanyWithMember();
        $orderA = $this->makePurchaseOrderForCompany($companyA);
        $itemA = $this->makeItemForPurchaseOrder($companyA, $orderA);

        [$companyB] = $this->actingAsNewCompanyMember();

        $caught = null;
        $this->currentCompanyContext()->run($companyB, function () use ($orderA, $itemA, &$caught) {
            try {
                app(PurchaseOrderItemService::class)->updateItem($orderA, $itemA, [
                    'description' => 'hostil', 'quantity' => '1.000', 'unit_price' => '1.00', 'updated_at' => $itemA->updated_at->toJSON(),
                ]);
            } catch (ModelNotFoundException $e) {
                $caught = $e;
            }
        });

        $this->assertNotNull($caught);
        $this->assertDatabaseHas('purchase_order_items', ['id' => $itemA->id, 'description' => $itemA->description]);
    }

    /** PT14: a direct PurchaseOrderItemService::deleteItem() call with a foreign-tenant Order/Item is rejected. */
    public function test_pt14_direct_item_delete_foreign_blocked(): void
    {
        [$companyA] = $this->makeCompanyWithMember();
        $orderA = $this->makePurchaseOrderForCompany($companyA);
        $itemA = $this->makeItemForPurchaseOrder($companyA, $orderA);

        [$companyB] = $this->actingAsNewCompanyMember();

        $caught = null;
        $this->currentCompanyContext()->run($companyB, function () use ($orderA, $itemA, &$caught) {
            try {
                app(PurchaseOrderItemService::class)->deleteItem($orderA, $itemA);
            } catch (ModelNotFoundException $e) {
                $caught = $e;
            }
        });

        $this->assertNotNull($caught);
        $this->assertDatabaseHas('purchase_order_items', ['id' => $itemA->id]);
    }
}
