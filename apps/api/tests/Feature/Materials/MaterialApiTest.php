<?php

namespace Tests\Feature\Materials;

use App\Models\Material;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Feature\Materials\Concerns\InteractsWithMaterials;
use Tests\TestCase;

/**
 * SUPPLY-API-01A §39, M1-M16.
 */
class MaterialApiTest extends TestCase
{
    use InteractsWithMaterials, RefreshDatabase;

    private const string ENDPOINT = '/api/v1/materials';

    /** M1: unauthenticated -> 401. */
    public function test_m1_unauthenticated_is_rejected(): void
    {
        $this->getJson(self::ENDPOINT)->assertStatus(401);
        $this->postJson(self::ENDPOINT, $this->validMaterialPayload())->assertStatus(401);
    }

    /** M2: authenticated with zero memberships -> no active Company -> fail-closed 403 (platform's existing behavior, unchanged). */
    public function test_m2_no_active_company_fails_closed(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->getJson(self::ENDPOINT)->assertStatus(403);
    }

    /** M3: create minimal (name + unit_code only). */
    public function test_m3_create_minimal(): void
    {
        $this->actingAsNewCompanyMember();

        $response = $this->postJson(self::ENDPOINT, $this->validMaterialPayload());

        $response->assertCreated()
            ->assertJsonPath('name', 'Cimento CP-II 50kg')
            ->assertJsonPath('unit_code', 'sc')
            ->assertJsonPath('unit_custom_label', null)
            ->assertJsonPath('notes', null);
    }

    /** M4: id is a real UUID, company_id is never exposed, and is forced server-side. */
    public function test_m4_uuid_and_server_company(): void
    {
        [$company] = $this->actingAsNewCompanyMember();

        $response = $this->postJson(self::ENDPOINT, $this->validMaterialPayload());

        $id = $response->json('id');
        $this->assertMatchesRegularExpression('/^[0-9a-f-]{36}$/', $id);
        $response->assertJsonMissingPath('company_id');

        $this->assertDatabaseHas('materials', ['id' => $id, 'company_id' => $company->id]);
    }

    /** M5: active defaults to true when omitted. */
    public function test_m5_active_defaults_true(): void
    {
        $this->actingAsNewCompanyMember();

        $this->postJson(self::ENDPOINT, $this->validMaterialPayload())
            ->assertJsonPath('active', true);
    }

    /** M6: every declared unit code is accepted. */
    public function test_m6_each_unit_code_is_valid(): void
    {
        $this->actingAsNewCompanyMember();

        foreach (['un', 'kg', 't', 'm', 'm2', 'm3', 'l', 'sc', 'cx'] as $unitCode) {
            $this->postJson(self::ENDPOINT, $this->validMaterialPayload(['unit_code' => $unitCode]))
                ->assertCreated()
                ->assertJsonPath('unit_code', $unitCode);
        }

        $this->postJson(self::ENDPOINT, $this->validMaterialPayload([
            'unit_code' => 'other',
            'unit_custom_label' => 'saco de 20kg',
        ]))->assertCreated()->assertJsonPath('unit_code', 'other');
    }

    /** M7: an invalid unit code -> 422. */
    public function test_m7_invalid_unit_code_is_422(): void
    {
        $this->actingAsNewCompanyMember();

        $this->postJson(self::ENDPOINT, $this->validMaterialPayload(['unit_code' => 'saco']))
            ->assertStatus(422)
            ->assertJsonValidationErrors('unit_code');
    }

    /** M8: unit_code=other requires a non-empty unit_custom_label. */
    public function test_m8_other_requires_custom_label(): void
    {
        $this->actingAsNewCompanyMember();

        $this->postJson(self::ENDPOINT, $this->validMaterialPayload(['unit_code' => 'other']))
            ->assertStatus(422)
            ->assertJsonValidationErrors('unit_custom_label');

        $this->postJson(self::ENDPOINT, $this->validMaterialPayload([
            'unit_code' => 'other',
            'unit_custom_label' => '   ',
        ]))->assertStatus(422)->assertJsonValidationErrors('unit_custom_label');
    }

    /** M9: a non-other unit_code rejects a custom label (kg + "saco" is invalid). */
    public function test_m9_non_other_rejects_custom_label(): void
    {
        $this->actingAsNewCompanyMember();

        $this->postJson(self::ENDPOINT, $this->validMaterialPayload([
            'unit_code' => 'kg',
            'unit_custom_label' => 'saco',
        ]))->assertStatus(422)->assertJsonValidationErrors('unit_custom_label');
    }

    /** M10: list + search by name. */
    public function test_m10_list_and_search(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $this->makeMaterialForCompany($company, ['name' => 'Cimento CP-II']);
        $this->makeMaterialForCompany($company, ['name' => 'Areia média']);

        $response = $this->getJson(self::ENDPOINT.'?search=cimento');

        $response->assertOk();
        $names = collect($response->json('data'))->pluck('name');
        $this->assertTrue($names->contains('Cimento CP-II'));
        $this->assertFalse($names->contains('Areia média'));
    }

    /** M11: active filter — omitted returns both, explicit filters. */
    public function test_m11_active_filter(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $this->makeMaterialForCompany($company, ['name' => 'Ativo Um', 'active' => true]);
        $this->makeMaterialForCompany($company, ['name' => 'Inativo Um', 'active' => false]);

        $both = $this->getJson(self::ENDPOINT)->json('data');
        $this->assertCount(2, $both);

        $activeOnly = $this->getJson(self::ENDPOINT.'?active=true')->json('data');
        $this->assertCount(1, $activeOnly);
        $this->assertSame('Ativo Um', $activeOnly[0]['name']);

        $inactiveOnly = $this->getJson(self::ENDPOINT.'?active=false')->json('data');
        $this->assertCount(1, $inactiveOnly);
        $this->assertSame('Inativo Um', $inactiveOnly[0]['name']);
    }

    /** M12: update. */
    public function test_m12_update(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $material = $this->makeMaterialForCompany($company, ['name' => 'Original']);

        $response = $this->putJson(self::ENDPOINT."/{$material->id}", $this->validMaterialPayload([
            'name' => 'Atualizado',
            'unit_code' => 'kg',
            'notes' => 'Observação',
        ]));

        $response->assertOk()
            ->assertJsonPath('name', 'Atualizado')
            ->assertJsonPath('unit_code', 'kg')
            ->assertJsonPath('notes', 'Observação');
    }

    /** M13: deactivate/reactivate via update. */
    public function test_m13_deactivate_and_reactivate(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $material = $this->makeMaterialForCompany($company);

        $this->putJson(self::ENDPOINT."/{$material->id}", $this->validMaterialPayload(['active' => false]))
            ->assertJsonPath('active', false);

        $this->putJson(self::ENDPOINT."/{$material->id}", $this->validMaterialPayload(['active' => true]))
            ->assertJsonPath('active', true);
    }

    /** M14: delete an unreferenced Material succeeds (no dependent tables exist yet in this gate). */
    public function test_m14_delete_unreferenced(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $material = $this->makeMaterialForCompany($company);

        $this->deleteJson(self::ENDPOINT."/{$material->id}")->assertNoContent();

        $this->assertDatabaseMissing('materials', ['id' => $material->id]);
    }

    /** M15: cross-tenant show/update/delete -> 404, never a revealing 403. */
    public function test_m15_cross_tenant_is_404(): void
    {
        [$companyA] = $this->makeCompanyWithMember();
        $materialA = $this->makeMaterialForCompany($companyA);

        $this->actingAsNewCompanyMember();

        $this->getJson(self::ENDPOINT."/{$materialA->id}")->assertStatus(404);
        $this->putJson(self::ENDPOINT."/{$materialA->id}", $this->validMaterialPayload())->assertStatus(404);
        $this->deleteJson(self::ENDPOINT."/{$materialA->id}")->assertStatus(404);

        $this->assertDatabaseHas('materials', ['id' => $materialA->id]);
    }

    /** M16: a hostile company_id in the payload cannot escape the active tenant. */
    public function test_m16_hostile_company_id_cannot_escape_tenant(): void
    {
        [$companyA] = $this->makeCompanyWithMember();
        [$companyB, $userB] = $this->makeCompanyWithMember();
        Sanctum::actingAs($userB);

        $response = $this->postJson(self::ENDPOINT, $this->validMaterialPayload(['company_id' => $companyA->id]));

        $response->assertStatus(422)->assertJsonValidationErrors('company_id');
    }
}
