<?php

namespace Tests\Feature\MaterialRequirements;

use App\Materials\MaterialService;
use App\Models\Material;
use App\Models\MaterialRequirement;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Tests\Feature\MaterialRequirements\Concerns\InteractsWithMaterialRequirements;
use Tests\TestCase;

/**
 * SUPPLY-API-01B §41, MG1-MG12. Proves the Material unit-change/delete
 * guards are real and live in App\Materials\MaterialService (§25 — not
 * only in Request/Controller/UI), via both the HTTP API and direct Service
 * calls.
 */
class MaterialGuardTest extends TestCase
{
    use InteractsWithMaterialRequirements, RefreshDatabase;

    private function materialEndpoint(string $materialId): string
    {
        return "/api/v1/materials/{$materialId}";
    }

    /** MG1: unit change allowed with zero Requirement. */
    public function test_mg1_unit_change_allowed_with_zero_requirement(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $material = $this->makeMaterialForCompany($company, ['unit_code' => 'kg']);

        $this->putJson($this->materialEndpoint($material->id), [
            'name' => $material->name, 'unit_code' => 'un',
        ])->assertOk()->assertJsonPath('unit_code', 'un');
    }

    /** MG2: a Requirement exists -> unit_code change is blocked. */
    public function test_mg2_unit_code_change_blocked_when_requirement_exists(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $material = $this->makeMaterialForCompany($company, ['unit_code' => 'kg']);
        $this->makeRequirementForCompany($company, ['material_id' => $material->id]);

        $this->putJson($this->materialEndpoint($material->id), [
            'name' => $material->name, 'unit_code' => 'un',
        ])->assertStatus(422)->assertJsonValidationErrors('unit_code');
    }

    /** MG3: a Requirement exists -> custom label change is blocked (other/"rolo" -> other/"bobina" is still a unit change). */
    public function test_mg3_custom_label_change_blocked_when_requirement_exists(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $material = $this->makeMaterialForCompany($company, ['unit_code' => 'other', 'unit_custom_label' => 'rolo']);
        $this->makeRequirementForCompany($company, ['material_id' => $material->id]);

        $this->putJson($this->materialEndpoint($material->id), [
            'name' => $material->name, 'unit_code' => 'other', 'unit_custom_label' => 'bobina',
        ])->assertStatus(422)->assertJsonValidationErrors('unit_code');
    }

    /** MG4: a Requirement exists -> name edit is allowed (only the unit is locked). */
    public function test_mg4_name_edit_allowed_when_requirement_exists(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $material = $this->makeMaterialForCompany($company, ['unit_code' => 'kg']);
        $this->makeRequirementForCompany($company, ['material_id' => $material->id]);

        $this->putJson($this->materialEndpoint($material->id), [
            'name' => 'Novo Nome', 'unit_code' => 'kg',
        ])->assertOk()->assertJsonPath('name', 'Novo Nome');
    }

    /** MG5: a Requirement exists -> notes edit is allowed. */
    public function test_mg5_notes_edit_allowed_when_requirement_exists(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $material = $this->makeMaterialForCompany($company, ['unit_code' => 'kg']);
        $this->makeRequirementForCompany($company, ['material_id' => $material->id]);

        $this->putJson($this->materialEndpoint($material->id), [
            'name' => $material->name, 'unit_code' => 'kg', 'notes' => 'Observação nova',
        ])->assertOk()->assertJsonPath('notes', 'Observação nova');
    }

    /** MG6: a Requirement exists -> deactivating the Material is allowed. */
    public function test_mg6_deactivate_allowed_when_requirement_exists(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $material = $this->makeMaterialForCompany($company, ['unit_code' => 'kg']);
        $this->makeRequirementForCompany($company, ['material_id' => $material->id]);

        $this->putJson($this->materialEndpoint($material->id), [
            'name' => $material->name, 'unit_code' => 'kg', 'active' => false,
        ])->assertOk()->assertJsonPath('active', false);
    }

    /** MG7: a Requirement exists -> Material DELETE is blocked. */
    public function test_mg7_delete_blocked_when_requirement_exists(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $material = $this->makeMaterialForCompany($company);
        $this->makeRequirementForCompany($company, ['material_id' => $material->id]);

        $this->deleteJson($this->materialEndpoint($material->id))
            ->assertStatus(422)
            ->assertJsonValidationErrors('material');

        $this->assertDatabaseHas('materials', ['id' => $material->id]);
    }

    /** MG8: calling MaterialService::update() directly obeys the same guard. */
    public function test_mg8_direct_service_update_obeys_guard(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $material = $this->makeMaterialForCompany($company, ['unit_code' => 'kg']);
        $this->makeRequirementForCompany($company, ['material_id' => $material->id]);

        $this->currentCompanyContext()->run($company, function () use ($material) {
            $this->expectException(ValidationException::class);
            app(MaterialService::class)->update($material, ['name' => $material->name, 'unit_code' => 'un']);
        });
    }

    /** MG9: calling MaterialService::delete() directly obeys the same guard. */
    public function test_mg9_direct_service_delete_obeys_guard(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $material = $this->makeMaterialForCompany($company);
        $this->makeRequirementForCompany($company, ['material_id' => $material->id]);

        $caught = null;
        $this->currentCompanyContext()->run($company, function () use ($material, &$caught) {
            try {
                app(MaterialService::class)->delete($material);
            } catch (ValidationException $e) {
                $caught = $e;
            }
        });

        $this->assertNotNull($caught);
        $this->assertDatabaseHas('materials', ['id' => $material->id]);
    }

    /** MG10: deleting the last Requirement releases the unit lock when no other dependents exist. */
    public function test_mg10_deleting_requirement_releases_unit_lock(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $material = $this->makeMaterialForCompany($company, ['unit_code' => 'kg']);
        $requirement = $this->makeRequirementForCompany($company, ['material_id' => $material->id]);

        $this->currentCompanyContext()->run($company, function () use ($requirement) {
            MaterialRequirement::query()->findOrFail($requirement->id)->delete();
        });

        $this->putJson($this->materialEndpoint($material->id), [
            'name' => $material->name, 'unit_code' => 'un',
        ])->assertOk()->assertJsonPath('unit_code', 'un');
    }

    /** MG11: deleting the last Requirement releases the delete guard when no other dependents exist. */
    public function test_mg11_deleting_requirement_releases_delete_guard(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $material = $this->makeMaterialForCompany($company);
        $requirement = $this->makeRequirementForCompany($company, ['material_id' => $material->id]);

        $this->currentCompanyContext()->run($company, function () use ($requirement) {
            MaterialRequirement::query()->findOrFail($requirement->id)->delete();
        });

        $this->deleteJson($this->materialEndpoint($material->id))->assertNoContent();
        $this->assertDatabaseMissing('materials', ['id' => $material->id]);
    }

    /**
     * MG12: even bypassing MaterialService entirely, the real FK
     * (restrictOnDelete) itself rejects a direct Model::delete() while a
     * Requirement exists — the guard is not the only thing holding this
     * together. The delete attempt runs inside its own `DB::transaction()`
     * (a real SAVEPOINT) so catching the QueryException here doesn't
     * poison the outer RefreshDatabase transaction the trailing assertion
     * still needs.
     */
    public function test_mg12_fk_itself_rejects_direct_material_delete(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $material = $this->makeMaterialForCompany($company);
        $this->makeRequirementForCompany($company, ['material_id' => $material->id]);

        $caught = null;
        $this->currentCompanyContext()->run($company, function () use ($material, &$caught) {
            try {
                DB::transaction(
                    fn () => Material::query()->findOrFail($material->id)->delete()
                );
            } catch (QueryException $e) {
                $caught = $e;
            }
        });

        $this->assertNotNull($caught, 'Expected the FK restrictOnDelete constraint to raise a QueryException.');
        $this->assertDatabaseHas('materials', ['id' => $material->id]);
    }
}
