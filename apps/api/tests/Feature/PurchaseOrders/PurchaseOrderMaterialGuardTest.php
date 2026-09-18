<?php

namespace Tests\Feature\PurchaseOrders;

use App\Materials\MaterialService;
use App\Models\Company;
use App\Models\Material;
use App\Models\MaterialRequirement;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use ReflectionClass;
use ReflectionMethod;
use Tests\Feature\PurchaseOrders\Concerns\InteractsWithPurchaseOrders;
use Tests\TestCase;

/**
 * SUPPLY-API-01C §77, PM1-PM9. PurchaseOrderItem is Material's SECOND
 * real dependency — proves MaterialService::hasDependents() now also
 * checks purchase_order_items, and that the guards/tenant-defense hold.
 * PM10-PM12 (real cross-process concurrency) live in
 * PurchaseOrderMaterialConcurrencyTest — they need DatabaseTruncation,
 * incompatible with this class's RefreshDatabase.
 */
class PurchaseOrderMaterialGuardTest extends TestCase
{
    use InteractsWithPurchaseOrders, RefreshDatabase;

    private const string ORDERS = '/api/v1/purchase-orders';

    private function materialEndpoint(string $materialId): string
    {
        return "/api/v1/materials/{$materialId}";
    }

    private function createDraftOrderWithItem(Company $company, ?Material $material = null): array
    {
        $order = $this->postJson(self::ORDERS, $this->validPurchaseOrderPayload())->json();
        $payload = $this->validPurchaseOrderItemPayload();
        if ($material !== null) {
            $payload['material_id'] = $material->id;
        }
        $this->postJson(self::ORDERS."/{$order['id']}/items", $payload)->assertCreated();

        return $order;
    }

    /** PM1: an existing PurchaseOrderItem blocks Material unit_code change. */
    public function test_pm1_item_blocks_material_unit_change(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $material = $this->makeMaterialForCompany($company, ['unit_code' => 'kg']);
        $this->createDraftOrderWithItem($company, $material);

        $this->putJson($this->materialEndpoint($material->id), [
            'name' => $material->name, 'unit_code' => 'un',
        ])->assertStatus(422)->assertJsonValidationErrors('unit_code');
    }

    /** PM2: an existing PurchaseOrderItem blocks a custom-unit change. */
    public function test_pm2_item_blocks_custom_unit_change(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $material = $this->makeMaterialForCompany($company, ['unit_code' => 'other', 'unit_custom_label' => 'rolo']);
        $this->createDraftOrderWithItem($company, $material);

        $this->putJson($this->materialEndpoint($material->id), [
            'name' => $material->name, 'unit_code' => 'other', 'unit_custom_label' => 'bobina',
        ])->assertStatus(422)->assertJsonValidationErrors('unit_code');
    }

    /** PM3: an existing PurchaseOrderItem blocks Material DELETE. */
    public function test_pm3_item_blocks_material_delete(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $material = $this->makeMaterialForCompany($company);
        $this->createDraftOrderWithItem($company, $material);

        $this->deleteJson($this->materialEndpoint($material->id))
            ->assertStatus(422)->assertJsonValidationErrors('material');
    }

    /** PM4: deleting the only item releases the guard when no Requirement/other item exists. */
    public function test_pm4_deleting_item_releases_guard(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $material = $this->makeMaterialForCompany($company, ['unit_code' => 'kg']);
        $order = $this->createDraftOrderWithItem($company, $material);
        $itemId = $this->getJson(self::ORDERS."/{$order['id']}")->json('items.0.id');

        $this->deleteJson(self::ORDERS."/{$order['id']}/items/{$itemId}")->assertNoContent();

        $this->putJson($this->materialEndpoint($material->id), [
            'name' => $material->name, 'unit_code' => 'un',
        ])->assertOk();

        $this->deleteJson($this->materialEndpoint($material->id))->assertNoContent();
    }

    /** PM5: a MaterialRequirement alone (no Item) still blocks. */
    public function test_pm5_requirement_alone_still_blocks(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $material = $this->makeMaterialForCompany($company);
        $project = $this->makeProjectForCompany($company);
        $this->currentCompanyContext()->run($company, fn () => MaterialRequirement::factory()->create([
            'project_id' => $project->id, 'material_id' => $material->id,
        ]));

        $this->deleteJson($this->materialEndpoint($material->id))
            ->assertStatus(422)->assertJsonValidationErrors('material');
    }

    /** PM6: MaterialRequirement AND PurchaseOrderItem both existing still blocks (removing only one doesn't release it). */
    public function test_pm6_requirement_and_item_both_block(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $material = $this->makeMaterialForCompany($company);
        $project = $this->makeProjectForCompany($company);
        $this->currentCompanyContext()->run($company, fn () => MaterialRequirement::factory()->create([
            'project_id' => $project->id, 'material_id' => $material->id,
        ]));
        $order = $this->createDraftOrderWithItem($company, $material);
        $itemId = $this->getJson(self::ORDERS."/{$order['id']}")->json('items.0.id');

        // Removing the item alone must not release the guard — the Requirement remains.
        $this->deleteJson(self::ORDERS."/{$order['id']}/items/{$itemId}")->assertNoContent();
        $this->deleteJson($this->materialEndpoint($material->id))
            ->assertStatus(422)->assertJsonValidationErrors('material');
    }

    /** PM7: a direct MaterialService::update() call with a foreign-tenant Material is rejected. */
    public function test_pm7_direct_material_service_foreign_update_rejected(): void
    {
        [$companyA] = $this->makeCompanyWithMember();
        $materialA = $this->makeMaterialForCompany($companyA);

        [$companyB] = $this->actingAsNewCompanyMember();

        $caught = null;
        $this->currentCompanyContext()->run($companyB, function () use ($materialA, &$caught) {
            try {
                app(MaterialService::class)->update($materialA, ['name' => 'Hostil', 'unit_code' => 'kg']);
            } catch (ModelNotFoundException $e) {
                $caught = $e;
            }
        });

        $this->assertNotNull($caught);
        $this->assertDatabaseHas('materials', ['id' => $materialA->id, 'name' => $materialA->name]);
    }

    /** PM8: a direct MaterialService::delete() call with a foreign-tenant Material is rejected. */
    public function test_pm8_direct_material_service_foreign_delete_rejected(): void
    {
        [$companyA] = $this->makeCompanyWithMember();
        $materialA = $this->makeMaterialForCompany($companyA);

        [$companyB] = $this->actingAsNewCompanyMember();

        $caught = null;
        $this->currentCompanyContext()->run($companyB, function () use ($materialA, &$caught) {
            try {
                app(MaterialService::class)->delete($materialA);
            } catch (ModelNotFoundException $e) {
                $caught = $e;
            }
        });

        $this->assertNotNull($caught);
        $this->assertDatabaseHas('materials', ['id' => $materialA->id]);
    }

    /** PM9: MaterialService::delete() takes a real row lock (structural proof — reflection on its own source). */
    public function test_pm9_material_service_delete_uses_row_lock(): void
    {
        $reflection = new ReflectionClass(MaterialService::class);
        $method = new ReflectionMethod(MaterialService::class, 'delete');
        $source = implode('', array_slice(
            file($reflection->getFileName()),
            $method->getStartLine() - 1,
            $method->getEndLine() - $method->getStartLine() + 1
        ));

        $this->assertStringContainsString('lockForUpdate()', $source);
    }
}
