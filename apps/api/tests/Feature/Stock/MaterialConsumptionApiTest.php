<?php

namespace Tests\Feature\Stock;

use App\Models\User;
use App\Stock\MaterialConsumptionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Laravel\Sanctum\Sanctum;
use Tests\Feature\Stock\Concerns\InteractsWithStock;
use Tests\TestCase;

/**
 * SUPPLY-API-01E §74, MC1-MC18.
 */
class MaterialConsumptionApiTest extends TestCase
{
    use InteractsWithStock, RefreshDatabase;

    /** MC1: unauthenticated -> 401. */
    public function test_mc1_unauthenticated_is_rejected(): void
    {
        $this->postJson($this->consumptionsEndpoint('any-id'), [])->assertStatus(401);
    }

    /** MC2: authenticated with zero memberships -> fail-closed 403. */
    public function test_mc2_no_active_company_fails_closed(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->postJson($this->consumptionsEndpoint((string) Str::uuid()), [])->assertStatus(403);
    }

    /** MC3: create a valid Consumption against existing stock. */
    public function test_mc3_create_valid(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $project = $this->makeProjectForCompany($company);
        $material = $this->makeMaterialForCompany($company);
        $this->createReceivedStock($project->id, $material->id, '10.000');

        $response = $this->postJson($this->consumptionsEndpoint($project->id), $this->validConsumptionPayload([
            'material_id' => $material->id,
            'quantity' => '4.000',
        ]));

        $response->assertCreated();
    }

    /** MC4: quantity comes back as a scale-3 string. */
    public function test_mc4_quantity_string_scale_3(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $project = $this->makeProjectForCompany($company);
        $material = $this->makeMaterialForCompany($company);
        $this->createReceivedStock($project->id, $material->id, '10.000');

        $response = $this->postJson($this->consumptionsEndpoint($project->id), $this->validConsumptionPayload([
            'material_id' => $material->id,
            'quantity' => '4',
        ]));

        $response->assertJson(['quantity' => '4.000']);
    }

    /** MC5: consumed_at in the future is rejected. */
    public function test_mc5_future_consumed_at_rejected(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $project = $this->makeProjectForCompany($company);
        $material = $this->makeMaterialForCompany($company);

        $this->postJson($this->consumptionsEndpoint($project->id), $this->validConsumptionPayload([
            'material_id' => $material->id,
            'quantity' => '1.000',
            'consumed_at' => now()->addDay()->toDateString(),
        ]))->assertStatus(422)->assertJsonValidationErrors('consumed_at');
    }

    /** MC6: zero/negative quantity is rejected. */
    public function test_mc6_zero_or_negative_quantity_rejected(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $project = $this->makeProjectForCompany($company);
        $material = $this->makeMaterialForCompany($company);

        $this->postJson($this->consumptionsEndpoint($project->id), $this->validConsumptionPayload([
            'material_id' => $material->id,
            'quantity' => '0',
        ]))->assertStatus(422)->assertJsonValidationErrors('quantity');
    }

    /** MC7: no stock at all -> 422. */
    public function test_mc7_no_stock_rejected(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $project = $this->makeProjectForCompany($company);
        $material = $this->makeMaterialForCompany($company);

        $this->postJson($this->consumptionsEndpoint($project->id), $this->validConsumptionPayload([
            'material_id' => $material->id,
            'quantity' => '1.000',
        ]))->assertStatus(422)->assertJsonValidationErrors('quantity');
    }

    /** MC8: same-day Receipt supports a same-day Consumption. */
    public function test_mc8_same_day_receipt_supports_consumption(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $project = $this->makeProjectForCompany($company);
        $material = $this->makeMaterialForCompany($company);
        $today = now()->toDateString();
        $this->createReceivedStock($project->id, $material->id, '5.000', $today);

        $this->postJson($this->consumptionsEndpoint($project->id), $this->validConsumptionPayload([
            'material_id' => $material->id,
            'quantity' => '5.000',
            'consumed_at' => $today,
        ]))->assertCreated();
    }

    /** MC9: a Receipt dated AFTER the Consumption cannot retroactively support it. */
    public function test_mc9_future_receipt_cannot_support_earlier_consumption(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $project = $this->makeProjectForCompany($company);
        $material = $this->makeMaterialForCompany($company);
        $this->createReceivedStock($project->id, $material->id, '5.000', now()->toDateString());

        $this->postJson($this->consumptionsEndpoint($project->id), $this->validConsumptionPayload([
            'material_id' => $material->id,
            'quantity' => '1.000',
            'consumed_at' => now()->subDay()->toDateString(),
        ]))->assertStatus(422)->assertJsonValidationErrors('quantity');
    }

    /** MC10: an ADJUSTMENT_IN can support a Consumption without any Receipt. */
    public function test_mc10_adjustment_in_supports_consumption(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $project = $this->makeProjectForCompany($company);
        $material = $this->makeMaterialForCompany($company);

        $this->postJson($this->adjustmentsEndpoint($project->id), $this->validAdjustmentPayload([
            'material_id' => $material->id,
            'type' => 'ADJUSTMENT_IN',
            'quantity' => '8.000',
        ]))->assertCreated();

        $this->postJson($this->consumptionsEndpoint($project->id), $this->validConsumptionPayload([
            'material_id' => $material->id,
            'quantity' => '8.000',
        ]))->assertCreated();
    }

    /** MC11: an ADJUSTMENT_OUT reduces what's available for Consumption. */
    public function test_mc11_adjustment_out_affects_availability(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $project = $this->makeProjectForCompany($company);
        $material = $this->makeMaterialForCompany($company);
        $this->createReceivedStock($project->id, $material->id, '10.000');

        $this->postJson($this->adjustmentsEndpoint($project->id), $this->validAdjustmentPayload([
            'material_id' => $material->id,
            'type' => 'ADJUSTMENT_OUT',
            'quantity' => '6.000',
        ]))->assertCreated();

        $this->postJson($this->consumptionsEndpoint($project->id), $this->validConsumptionPayload([
            'material_id' => $material->id,
            'quantity' => '5.000',
        ]))->assertStatus(422)->assertJsonValidationErrors('quantity');
    }

    /** MC12: an inactive Material can still be consumed. */
    public function test_mc12_inactive_material_allowed(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $project = $this->makeProjectForCompany($company);
        $material = $this->makeMaterialForCompany($company);
        $this->createReceivedStock($project->id, $material->id, '10.000');
        $material->update(['active' => false]);

        $this->postJson($this->consumptionsEndpoint($project->id), $this->validConsumptionPayload([
            'material_id' => $material->id,
            'quantity' => '4.000',
        ]))->assertCreated();
    }

    /** MC13: a Material from another tenant is rejected. */
    public function test_mc13_cross_tenant_material_rejected(): void
    {
        [$otherCompany] = $this->makeCompanyWithMember();
        $foreignMaterial = $this->makeMaterialForCompany($otherCompany);

        [$company] = $this->actingAsNewCompanyMember();
        $project = $this->makeProjectForCompany($company);

        $this->postJson($this->consumptionsEndpoint($project->id), $this->validConsumptionPayload([
            'material_id' => $foreignMaterial->id,
            'quantity' => '1.000',
        ]))->assertStatus(422)->assertJsonValidationErrors('material_id');
    }

    /** MC14: a Project from another tenant is a 404. */
    public function test_mc14_cross_tenant_project_404(): void
    {
        [$otherCompany] = $this->makeCompanyWithMember();
        $foreignProject = $this->makeProjectForCompany($otherCompany);

        [$company] = $this->actingAsNewCompanyMember();
        $material = $this->makeMaterialForCompany($company);

        $this->postJson($this->consumptionsEndpoint($foreignProject->id), $this->validConsumptionPayload([
            'material_id' => $material->id,
            'quantity' => '1.000',
        ]))->assertStatus(404);
    }

    /** MC15: delete a valid Consumption -> 204. */
    public function test_mc15_delete_valid(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $project = $this->makeProjectForCompany($company);
        $material = $this->makeMaterialForCompany($company);
        $this->createReceivedStock($project->id, $material->id, '10.000');
        $consumption = $this->postJson($this->consumptionsEndpoint($project->id), $this->validConsumptionPayload([
            'material_id' => $material->id,
            'quantity' => '4.000',
        ]))->json();

        $this->deleteJson($this->consumptionsEndpoint($project->id, $consumption['id']))->assertNoContent();
    }

    /** MC16: deleting a Consumption raises the balance back up. */
    public function test_mc16_deleting_consumption_raises_balance(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $project = $this->makeProjectForCompany($company);
        $material = $this->makeMaterialForCompany($company);
        $this->createReceivedStock($project->id, $material->id, '10.000');
        $consumption = $this->postJson($this->consumptionsEndpoint($project->id), $this->validConsumptionPayload([
            'material_id' => $material->id,
            'quantity' => '10.000',
        ]))->json();

        $this->deleteJson($this->consumptionsEndpoint($project->id, $consumption['id']))->assertNoContent();

        $this->postJson($this->consumptionsEndpoint($project->id), $this->validConsumptionPayload([
            'material_id' => $material->id,
            'quantity' => '10.000',
        ]))->assertCreated();
    }

    /** MC17: deleting via the wrong Project's nested route is a 404. */
    public function test_mc17_wrong_project_nested_delete_404(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $project = $this->makeProjectForCompany($company);
        $otherProject = $this->makeProjectForCompany($company);
        $material = $this->makeMaterialForCompany($company);
        $this->createReceivedStock($project->id, $material->id, '10.000');
        $consumption = $this->postJson($this->consumptionsEndpoint($project->id), $this->validConsumptionPayload([
            'material_id' => $material->id,
            'quantity' => '4.000',
        ]))->json();

        $this->deleteJson($this->consumptionsEndpoint($otherProject->id, $consumption['id']))->assertStatus(404);
    }

    /** MC18: direct Service call re-resolves tenant, rejecting a foreign Project. */
    public function test_mc18_direct_service_tenant_defense(): void
    {
        [$companyA] = $this->makeCompanyWithMember();
        $projectA = $this->makeProjectForCompany($companyA);
        $materialA = $this->makeMaterialForCompany($companyA);

        [$companyB] = $this->makeCompanyWithMember();

        $this->currentCompanyContext()->run($companyB, function () use ($projectA, $materialA) {
            $this->expectException(ValidationException::class);
            app(MaterialConsumptionService::class)->create($projectA, [
                'material_id' => $materialA->id,
                'quantity' => '1.000',
                'consumed_at' => now()->toDateString(),
            ]);
        });
    }
}
