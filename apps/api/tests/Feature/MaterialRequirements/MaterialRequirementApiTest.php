<?php

namespace Tests\Feature\MaterialRequirements;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\Feature\MaterialRequirements\Concerns\InteractsWithMaterialRequirements;
use Tests\TestCase;

/**
 * SUPPLY-API-01B §40, MR1-MR18.
 */
class MaterialRequirementApiTest extends TestCase
{
    use InteractsWithMaterialRequirements, RefreshDatabase;

    private function endpoint(string $projectId, ?string $requirementId = null): string
    {
        $base = "/api/v1/projects/{$projectId}/material-requirements";

        return $requirementId === null ? $base : "{$base}/{$requirementId}";
    }

    /** MR1: unauthenticated -> 401. */
    public function test_mr1_unauthenticated_is_rejected(): void
    {
        $projectId = (string) Str::uuid();
        $this->getJson($this->endpoint($projectId))->assertStatus(401);
        $this->postJson($this->endpoint($projectId), [])->assertStatus(401);
    }

    /** MR2: authenticated with zero memberships -> fail-closed 403. */
    public function test_mr2_no_active_company_fails_closed(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->getJson($this->endpoint((string) Str::uuid()))->assertStatus(403);
    }

    /** MR3: create valid. */
    public function test_mr3_create_valid(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $project = $this->makeProjectForCompany($company);
        $material = $this->makeMaterialForCompany($company);

        $response = $this->postJson($this->endpoint($project->id), $this->validRequirementPayload([
            'material_id' => $material->id,
        ]));

        $response->assertCreated()
            ->assertJsonPath('project_id', $project->id)
            ->assertJsonPath('material.id', $material->id)
            ->assertJsonPath('required_quantity', '10.000');
    }

    /** MR4: company_id is server-side, never exposed. */
    public function test_mr4_company_id_server_side_never_exposed(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $project = $this->makeProjectForCompany($company);
        $material = $this->makeMaterialForCompany($company);

        $response = $this->postJson($this->endpoint($project->id), $this->validRequirementPayload([
            'material_id' => $material->id,
        ]));

        $id = $response->assertJsonMissingPath('company_id')->json('id');
        $this->assertDatabaseHas('material_requirements', ['id' => $id, 'company_id' => $company->id]);
    }

    /** MR5: the Project relation must be valid (belongs to the current tenant) — proven via a cross-tenant Project id. */
    public function test_mr5_project_relation_must_be_valid(): void
    {
        [$companyA] = $this->makeCompanyWithMember();
        $projectA = $this->makeProjectForCompany($companyA);

        [$companyB] = $this->actingAsNewCompanyMember();
        $material = $this->makeMaterialForCompany($companyB);

        $this->postJson($this->endpoint($projectA->id), $this->validRequirementPayload([
            'material_id' => $material->id,
        ]))->assertStatus(404);
    }

    /** MR6: the Material relation must be valid — a random/invalid id is 422. */
    public function test_mr6_material_relation_must_be_valid(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $project = $this->makeProjectForCompany($company);

        $this->postJson($this->endpoint($project->id), $this->validRequirementPayload([
            'material_id' => (string) Str::uuid(),
        ]))->assertStatus(422)->assertJsonValidationErrors('material_id');
    }

    /** MR7: an inactive Material is rejected on CREATE. */
    public function test_mr7_inactive_material_rejected_on_create(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $project = $this->makeProjectForCompany($company);
        $material = $this->makeMaterialForCompany($company, ['active' => false]);

        $this->postJson($this->endpoint($project->id), $this->validRequirementPayload([
            'material_id' => $material->id,
        ]))->assertStatus(422)->assertJsonValidationErrors('material_id');
    }

    /** MR8: required_quantity must be > 0. */
    public function test_mr8_required_quantity_must_be_positive(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $project = $this->makeProjectForCompany($company);
        $material = $this->makeMaterialForCompany($company);

        $this->postJson($this->endpoint($project->id), $this->validRequirementPayload([
            'material_id' => $material->id, 'required_quantity' => '0',
        ]))->assertStatus(422)->assertJsonValidationErrors('required_quantity');

        $this->postJson($this->endpoint($project->id), $this->validRequirementPayload([
            'material_id' => $material->id, 'required_quantity' => '-5',
        ]))->assertStatus(422)->assertJsonValidationErrors('required_quantity');
    }

    /** MR9: quantity scale is 3, the Resource always returns a canonical string. */
    public function test_mr9_quantity_scale_and_resource_string(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $project = $this->makeProjectForCompany($company);
        $material = $this->makeMaterialForCompany($company);

        $response = $this->postJson($this->endpoint($project->id), $this->validRequirementPayload([
            'material_id' => $material->id, 'required_quantity' => '1.2',
        ]));

        $response->assertCreated()->assertJsonPath('required_quantity', '1.200');
        $this->assertIsString($response->json('required_quantity'));

        // Too many decimal places is rejected by the format regex.
        $this->postJson($this->endpoint($project->id), $this->validRequirementPayload([
            'material_id' => $this->makeMaterialForCompany($company)->id, 'required_quantity' => '1.2345',
        ]))->assertStatus(422)->assertJsonValidationErrors('required_quantity');
    }

    /** MR10: duplicate Project+Material -> 422 on material_id (FormRequest pre-check). */
    public function test_mr10_duplicate_project_material_is_422(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $project = $this->makeProjectForCompany($company);
        $material = $this->makeMaterialForCompany($company);

        $this->postJson($this->endpoint($project->id), $this->validRequirementPayload(['material_id' => $material->id]))
            ->assertCreated();

        $this->postJson($this->endpoint($project->id), $this->validRequirementPayload(['material_id' => $material->id]))
            ->assertStatus(422)
            ->assertJsonValidationErrors('material_id');
    }

    /**
     * MR11: a genuine DB-level race (the FormRequest's own pre-check finds
     * no match, but a colliding row is inserted at the exact moment that
     * SELECT completes) still maps to a clean 422 on material_id, never a
     * raw 500 — the real partial unique index is the final authority.
     */
    public function test_mr11_db_level_race_maps_to_material_id(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $project = $this->makeProjectForCompany($company);
        $material = $this->makeMaterialForCompany($company);

        $injected = false;
        DB::listen(function ($query) use (&$injected, $company, $project, $material) {
            if ($injected) {
                return;
            }
            if (str_starts_with(trim($query->sql), 'select') && str_contains($query->sql, '"material_requirements"') && str_contains($query->sql, '"project_id"')) {
                $injected = true;
                DB::connection()->insert(
                    'insert into "material_requirements" ("id", "company_id", "project_id", "material_id", "required_quantity", "created_at", "updated_at") '.
                    'values (?, ?, ?, ?, ?, now(), now())',
                    [(string) Str::uuid(), $company->id, $project->id, $material->id, '5.000']
                );
            }
        });

        $response = $this->postJson($this->endpoint($project->id), $this->validRequirementPayload(['material_id' => $material->id]));

        $response->assertStatus(422)->assertJsonValidationErrors('material_id');
        $this->assertSame(
            1,
            DB::table('material_requirements')->where('project_id', $project->id)->where('material_id', $material->id)->count()
        );
    }

    /** MR12: cross-tenant Project route parameter -> 404. */
    public function test_mr12_cross_tenant_project_route_is_404(): void
    {
        [$companyA] = $this->makeCompanyWithMember();
        $projectA = $this->makeProjectForCompany($companyA);

        [$companyB] = $this->actingAsNewCompanyMember();
        $material = $this->makeMaterialForCompany($companyB);

        $this->getJson($this->endpoint($projectA->id))->assertStatus(404);
        $this->postJson($this->endpoint($projectA->id), $this->validRequirementPayload(['material_id' => $material->id]))->assertStatus(404);
    }

    /** MR13: a Material belonging to a different tenant is rejected (422), not silently readable. */
    public function test_mr13_cross_tenant_material_rejected(): void
    {
        [$companyA] = $this->makeCompanyWithMember();
        $materialA = $this->makeMaterialForCompany($companyA);

        [$companyB] = $this->actingAsNewCompanyMember();
        $projectB = $this->makeProjectForCompany($companyB);

        $this->postJson($this->endpoint($projectB->id), $this->validRequirementPayload(['material_id' => $materialA->id]))
            ->assertStatus(422)
            ->assertJsonValidationErrors('material_id');
    }

    /** MR14: GET list and GET detail. */
    public function test_mr14_get_list_and_detail(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $project = $this->makeProjectForCompany($company);
        $materialA = $this->makeMaterialForCompany($company, ['name' => 'Cimento']);
        $materialB = $this->makeMaterialForCompany($company, ['name' => 'Areia']);
        $requirementA = $this->makeRequirementForCompany($company, ['project_id' => $project->id, 'material_id' => $materialA->id]);
        $this->makeRequirementForCompany($company, ['project_id' => $project->id, 'material_id' => $materialB->id]);

        $list = $this->getJson($this->endpoint($project->id))->assertOk();
        $names = collect($list->json('data'))->pluck('material.name')->all();
        $this->assertSame(['Areia', 'Cimento'], $names);

        $this->getJson($this->endpoint($project->id, $requirementA->id))
            ->assertOk()
            ->assertJsonPath('id', $requirementA->id)
            ->assertJsonPath('material.name', 'Cimento');
    }

    /** MR15: update quantity/notes. */
    public function test_mr15_update_quantity_and_notes(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $project = $this->makeProjectForCompany($company);
        $requirement = $this->makeRequirementForCompany($company, ['project_id' => $project->id]);

        $response = $this->putJson($this->endpoint($project->id, $requirement->id), [
            'required_quantity' => '25.500',
            'notes' => 'Reservar para a fundação.',
        ]);

        $response->assertOk()
            ->assertJsonPath('required_quantity', '25.500')
            ->assertJsonPath('notes', 'Reservar para a fundação.');
    }

    /** MR16: material_id/project_id are immutable on update — even if sent, they are prohibited. */
    public function test_mr16_material_and_project_id_immutable_on_update(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $project = $this->makeProjectForCompany($company);
        $otherProject = $this->makeProjectForCompany($company);
        $requirement = $this->makeRequirementForCompany($company, ['project_id' => $project->id]);
        $otherMaterial = $this->makeMaterialForCompany($company);

        $this->putJson($this->endpoint($project->id, $requirement->id), [
            'required_quantity' => '1.000',
            'material_id' => $otherMaterial->id,
            'project_id' => $otherProject->id,
        ])->assertStatus(422)->assertJsonValidationErrors(['material_id', 'project_id']);
    }

    /** MR17: delete a Requirement. */
    public function test_mr17_delete_requirement(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $project = $this->makeProjectForCompany($company);
        $requirement = $this->makeRequirementForCompany($company, ['project_id' => $project->id]);

        $this->deleteJson($this->endpoint($project->id, $requirement->id))->assertNoContent();

        $this->assertDatabaseMissing('material_requirements', ['id' => $requirement->id]);
    }

    /** MR18: a Requirement id that belongs to a DIFFERENT project (same tenant) is 404 on the nested route. */
    public function test_mr18_wrong_project_nested_requirement_is_404(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $projectA = $this->makeProjectForCompany($company);
        $projectB = $this->makeProjectForCompany($company);
        $requirement = $this->makeRequirementForCompany($company, ['project_id' => $projectA->id]);

        $this->getJson($this->endpoint($projectB->id, $requirement->id))->assertStatus(404);
        $this->putJson($this->endpoint($projectB->id, $requirement->id), $this->validRequirementPayload())->assertStatus(404);
        $this->deleteJson($this->endpoint($projectB->id, $requirement->id))->assertStatus(404);

        $this->assertDatabaseHas('material_requirements', ['id' => $requirement->id, 'project_id' => $projectA->id]);
    }
}
