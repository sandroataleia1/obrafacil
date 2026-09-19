<?php

namespace Tests\Feature\Stock;

use App\Stock\StockAdjustmentService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Validation\ValidationException;
use Tests\Feature\Stock\Concerns\InteractsWithStock;
use Tests\TestCase;

/**
 * SUPPLY-API-01E §75, SA1-SA16.
 */
class StockAdjustmentApiTest extends TestCase
{
    use InteractsWithStock, RefreshDatabase;

    /** SA1: create ADJUSTMENT_IN. */
    public function test_sa1_create_adjustment_in(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $project = $this->makeProjectForCompany($company);
        $material = $this->makeMaterialForCompany($company);

        $this->postJson($this->adjustmentsEndpoint($project->id), $this->validAdjustmentPayload([
            'material_id' => $material->id,
            'type' => 'ADJUSTMENT_IN',
            'quantity' => '10.000',
        ]))->assertCreated()->assertJson(['type' => 'ADJUSTMENT_IN', 'quantity' => '10.000']);
    }

    /** SA2: create ADJUSTMENT_OUT against existing stock. */
    public function test_sa2_create_adjustment_out(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $project = $this->makeProjectForCompany($company);
        $material = $this->makeMaterialForCompany($company);
        $this->postJson($this->adjustmentsEndpoint($project->id), $this->validAdjustmentPayload([
            'material_id' => $material->id,
            'type' => 'ADJUSTMENT_IN',
            'quantity' => '10.000',
        ]));

        $this->postJson($this->adjustmentsEndpoint($project->id), $this->validAdjustmentPayload([
            'material_id' => $material->id,
            'type' => 'ADJUSTMENT_OUT',
            'quantity' => '4.000',
        ]))->assertCreated()->assertJson(['type' => 'ADJUSTMENT_OUT', 'quantity' => '4.000']);
    }

    /** SA3: quantity must be > 0. */
    public function test_sa3_quantity_must_be_positive(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $project = $this->makeProjectForCompany($company);
        $material = $this->makeMaterialForCompany($company);

        $this->postJson($this->adjustmentsEndpoint($project->id), $this->validAdjustmentPayload([
            'material_id' => $material->id,
            'quantity' => '0',
        ]))->assertStatus(422)->assertJsonValidationErrors('quantity');
    }

    /** SA4: occurred_at in the future is rejected. */
    public function test_sa4_future_occurred_at_rejected(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $project = $this->makeProjectForCompany($company);
        $material = $this->makeMaterialForCompany($company);

        $this->postJson($this->adjustmentsEndpoint($project->id), $this->validAdjustmentPayload([
            'material_id' => $material->id,
            'occurred_at' => now()->addDay()->toDateString(),
        ]))->assertStatus(422)->assertJsonValidationErrors('occurred_at');
    }

    /** SA5: reason is trimmed and empty becomes null. */
    public function test_sa5_reason_trim_null(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $project = $this->makeProjectForCompany($company);
        $material = $this->makeMaterialForCompany($company);

        $response = $this->postJson($this->adjustmentsEndpoint($project->id), $this->validAdjustmentPayload([
            'material_id' => $material->id,
            'reason' => '   ',
        ]));

        $response->assertCreated()->assertJson(['reason' => null]);
    }

    /** SA6: an invalid type is rejected. */
    public function test_sa6_invalid_type_rejected(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $project = $this->makeProjectForCompany($company);
        $material = $this->makeMaterialForCompany($company);

        $this->postJson($this->adjustmentsEndpoint($project->id), $this->validAdjustmentPayload([
            'material_id' => $material->id,
            'type' => 'BOGUS',
        ]))->assertStatus(422)->assertJsonValidationErrors('type');
    }

    /** SA7: ADJUSTMENT_IN can create an opening balance with no prior fact. */
    public function test_sa7_adjustment_in_creates_opening_balance(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $project = $this->makeProjectForCompany($company);
        $material = $this->makeMaterialForCompany($company);

        $this->postJson($this->adjustmentsEndpoint($project->id), $this->validAdjustmentPayload([
            'material_id' => $material->id,
            'type' => 'ADJUSTMENT_IN',
            'quantity' => '50.000',
        ]))->assertCreated();

        $this->getJson($this->stockDetailEndpoint($project->id, $material->id))
            ->assertJson(['stock_quantity' => '50.000']);
    }

    /** SA8: ADJUSTMENT_OUT cannot make the timeline negative. */
    public function test_sa8_adjustment_out_cannot_go_negative(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $project = $this->makeProjectForCompany($company);
        $material = $this->makeMaterialForCompany($company);

        $this->postJson($this->adjustmentsEndpoint($project->id), $this->validAdjustmentPayload([
            'material_id' => $material->id,
            'type' => 'ADJUSTMENT_OUT',
            'quantity' => '1.000',
        ]))->assertStatus(422)->assertJsonValidationErrors('quantity');
    }

    /** SA9: a retroactive OUT cannot rely on a later IN. */
    public function test_sa9_retroactive_out_cannot_rely_on_later_in(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $project = $this->makeProjectForCompany($company);
        $material = $this->makeMaterialForCompany($company);

        $this->postJson($this->adjustmentsEndpoint($project->id), $this->validAdjustmentPayload([
            'material_id' => $material->id,
            'type' => 'ADJUSTMENT_IN',
            'quantity' => '10.000',
            'occurred_at' => now()->toDateString(),
        ]))->assertCreated();

        $this->postJson($this->adjustmentsEndpoint($project->id), $this->validAdjustmentPayload([
            'material_id' => $material->id,
            'type' => 'ADJUSTMENT_OUT',
            'quantity' => '5.000',
            'occurred_at' => now()->subDay()->toDateString(),
        ]))->assertStatus(422)->assertJsonValidationErrors('quantity');
    }

    /** SA10: a same-day IN can cover a same-day OUT. */
    public function test_sa10_same_day_in_covers_same_day_out(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $project = $this->makeProjectForCompany($company);
        $material = $this->makeMaterialForCompany($company);
        $today = now()->toDateString();

        $this->postJson($this->adjustmentsEndpoint($project->id), $this->validAdjustmentPayload([
            'material_id' => $material->id,
            'type' => 'ADJUSTMENT_IN',
            'quantity' => '10.000',
            'occurred_at' => $today,
        ]))->assertCreated();

        $this->postJson($this->adjustmentsEndpoint($project->id), $this->validAdjustmentPayload([
            'material_id' => $material->id,
            'type' => 'ADJUSTMENT_OUT',
            'quantity' => '10.000',
            'occurred_at' => $today,
        ]))->assertCreated();
    }

    /** SA11: an inactive Material can still receive an Adjustment. */
    public function test_sa11_inactive_material_allowed(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $project = $this->makeProjectForCompany($company);
        $material = $this->makeMaterialForCompany($company);
        $material->update(['active' => false]);

        $this->postJson($this->adjustmentsEndpoint($project->id), $this->validAdjustmentPayload([
            'material_id' => $material->id,
        ]))->assertCreated();
    }

    /** SA12: a Material from another tenant is rejected. */
    public function test_sa12_cross_tenant_material_rejected(): void
    {
        [$otherCompany] = $this->makeCompanyWithMember();
        $foreignMaterial = $this->makeMaterialForCompany($otherCompany);

        [$company] = $this->actingAsNewCompanyMember();
        $project = $this->makeProjectForCompany($company);

        $this->postJson($this->adjustmentsEndpoint($project->id), $this->validAdjustmentPayload([
            'material_id' => $foreignMaterial->id,
        ]))->assertStatus(422)->assertJsonValidationErrors('material_id');
    }

    /** SA13: a Project from another tenant is a 404. */
    public function test_sa13_cross_tenant_project_404(): void
    {
        [$otherCompany] = $this->makeCompanyWithMember();
        $foreignProject = $this->makeProjectForCompany($otherCompany);

        [$company] = $this->actingAsNewCompanyMember();
        $material = $this->makeMaterialForCompany($company);

        $this->postJson($this->adjustmentsEndpoint($foreignProject->id), $this->validAdjustmentPayload([
            'material_id' => $material->id,
        ]))->assertStatus(404);
    }

    /** SA14: no PUT/PATCH route exists for a StockAdjustment. */
    public function test_sa14_no_update_route(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $project = $this->makeProjectForCompany($company);
        $material = $this->makeMaterialForCompany($company);
        $adjustment = $this->postJson($this->adjustmentsEndpoint($project->id), $this->validAdjustmentPayload([
            'material_id' => $material->id,
        ]))->json();

        $this->putJson($this->adjustmentsEndpoint($project->id).'/'.$adjustment['id'], [])->assertStatus(404);
    }

    /** SA15: no DELETE route exists for a StockAdjustment. */
    public function test_sa15_no_delete_route(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $project = $this->makeProjectForCompany($company);
        $material = $this->makeMaterialForCompany($company);
        $adjustment = $this->postJson($this->adjustmentsEndpoint($project->id), $this->validAdjustmentPayload([
            'material_id' => $material->id,
        ]))->json();

        $this->deleteJson($this->adjustmentsEndpoint($project->id).'/'.$adjustment['id'])->assertStatus(404);
    }

    /** SA16: direct Service call re-resolves tenant, rejecting a foreign Project. */
    public function test_sa16_direct_service_tenant_defense(): void
    {
        [$companyA] = $this->makeCompanyWithMember();
        $projectA = $this->makeProjectForCompany($companyA);
        $materialA = $this->makeMaterialForCompany($companyA);

        [$companyB] = $this->makeCompanyWithMember();

        $this->currentCompanyContext()->run($companyB, function () use ($projectA, $materialA) {
            $this->expectException(ValidationException::class);
            app(StockAdjustmentService::class)->create($projectA, [
                'material_id' => $materialA->id,
                'type' => 'ADJUSTMENT_IN',
                'quantity' => '1.000',
                'occurred_at' => now()->toDateString(),
            ]);
        });
    }
}
