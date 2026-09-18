<?php

namespace Tests\Feature\Suppliers;

use App\Support\Document;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\Feature\Suppliers\Concerns\InteractsWithSuppliers;
use Tests\TestCase;

/**
 * SUPPLY-API-01A §40, S1-S20.
 */
class SupplierApiTest extends TestCase
{
    use InteractsWithSuppliers, RefreshDatabase;

    private const string ENDPOINT = '/api/v1/suppliers';

    /** M1-equivalent: unauthenticated -> 401. Kept implicit via S-series below; explicit here for completeness. */
    public function test_unauthenticated_is_rejected(): void
    {
        $this->getJson(self::ENDPOINT)->assertStatus(401);
    }

    /** S1: create name-only. */
    public function test_s1_create_name_only(): void
    {
        $this->actingAsNewCompanyMember();

        $response = $this->postJson(self::ENDPOINT, $this->validSupplierPayload());

        $response->assertCreated()
            ->assertJsonPath('name', 'Depósito Central Materiais')
            ->assertJsonPath('document', null)
            ->assertJsonPath('active', true);
    }

    /** S2: document null is explicitly allowed. */
    public function test_s2_document_null_allowed(): void
    {
        $this->actingAsNewCompanyMember();

        $this->postJson(self::ENDPOINT, $this->validSupplierPayload(['document' => null]))
            ->assertCreated()
            ->assertJsonPath('document', null);
    }

    /** S3: a valid CPF, already canonical (11 digits), is accepted as-is. */
    public function test_s3_valid_cpf_canonical(): void
    {
        $this->actingAsNewCompanyMember();
        $cpf = Document::generateCpf();

        $this->postJson(self::ENDPOINT, $this->validSupplierPayload(['document' => $cpf]))
            ->assertCreated()
            ->assertJsonPath('document', $cpf);
    }

    /** S4: a valid CPF with mask formatting normalizes to digits-only. */
    public function test_s4_formatted_cpf_normalizes(): void
    {
        $this->actingAsNewCompanyMember();
        $cpf = Document::generateCpf();
        $formatted = substr($cpf, 0, 3).'.'.substr($cpf, 3, 3).'.'.substr($cpf, 6, 3).'-'.substr($cpf, 9, 2);

        $this->postJson(self::ENDPOINT, $this->validSupplierPayload(['document' => $formatted]))
            ->assertCreated()
            ->assertJsonPath('document', $cpf);
    }

    /** S5: a valid CNPJ, already canonical (14 digits), is accepted as-is. */
    public function test_s5_valid_cnpj_canonical(): void
    {
        $this->actingAsNewCompanyMember();
        $cnpj = Document::generateCnpj();

        $this->postJson(self::ENDPOINT, $this->validSupplierPayload(['document' => $cnpj]))
            ->assertCreated()
            ->assertJsonPath('document', $cnpj);
    }

    /** S6: a valid CNPJ with mask formatting normalizes to digits-only. */
    public function test_s6_formatted_cnpj_normalizes(): void
    {
        $this->actingAsNewCompanyMember();
        $cnpj = Document::generateCnpj();
        $formatted = substr($cnpj, 0, 2).'.'.substr($cnpj, 2, 3).'.'.substr($cnpj, 5, 3).'/'.substr($cnpj, 8, 4).'-'.substr($cnpj, 12, 2);

        $this->postJson(self::ENDPOINT, $this->validSupplierPayload(['document' => $formatted]))
            ->assertCreated()
            ->assertJsonPath('document', $cnpj);
    }

    /** S7: an invalid (bad check-digit) CPF -> 422. */
    public function test_s7_invalid_cpf_is_422(): void
    {
        $this->actingAsNewCompanyMember();

        $this->postJson(self::ENDPOINT, $this->validSupplierPayload(['document' => '11111111111']))
            ->assertStatus(422)
            ->assertJsonValidationErrors('document');
    }

    /** S8: an invalid (bad check-digit) CNPJ -> 422. */
    public function test_s8_invalid_cnpj_is_422(): void
    {
        $this->actingAsNewCompanyMember();

        $this->postJson(self::ENDPOINT, $this->validSupplierPayload(['document' => '11111111111111']))
            ->assertStatus(422)
            ->assertJsonValidationErrors('document');
    }

    /** S9: a document of any other length -> 422. */
    public function test_s9_invalid_length_is_422(): void
    {
        $this->actingAsNewCompanyMember();

        $this->postJson(self::ENDPOINT, $this->validSupplierPayload(['document' => '123456789']))
            ->assertStatus(422)
            ->assertJsonValidationErrors('document');
    }

    /** S10: a valid E.164 phone is accepted. */
    public function test_s10_e164_phone_accepted(): void
    {
        $this->actingAsNewCompanyMember();

        $this->postJson(self::ENDPOINT, $this->validSupplierPayload(['phone' => '+5511988887777']))
            ->assertCreated()
            ->assertJsonPath('phone', '+5511988887777');
    }

    /** S11: a masked/non-E.164 phone is rejected. */
    public function test_s11_invalid_phone_rejected(): void
    {
        $this->actingAsNewCompanyMember();

        $this->postJson(self::ENDPOINT, $this->validSupplierPayload(['phone' => '(11) 98888-7777']))
            ->assertStatus(422)
            ->assertJsonValidationErrors('phone');
    }

    /** S12: email is normalized to lowercase and trimmed. */
    public function test_s12_email_normalized_lowercase(): void
    {
        $this->actingAsNewCompanyMember();

        $this->postJson(self::ENDPOINT, $this->validSupplierPayload(['email' => '  Contato@Fornecedor.COM  ']))
            ->assertCreated()
            ->assertJsonPath('email', 'contato@fornecedor.com');
    }

    /** S13: duplicate document within the same Company -> 422 on the document field. */
    public function test_s13_duplicate_document_same_company_is_422(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $cnpj = Document::generateCnpj();
        $this->makeSupplierForCompany($company, ['document' => $cnpj]);

        $this->postJson(self::ENDPOINT, $this->validSupplierPayload(['document' => $cnpj, 'name' => 'Outro Fornecedor']))
            ->assertStatus(422)
            ->assertJsonValidationErrors('document');
    }

    /** S14: the same document in a DIFFERENT Company is allowed (per-Company uniqueness only). */
    public function test_s14_same_document_different_company_allowed(): void
    {
        [$companyA] = $this->makeCompanyWithMember();
        $cnpj = Document::generateCnpj();
        $this->makeSupplierForCompany($companyA, ['document' => $cnpj]);

        $this->actingAsNewCompanyMember();

        $this->postJson(self::ENDPOINT, $this->validSupplierPayload(['document' => $cnpj]))
            ->assertCreated()
            ->assertJsonPath('document', $cnpj);
    }

    /**
     * S15: a genuine DB-level race — the FormRequest's own pre-check
     * SELECT finds no match, but a colliding row is inserted at the exact
     * moment that SELECT completes (before the real INSERT runs). The
     * real partial unique index must still catch it, and SupplierService
     * must translate the raw QueryException into the same
     * errors.document 422 shape, never a raw 500.
     */
    public function test_s15_db_level_duplicate_race_maps_to_errors_document(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $cnpj = Document::generateCnpj();

        $injected = false;
        DB::listen(function ($query) use (&$injected, $company, $cnpj) {
            if ($injected) {
                return;
            }
            if (str_starts_with(trim($query->sql), 'select') && str_contains($query->sql, '"suppliers"') && str_contains($query->sql, '"document"')) {
                $injected = true;
                DB::connection()->insert(
                    'insert into "suppliers" ("id", "company_id", "name", "document", "active", "created_at", "updated_at") '.
                    'values (?, ?, ?, ?, true, now(), now())',
                    [(string) Str::uuid(), $company->id, 'Concorrente na Corrida', $cnpj]
                );
            }
        });

        $response = $this->postJson(self::ENDPOINT, $this->validSupplierPayload(['document' => $cnpj]));

        $response->assertStatus(422)->assertJsonValidationErrors('document');
        $this->assertSame(1, DB::table('suppliers')->where('document', $cnpj)->count());
    }

    /** S16: list + search by name. */
    public function test_s16_list_and_search(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $this->makeSupplierForCompany($company, ['name' => 'Depósito Central']);
        $this->makeSupplierForCompany($company, ['name' => 'Ferragens Norte']);

        $response = $this->getJson(self::ENDPOINT.'?search=Central');

        $response->assertOk();
        $names = collect($response->json('data'))->pluck('name');
        $this->assertTrue($names->contains('Depósito Central'));
        $this->assertFalse($names->contains('Ferragens Norte'));
    }

    /** S17: active filter — omitted returns both, explicit filters. */
    public function test_s17_active_filter(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $this->makeSupplierForCompany($company, ['name' => 'Ativo Um', 'active' => true]);
        $this->makeSupplierForCompany($company, ['name' => 'Inativo Um', 'active' => false]);

        $both = $this->getJson(self::ENDPOINT)->json('data');
        $this->assertCount(2, $both);

        $activeOnly = $this->getJson(self::ENDPOINT.'?active=true')->json('data');
        $this->assertCount(1, $activeOnly);
        $this->assertSame('Ativo Um', $activeOnly[0]['name']);
    }

    /** S18: update, deactivate, reactivate. */
    public function test_s18_update_deactivate_reactivate(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $supplier = $this->makeSupplierForCompany($company, ['name' => 'Original']);

        $this->putJson(self::ENDPOINT."/{$supplier->id}", $this->validSupplierPayload(['name' => 'Atualizado']))
            ->assertOk()->assertJsonPath('name', 'Atualizado');

        $this->putJson(self::ENDPOINT."/{$supplier->id}", $this->validSupplierPayload(['name' => 'Atualizado', 'active' => false]))
            ->assertJsonPath('active', false);

        $this->putJson(self::ENDPOINT."/{$supplier->id}", $this->validSupplierPayload(['name' => 'Atualizado', 'active' => true]))
            ->assertJsonPath('active', true);
    }

    /** S19: delete an unreferenced Supplier succeeds (no PurchaseOrder table exists yet in this gate). */
    public function test_s19_delete_unreferenced(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $supplier = $this->makeSupplierForCompany($company);

        $this->deleteJson(self::ENDPOINT."/{$supplier->id}")->assertNoContent();

        $this->assertDatabaseMissing('suppliers', ['id' => $supplier->id]);
    }

    /** S20: cross-tenant show/update/delete -> 404. */
    public function test_s20_cross_tenant_is_404(): void
    {
        [$companyA] = $this->makeCompanyWithMember();
        $supplierA = $this->makeSupplierForCompany($companyA);

        $this->actingAsNewCompanyMember();

        $this->getJson(self::ENDPOINT."/{$supplierA->id}")->assertStatus(404);
        $this->putJson(self::ENDPOINT."/{$supplierA->id}", $this->validSupplierPayload())->assertStatus(404);
        $this->deleteJson(self::ENDPOINT."/{$supplierA->id}")->assertStatus(404);

        $this->assertDatabaseHas('suppliers', ['id' => $supplierA->id]);
    }

    /** Hostile company_id cannot escape tenant (same discipline as Material M16). */
    public function test_hostile_company_id_cannot_escape_tenant(): void
    {
        [$companyA] = $this->makeCompanyWithMember();
        [, $userB] = $this->makeCompanyWithMember();
        Sanctum::actingAs($userB);

        $this->postJson(self::ENDPOINT, $this->validSupplierPayload(['company_id' => $companyA->id]))
            ->assertStatus(422)
            ->assertJsonValidationErrors('company_id');
    }
}
