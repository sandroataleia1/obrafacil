<?php

namespace Tests\Feature\PurchaseOrders;

use App\Purchases\PurchaseOrderService;
use App\Suppliers\SupplierService;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Feature\PurchaseOrders\Concerns\InteractsWithPurchaseOrders;
use Tests\TestCase;

/**
 * SUPPLY-API-01C §78, SG1-SG10. PurchaseOrder is Supplier's FIRST real
 * dependency — proves SupplierService::hasPurchaseOrders() is wired for
 * real, and delete() is tenant-defended.
 */
class PurchaseOrderSupplierGuardTest extends TestCase
{
    use InteractsWithPurchaseOrders, RefreshDatabase;

    private const string ORDERS = '/api/v1/purchase-orders';

    private function supplierEndpoint(string $supplierId): string
    {
        return "/api/v1/suppliers/{$supplierId}";
    }

    /** SG1: any PurchaseOrder for a Supplier blocks its delete (draft case). */
    public function test_sg1_any_purchase_order_blocks_supplier_delete(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $supplier = $this->makeSupplierForCompany($company);
        $this->postJson(self::ORDERS, $this->validPurchaseOrderPayload(['supplier_id' => $supplier->id]))->assertCreated();

        $this->deleteJson($this->supplierEndpoint($supplier->id))
            ->assertStatus(422)->assertJsonValidationErrors('supplier');
    }

    /** SG2: a draft Order blocks. */
    public function test_sg2_draft_order_blocks(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $supplier = $this->makeSupplierForCompany($company);
        $this->makePurchaseOrderForCompany($company, ['supplier_id' => $supplier->id, 'commercial_status' => 'draft']);

        $this->deleteJson($this->supplierEndpoint($supplier->id))->assertStatus(422);
    }

    /** SG3: an ordered Order blocks. */
    public function test_sg3_ordered_order_blocks(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $supplier = $this->makeSupplierForCompany($company);
        $this->makePurchaseOrderForCompany($company, ['supplier_id' => $supplier->id, 'commercial_status' => 'ordered']);

        $this->deleteJson($this->supplierEndpoint($supplier->id))->assertStatus(422);
    }

    /** SG4: a cancelled Order still blocks (§37: "including cancelled ones"). */
    public function test_sg4_cancelled_order_blocks(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $supplier = $this->makeSupplierForCompany($company);
        $this->makePurchaseOrderForCompany($company, ['supplier_id' => $supplier->id, 'commercial_status' => 'cancelled']);

        $this->deleteJson($this->supplierEndpoint($supplier->id))->assertStatus(422);
    }

    /** SG5: deleting the only (draft) Order releases the Supplier delete guard. */
    public function test_sg5_deleting_only_draft_order_releases_guard(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $supplier = $this->makeSupplierForCompany($company);
        $order = $this->postJson(self::ORDERS, $this->validPurchaseOrderPayload(['supplier_id' => $supplier->id]))->json();

        $this->deleteJson(self::ORDERS."/{$order['id']}", ['updated_at' => $order['updated_at']])->assertNoContent();

        $this->deleteJson($this->supplierEndpoint($supplier->id))->assertNoContent();
    }

    /** SG6: an inactive Supplier with a historical Order remains (inactivation doesn't remove it, and delete stays blocked). */
    public function test_sg6_inactive_supplier_with_historical_order_remains(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $supplier = $this->makeSupplierForCompany($company);
        $this->postJson(self::ORDERS, $this->validPurchaseOrderPayload(['supplier_id' => $supplier->id]))->assertCreated();

        $this->putJson($this->supplierEndpoint($supplier->id), [
            'name' => $supplier->name, 'active' => false,
        ])->assertOk()->assertJsonPath('active', false);

        $this->deleteJson($this->supplierEndpoint($supplier->id))->assertStatus(422);
        $this->assertDatabaseHas('suppliers', ['id' => $supplier->id]);
    }

    /** SG7: a direct SupplierService::update() call with a foreign-tenant Supplier is rejected. */
    public function test_sg7_direct_supplier_service_foreign_update_rejected(): void
    {
        [$companyA] = $this->makeCompanyWithMember();
        $supplierA = $this->makeSupplierForCompany($companyA);

        [$companyB] = $this->actingAsNewCompanyMember();

        $caught = null;
        $this->currentCompanyContext()->run($companyB, function () use ($supplierA, &$caught) {
            try {
                app(SupplierService::class)->update($supplierA, ['name' => 'Hostil']);
            } catch (ModelNotFoundException $e) {
                $caught = $e;
            }
        });

        $this->assertNotNull($caught);
        $this->assertDatabaseHas('suppliers', ['id' => $supplierA->id, 'name' => $supplierA->name]);
    }

    /** SG8: a direct SupplierService::delete() call with a foreign-tenant Supplier is rejected. */
    public function test_sg8_direct_supplier_service_foreign_delete_rejected(): void
    {
        [$companyA] = $this->makeCompanyWithMember();
        $supplierA = $this->makeSupplierForCompany($companyA);

        [$companyB] = $this->actingAsNewCompanyMember();

        $caught = null;
        $this->currentCompanyContext()->run($companyB, function () use ($supplierA, &$caught) {
            try {
                app(SupplierService::class)->delete($supplierA);
            } catch (ModelNotFoundException $e) {
                $caught = $e;
            }
        });

        $this->assertNotNull($caught);
        $this->assertDatabaseHas('suppliers', ['id' => $supplierA->id]);
    }

    /** SG9: SupplierService::delete() takes a real row lock (structural proof — §43). */
    public function test_sg9_supplier_service_delete_uses_row_lock(): void
    {
        $reflection = new \ReflectionClass(SupplierService::class);
        $method = new \ReflectionMethod(SupplierService::class, 'delete');
        $source = implode('', array_slice(
            file($reflection->getFileName()),
            $method->getStartLine() - 1,
            $method->getEndLine() - $method->getStartLine() + 1
        ));

        $this->assertStringContainsString('lockForUpdate()', $source);
    }

    /** SG10: PurchaseOrderService::create() also locks the Supplier row — proven structurally (real race covered by PM10/PM11's technique, mirrored here for Supplier via source inspection to keep this suite single-process). */
    public function test_sg10_create_order_locks_supplier_row(): void
    {
        $reflection = new \ReflectionClass(PurchaseOrderService::class);
        $method = new \ReflectionMethod(PurchaseOrderService::class, 'create');
        $source = implode('', array_slice(
            file($reflection->getFileName()),
            $method->getStartLine() - 1,
            $method->getEndLine() - $method->getStartLine() + 1
        ));

        $this->assertStringContainsString('lockForUpdate()', $source);
    }
}
