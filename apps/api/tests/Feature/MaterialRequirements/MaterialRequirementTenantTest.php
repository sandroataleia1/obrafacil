<?php

namespace Tests\Feature\MaterialRequirements;

use App\MaterialRequirements\MaterialRequirementService;
use App\Models\Material;
use App\Models\MaterialRequirement;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Tests\Feature\MaterialRequirements\Concerns\InteractsWithMaterialRequirements;
use Tests\TestCase;

/**
 * SUPPLY-API-01B §43, MT1-MT8.
 */
class MaterialRequirementTenantTest extends TestCase
{
    use InteractsWithMaterialRequirements, RefreshDatabase;

    private function endpoint(string $projectId, ?string $requirementId = null): string
    {
        $base = "/api/v1/projects/{$projectId}/material-requirements";

        return $requirementId === null ? $base : "{$base}/{$requirementId}";
    }

    /** MT1: the index only ever shows requirements of the currently active tenant. */
    public function test_mt1_index_only_shows_active_tenant(): void
    {
        [$companyA] = $this->makeCompanyWithMember();
        $projectA = $this->makeProjectForCompany($companyA);
        $this->makeRequirementForCompany($companyA, ['project_id' => $projectA->id]);

        [$companyB] = $this->actingAsNewCompanyMember();
        $projectB = $this->makeProjectForCompany($companyB);
        $requirementB = $this->makeRequirementForCompany($companyB, ['project_id' => $projectB->id]);

        $response = $this->getJson($this->endpoint($projectB->id))->assertOk();
        $ids = collect($response->json('data'))->pluck('id');

        $this->assertTrue($ids->contains($requirementB->id));
        $this->assertCount(1, $ids);
    }

    /** MT2: a Project belonging to Company A is invisible (404) from Company B. */
    public function test_mt2_project_a_invisible_in_company_b(): void
    {
        [$companyA] = $this->makeCompanyWithMember();
        $projectA = $this->makeProjectForCompany($companyA);

        $this->actingAsNewCompanyMember();

        $this->getJson($this->endpoint($projectA->id))->assertStatus(404);
    }

    /** MT3: a Material belonging to Company A is invisible/rejected (422) from Company B. */
    public function test_mt3_material_a_invisible_in_company_b(): void
    {
        [$companyA] = $this->makeCompanyWithMember();
        $materialA = $this->makeMaterialForCompany($companyA);

        [$companyB] = $this->actingAsNewCompanyMember();
        $projectB = $this->makeProjectForCompany($companyB);

        $this->postJson($this->endpoint($projectB->id), $this->validRequirementPayload(['material_id' => $materialA->id]))
            ->assertStatus(422)
            ->assertJsonValidationErrors('material_id');
    }

    /** MT4: a Requirement belonging to Company A is invisible (404) from Company B, even via its own Project id. */
    public function test_mt4_requirement_a_invisible_in_company_b(): void
    {
        [$companyA] = $this->makeCompanyWithMember();
        $projectA = $this->makeProjectForCompany($companyA);
        $requirementA = $this->makeRequirementForCompany($companyA, ['project_id' => $projectA->id]);

        $this->actingAsNewCompanyMember();

        $this->getJson($this->endpoint($projectA->id, $requirementA->id))->assertStatus(404);
    }

    /** MT5: a hostile company_id in the create payload is prohibited (422), never switches tenant. */
    public function test_mt5_hostile_company_id_is_422(): void
    {
        [$companyA] = $this->makeCompanyWithMember();

        [$companyB] = $this->actingAsNewCompanyMember();
        $projectB = $this->makeProjectForCompany($companyB);
        $materialB = $this->makeMaterialForCompany($companyB);

        $this->postJson($this->endpoint($projectB->id), $this->validRequirementPayload([
            'material_id' => $materialB->id,
            'company_id' => $companyA->id,
        ]))->assertStatus(422)->assertJsonValidationErrors('company_id');
    }

    /** MT6: a Material id that happens to exist for another tenant never bypasses CompanyScope, even when reused verbatim. */
    public function test_mt6_material_same_uuid_never_bypasses_scope(): void
    {
        [$companyA] = $this->makeCompanyWithMember();
        $materialA = $this->makeMaterialForCompany($companyA, ['name' => 'Cimento A']);

        [$companyB] = $this->actingAsNewCompanyMember();
        $projectB = $this->makeProjectForCompany($companyB);

        // Re-using Company A's real Material id against Company B's active
        // context must never resolve to Company A's row.
        $response = $this->postJson($this->endpoint($projectB->id), $this->validRequirementPayload(['material_id' => $materialA->id]));
        $response->assertStatus(422)->assertJsonValidationErrors('material_id');

        $this->currentCompanyContext()->run($companyB, function () use ($materialA) {
            $this->assertNull(Material::query()->find($materialA->id));
        });
    }

    /** MT7: the nested route never reveals whether a foreign-tenant id exists at all — cross-tenant and random both 404 identically. */
    public function test_mt7_nested_route_cross_tenant_and_random_are_identical_404(): void
    {
        [$companyA] = $this->makeCompanyWithMember();
        $projectA = $this->makeProjectForCompany($companyA);
        $requirementA = $this->makeRequirementForCompany($companyA, ['project_id' => $projectA->id]);

        $this->actingAsNewCompanyMember();

        $crossTenant = $this->getJson($this->endpoint($projectA->id, $requirementA->id));
        $random = $this->getJson($this->endpoint((string) Str::uuid(), (string) Str::uuid()));

        $this->assertSame(404, $crossTenant->getStatusCode());
        $this->assertSame(404, $random->getStatusCode());
    }

    /** MT8: calling MaterialRequirementService::create() directly never lets a Project/Material pair from different tenants slip through. */
    public function test_mt8_direct_service_never_allows_cross_tenant_relation(): void
    {
        [$companyA] = $this->makeCompanyWithMember();
        $materialA = $this->makeMaterialForCompany($companyA);

        [$companyB] = $this->actingAsNewCompanyMember();
        $projectB = $this->makeProjectForCompany($companyB);

        $caught = null;
        $this->currentCompanyContext()->run($companyB, function () use ($projectB, $materialA, &$caught) {
            try {
                app(MaterialRequirementService::class)->create($projectB, [
                    'material_id' => $materialA->id,
                    'required_quantity' => '1.000',
                ]);
            } catch (ValidationException $e) {
                $caught = $e;
            }
        });

        $this->assertNotNull($caught);
        $this->assertSame(0, MaterialRequirement::withoutGlobalScopes()->where('project_id', $projectB->id)->count());
    }
}
