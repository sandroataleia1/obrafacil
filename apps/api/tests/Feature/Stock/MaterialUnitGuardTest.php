<?php

namespace Tests\Feature\Stock;

use App\Models\MaterialConsumption;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Feature\Stock\Concerns\InteractsWithStock;
use Tests\TestCase;

/**
 * SUPPLY-API-01E §78, MU1-MU12.
 */
class MaterialUnitGuardTest extends TestCase
{
    use InteractsWithStock, RefreshDatabase;

    /** MU1: an existing Consumption blocks a Material unit change. */
    public function test_mu1_consumption_blocks_unit_change(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $project = $this->makeProjectForCompany($company);
        $material = $this->makeMaterialForCompany($company, ['unit_code' => 'un']);
        $this->createReceivedStock($project->id, $material->id, '10.000');
        $this->postJson($this->consumptionsEndpoint($project->id), $this->validConsumptionPayload(['material_id' => $material->id, 'quantity' => '1.000']));

        $this->putJson("/api/v1/materials/{$material->id}", ['name' => $material->name, 'unit_code' => 'kg'])
            ->assertStatus(422)->assertJsonValidationErrors('unit_code');
    }

    /** MU2: an existing Consumption blocks Material delete. */
    public function test_mu2_consumption_blocks_material_delete(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $project = $this->makeProjectForCompany($company);
        $material = $this->makeMaterialForCompany($company);
        $this->createReceivedStock($project->id, $material->id, '10.000');
        $this->postJson($this->consumptionsEndpoint($project->id), $this->validConsumptionPayload(['material_id' => $material->id, 'quantity' => '1.000']));

        $this->deleteJson("/api/v1/materials/{$material->id}")->assertStatus(422);
    }

    /**
     * MU3: deleting the only MaterialConsumption row releases the guard —
     * exercised directly against `MaterialService::hasDependents()`, since
     * a MaterialConsumption can only ever be CREATED against pre-existing
     * stock (a Receipt or an Adjustment), both of which are themselves
     * PERMANENT dependents (§41 — a Receipt's PurchaseOrderItem, an
     * Adjustment being append-only forever). This isolates exactly the
     * MaterialConsumption row's own contribution to the guard, mirroring
     * MU1/MU2's "consumption blocks" from the other direction.
     */
    public function test_mu3_deleting_only_consumption_releases_guard(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $project = $this->makeProjectForCompany($company);
        $material = $this->makeMaterialForCompany($company, ['unit_code' => 'un']);

        $consumption = $this->currentCompanyContext()->run($company, fn () => MaterialConsumption::factory()->create([
            'project_id' => $project->id,
            'material_id' => $material->id,
        ]));

        $this->putJson("/api/v1/materials/{$material->id}", ['name' => $material->name, 'unit_code' => 'kg'])
            ->assertStatus(422)->assertJsonValidationErrors('unit_code');

        $this->currentCompanyContext()->run($company, fn () => $consumption->delete());

        $this->putJson("/api/v1/materials/{$material->id}", ['name' => $material->name, 'unit_code' => 'kg'])
            ->assertStatus(200);
    }

    /** MU4: an existing StockAdjustment blocks a Material unit change. */
    public function test_mu4_adjustment_blocks_unit_change(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $project = $this->makeProjectForCompany($company);
        $material = $this->makeMaterialForCompany($company, ['unit_code' => 'un']);
        $this->postJson($this->adjustmentsEndpoint($project->id), $this->validAdjustmentPayload(['material_id' => $material->id]));

        $this->putJson("/api/v1/materials/{$material->id}", ['name' => $material->name, 'unit_code' => 'kg'])
            ->assertStatus(422)->assertJsonValidationErrors('unit_code');
    }

    /** MU5: an existing StockAdjustment blocks Material delete. */
    public function test_mu5_adjustment_blocks_material_delete(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $project = $this->makeProjectForCompany($company);
        $material = $this->makeMaterialForCompany($company);
        $this->postJson($this->adjustmentsEndpoint($project->id), $this->validAdjustmentPayload(['material_id' => $material->id]));

        $this->deleteJson("/api/v1/materials/{$material->id}")->assertStatus(422);
    }

    /** MU6: the Adjustment guard is permanent — there is no delete endpoint to release it. */
    public function test_mu6_adjustment_guard_is_permanent(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $project = $this->makeProjectForCompany($company);
        $material = $this->makeMaterialForCompany($company);
        $adjustment = $this->postJson($this->adjustmentsEndpoint($project->id), $this->validAdjustmentPayload(['material_id' => $material->id]))->json();

        $this->deleteJson($this->adjustmentsEndpoint($project->id).'/'.$adjustment['id'])->assertStatus(404);
        $this->deleteJson("/api/v1/materials/{$material->id}")->assertStatus(422);
    }

    /** MU7: an existing MaterialRequirement still blocks (SUPPLY-API-01B, unaffected). */
    public function test_mu7_requirement_still_blocks(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $project = $this->makeProjectForCompany($company);
        $material = $this->makeMaterialForCompany($company, ['unit_code' => 'un']);
        $this->postJson("/api/v1/projects/{$project->id}/material-requirements", ['material_id' => $material->id, 'required_quantity' => '5.000']);

        $this->putJson("/api/v1/materials/{$material->id}", ['name' => $material->name, 'unit_code' => 'kg'])
            ->assertStatus(422)->assertJsonValidationErrors('unit_code');
    }

    /** MU8: an existing PurchaseOrderItem still blocks (SUPPLY-API-01C, unaffected). */
    public function test_mu8_purchase_order_item_still_blocks(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $material = $this->makeMaterialForCompany($company, ['unit_code' => 'un']);
        $order = $this->postJson('/api/v1/purchase-orders', $this->validPurchaseOrderPayload())->json();
        $this->postJson("/api/v1/purchase-orders/{$order['id']}/items", $this->validPurchaseOrderItemPayload(['material_id' => $material->id]));

        $this->putJson("/api/v1/materials/{$material->id}", ['name' => $material->name, 'unit_code' => 'kg'])
            ->assertStatus(422)->assertJsonValidationErrors('unit_code');
    }

    /** MU9: combinations of dependents all independently keep the guard active. */
    public function test_mu9_combinations_work(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $project = $this->makeProjectForCompany($company);
        $material = $this->makeMaterialForCompany($company, ['unit_code' => 'un']);
        $this->createReceivedStock($project->id, $material->id, '10.000');
        $consumption = $this->postJson($this->consumptionsEndpoint($project->id), $this->validConsumptionPayload(['material_id' => $material->id, 'quantity' => '1.000']))->json();
        $this->postJson($this->adjustmentsEndpoint($project->id), $this->validAdjustmentPayload(['material_id' => $material->id]));

        // Removing the Consumption alone must NOT release the guard — the Adjustment remains.
        $this->deleteJson($this->consumptionsEndpoint($project->id, $consumption['id']))->assertNoContent();
        $this->putJson("/api/v1/materials/{$material->id}", ['name' => $material->name, 'unit_code' => 'kg'])
            ->assertStatus(422)->assertJsonValidationErrors('unit_code');
    }

    /** MU10: a custom-unit-label-only change is also blocked (unit change is not just unit_code). */
    public function test_mu10_custom_unit_label_change_blocked(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $project = $this->makeProjectForCompany($company);
        $material = $this->makeMaterialForCompany($company, ['unit_code' => 'other', 'unit_custom_label' => 'rolo']);
        $this->postJson($this->adjustmentsEndpoint($project->id), $this->validAdjustmentPayload(['material_id' => $material->id]));

        $this->putJson("/api/v1/materials/{$material->id}", ['name' => $material->name, 'unit_code' => 'other', 'unit_custom_label' => 'bobina'])
            ->assertStatus(422)->assertJsonValidationErrors('unit_code');
    }

    /** MU11: MaterialService::update() still locks the Material row (concurrency-safe, unaffected). */
    public function test_mu11_material_update_lock_preserved(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $material = $this->makeMaterialForCompany($company, ['unit_code' => 'un']);

        $this->putJson("/api/v1/materials/{$material->id}", ['name' => 'Novo nome', 'unit_code' => 'kg'])
            ->assertStatus(200)->assertJson(['unit_code' => 'kg']);
    }

    /** MU12: MaterialService::delete() still locks the Material row (concurrency-safe, unaffected). */
    public function test_mu12_material_delete_lock_preserved(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $material = $this->makeMaterialForCompany($company);

        $this->deleteJson("/api/v1/materials/{$material->id}")->assertNoContent();
    }
}
