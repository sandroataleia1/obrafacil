<?php

namespace Tests\Feature\MaterialRequirements;

use App\MaterialRequirements\MaterialRequirementService;
use App\Models\MaterialRequirement;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Validation\ValidationException;
use Tests\Feature\MaterialRequirements\Concerns\InteractsWithMaterialRequirements;
use Tests\TestCase;

/**
 * SUPPLY-API-01B1 §16, MRT1-MRT8. Closes the gap MT8 (SUPPLY-API-01B) did
 * not cover: a direct/internal MaterialRequirementService call must never
 * trust a Project/MaterialRequirement instance the caller already holds —
 * every public method re-resolves its relations under the active
 * CompanyScope/CurrentCompanyContext, independent of what the caller
 * passed in.
 */
class MaterialRequirementTenantInvariantTest extends TestCase
{
    use InteractsWithMaterialRequirements, RefreshDatabase;

    /** MRT1: same-tenant direct create still works normally. */
    public function test_mrt1_same_tenant_direct_create_works(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $project = $this->makeProjectForCompany($company);
        $material = $this->makeMaterialForCompany($company);

        $requirement = $this->currentCompanyContext()->run($company, fn () => app(MaterialRequirementService::class)->create($project, [
            'material_id' => $material->id,
            'required_quantity' => '1.000',
        ]));

        $this->assertNotNull($requirement->id);
        $this->assertDatabaseHas('material_requirements', ['id' => $requirement->id, 'project_id' => $project->id, 'material_id' => $material->id]);
    }

    /** MRT2: a Project belonging to a DIFFERENT tenant, passed directly, fails before any INSERT. */
    public function test_mrt2_project_cross_tenant_direct_create_fails(): void
    {
        [$companyA] = $this->makeCompanyWithMember();
        $projectA = $this->makeProjectForCompany($companyA);

        [$companyB] = $this->actingAsNewCompanyMember();
        $materialB = $this->makeMaterialForCompany($companyB);

        $caught = null;
        $this->currentCompanyContext()->run($companyB, function () use ($projectA, $materialB, &$caught) {
            try {
                app(MaterialRequirementService::class)->create($projectA, [
                    'material_id' => $materialB->id,
                    'required_quantity' => '1.000',
                ]);
            } catch (ValidationException $e) {
                $caught = $e;
            }
        });

        $this->assertNotNull($caught);
        $this->assertArrayHasKey('project_id', $caught->errors());
        $this->assertSame(0, MaterialRequirement::withoutGlobalScopes()->where('project_id', $projectA->id)->count());
    }

    /** MRT3: a Material belonging to a DIFFERENT tenant, passed directly, still fails (regression proof — same case as SUPPLY-API-01B's MT8). */
    public function test_mrt3_material_cross_tenant_direct_create_still_fails(): void
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
        $this->assertArrayHasKey('material_id', $caught->errors());
        $this->assertSame(0, MaterialRequirement::withoutGlobalScopes()->where('project_id', $projectB->id)->count());
    }

    /** MRT4: both Project AND Material belong to a different tenant — fails regardless of which is detected first, zero row persisted. */
    public function test_mrt4_project_and_material_both_foreign_fails(): void
    {
        [$companyA] = $this->makeCompanyWithMember();
        $projectA = $this->makeProjectForCompany($companyA);
        $materialA = $this->makeMaterialForCompany($companyA);

        [$companyB] = $this->actingAsNewCompanyMember();

        $caught = null;
        $this->currentCompanyContext()->run($companyB, function () use ($projectA, $materialA, &$caught) {
            try {
                app(MaterialRequirementService::class)->create($projectA, [
                    'material_id' => $materialA->id,
                    'required_quantity' => '1.000',
                ]);
            } catch (ValidationException $e) {
                $caught = $e;
            }
        });

        $this->assertNotNull($caught);
        $this->assertSame(
            0,
            MaterialRequirement::withoutGlobalScopes()->where('project_id', $projectA->id)->where('material_id', $materialA->id)->count()
        );
    }

    /** MRT5: every failure path above creates exactly zero MaterialRequirement rows overall. */
    public function test_mrt5_every_failure_creates_zero_requirements(): void
    {
        [$companyA] = $this->makeCompanyWithMember();
        $projectA = $this->makeProjectForCompany($companyA);
        $materialA = $this->makeMaterialForCompany($companyA);

        [$companyB] = $this->actingAsNewCompanyMember();
        $projectB = $this->makeProjectForCompany($companyB);
        $materialB = $this->makeMaterialForCompany($companyB);

        $this->currentCompanyContext()->run($companyB, function () use ($projectA, $projectB, $materialA, $materialB) {
            foreach ([
                [$projectA, $materialB],
                [$projectB, $materialA],
                [$projectA, $materialA],
            ] as [$project, $material]) {
                try {
                    app(MaterialRequirementService::class)->create($project, [
                        'material_id' => $material->id,
                        'required_quantity' => '1.000',
                    ]);
                } catch (ValidationException) {
                    // expected
                }
            }
        });

        $this->assertSame(0, MaterialRequirement::withoutGlobalScopes()->count());
    }

    /** MRT6: a valid create keeps requirement/project/material company_id coherent. */
    public function test_mrt6_valid_create_keeps_company_ids_coherent(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $project = $this->makeProjectForCompany($company);
        $material = $this->makeMaterialForCompany($company);

        $requirement = $this->currentCompanyContext()->run($company, fn () => app(MaterialRequirementService::class)->create($project, [
            'material_id' => $material->id,
            'required_quantity' => '1.000',
        ]));

        $this->assertSame($company->id, $requirement->company_id);
        $this->assertSame($company->id, $project->company_id);
        $this->assertSame($company->id, $material->company_id);
    }

    /**
     * MRT7: a direct update() call with a Requirement instance belonging
     * to a DIFFERENT tenant never modifies it — confirms the §12 risk
     * (Model::save() bypasses CompanyScope via newModelQuery()) is closed.
     */
    public function test_mrt7_direct_update_foreign_tenant_does_not_modify(): void
    {
        [$companyA] = $this->makeCompanyWithMember();
        $requirementA = $this->makeRequirementForCompany($companyA, ['required_quantity' => '5.000']);

        $this->actingAsNewCompanyMember();

        $caught = null;
        $this->currentCompanyContext()->run($this->activeTestCompany, function () use ($requirementA, &$caught) {
            try {
                app(MaterialRequirementService::class)->update($requirementA, [
                    'required_quantity' => '999.000',
                    'notes' => 'Tentativa hostil',
                ]);
            } catch (ModelNotFoundException $e) {
                $caught = $e;
            }
        });

        $this->assertNotNull($caught);
        $this->assertDatabaseHas('material_requirements', ['id' => $requirementA->id, 'required_quantity' => '5.000']);
    }

    /**
     * MRT8: a direct delete() call with a Requirement instance belonging
     * to a DIFFERENT tenant never removes it.
     */
    public function test_mrt8_direct_delete_foreign_tenant_does_not_remove(): void
    {
        [$companyA] = $this->makeCompanyWithMember();
        $requirementA = $this->makeRequirementForCompany($companyA);

        $this->actingAsNewCompanyMember();

        $caught = null;
        $this->currentCompanyContext()->run($this->activeTestCompany, function () use ($requirementA, &$caught) {
            try {
                app(MaterialRequirementService::class)->delete($requirementA);
            } catch (ModelNotFoundException $e) {
                $caught = $e;
            }
        });

        $this->assertNotNull($caught);
        $this->assertDatabaseHas('material_requirements', ['id' => $requirementA->id]);
    }
}
