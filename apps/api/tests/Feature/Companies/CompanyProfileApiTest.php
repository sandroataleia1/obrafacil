<?php

namespace Tests\Feature\Companies;

use App\Enums\CompanyRole;
use App\Models\Company;
use App\Models\User;
use App\Support\Document;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Feature\Companies\Concerns\InteractsWithCompanyProfile;
use Tests\TestCase;

/**
 * COMPANY-PROFILE-API-01: GET/PUT /api/v1/company/profile. CP1-CP16.
 */
class CompanyProfileApiTest extends TestCase
{
    use InteractsWithCompanyProfile, RefreshDatabase;

    private const ENDPOINT = '/api/v1/company/profile';

    private function fullValidPayload(array $overrides = []): array
    {
        return array_merge([
            'name' => 'Construtora Exemplo',
            'legal_name' => 'Construtora Exemplo LTDA',
            'trade_name' => 'Exemplo Construções',
            'document' => Document::generateCnpj(),
            'phone' => '+5511987654321',
            'whatsapp' => '+5511987654322',
            'email' => 'contato@exemplo.com',
            'postal_code' => '01001000',
            'street' => 'Praça da Sé',
            'number' => '100',
            'complement' => 'Sala 1',
            'neighborhood' => 'Sé',
            'city' => 'São Paulo',
            'state' => 'sp',
            'reference_point' => 'Ao lado da catedral',
            'timezone' => 'America/Sao_Paulo',
        ], $overrides);
    }

    /** CP1: no auth -> 401. */
    public function test_cp1_unauthenticated_get_is_rejected(): void
    {
        $this->getJson(self::ENDPOINT)->assertStatus(401);
    }

    /** CP2: authenticated but no active company (0 memberships) -> 403. */
    public function test_cp2_authenticated_without_active_company_is_rejected(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->getJson(self::ENDPOINT)->assertStatus(403);
    }

    /** CP3: authenticated + active company -> 200 with the profile shape. */
    public function test_cp3_get_returns_profile(): void
    {
        [$company, $user] = $this->actingAsNewCompanyMember(['name' => 'Empresa X']);

        $this->getJson(self::ENDPOINT)
            ->assertOk()
            ->assertJson([
                'id' => $company->id,
                'name' => 'Empresa X',
                'logo_url' => null,
            ])
            ->assertJsonStructure([
                'id', 'name', 'legal_name', 'trade_name', 'document',
                'phone', 'whatsapp', 'email',
                'address' => ['postal_code', 'street', 'number', 'complement', 'neighborhood', 'city', 'state', 'reference_point'],
                'timezone', 'logo_url', 'created_at', 'updated_at',
            ]);
    }

    /** CP4: id/company_id/logo_path/logo_url/timestamps sent by the client never reach the model. */
    public function test_cp4_hostile_fields_are_prohibited(): void
    {
        [$company, $user] = $this->actingAsNewCompanyMember();

        $response = $this->putJson(self::ENDPOINT, $this->fullValidPayload([
            'id' => '11111111-1111-1111-1111-111111111111',
            'company_id' => '22222222-2222-2222-2222-222222222222',
            'logo_path' => 'evil/path.png',
            'created_at' => '2000-01-01T00:00:00Z',
            'updated_at' => '2000-01-01T00:00:00Z',
        ]));

        $response->assertStatus(422);
        $response->assertJsonValidationErrors(['id', 'company_id', 'logo_path', 'created_at', 'updated_at']);
    }

    /** CP5: owner can update. */
    public function test_cp5_owner_can_update(): void
    {
        [$company] = $this->actingAsNewCompanyMember([], [], CompanyRole::Owner);

        $response = $this->putJson(self::ENDPOINT, $this->fullValidPayload(['name' => 'Novo Nome']));

        $response->assertOk()->assertJson(['name' => 'Novo Nome']);
        $this->assertSame('Novo Nome', $company->refresh()->name);
    }

    /** CP6: admin can update. */
    public function test_cp6_admin_can_update(): void
    {
        [$company] = $this->actingAsNewCompanyMember([], [], CompanyRole::Admin);

        $response = $this->putJson(self::ENDPOINT, $this->fullValidPayload(['name' => 'Nome Admin']));

        $response->assertOk()->assertJson(['name' => 'Nome Admin']);
    }

    /** CP7: plain member gets 403, and nothing is changed. */
    public function test_cp7_member_update_is_rejected(): void
    {
        [$company] = $this->actingAsNewCompanyMember(['name' => 'Nome Original'], [], CompanyRole::Member);

        $response = $this->putJson(self::ENDPOINT, $this->fullValidPayload(['name' => 'Nome Hostil']));

        $response->assertStatus(403);
        $this->assertSame('Nome Original', $company->refresh()->name);
    }

    /** CP7b: member can still GET (read is open to any member). */
    public function test_cp7b_member_can_read(): void
    {
        $this->actingAsNewCompanyMember([], [], CompanyRole::Member);

        $this->getJson(self::ENDPOINT)->assertOk();
    }

    /** CP8: document is canonicalized to digits-only and check-digit validated. */
    public function test_cp8_document_is_canonicalized_and_validated(): void
    {
        $this->actingAsNewCompanyMember();

        // Well-formed (14 digits) but not check-digit valid — flip the last digit of a valid CNPJ.
        $valid1 = Document::generateCnpj();
        $lastDigit = (int) substr($valid1, -1);
        $invalid = substr($valid1, 0, -1).(($lastDigit + 1) % 10);
        $this->putJson(self::ENDPOINT, $this->fullValidPayload(['document' => $invalid]))
            ->assertStatus(422)
            ->assertJsonValidationErrors(['document']);

        $valid = Document::generateCnpj();
        $response = $this->putJson(self::ENDPOINT, $this->fullValidPayload(['document' => $valid]));
        $response->assertOk()->assertJson(['document' => $valid]);
    }

    /** CP9: phone must be E.164. */
    public function test_cp9_phone_must_be_e164(): void
    {
        $this->actingAsNewCompanyMember();

        $this->putJson(self::ENDPOINT, $this->fullValidPayload(['phone' => '11987654321']))
            ->assertStatus(422)
            ->assertJsonValidationErrors(['phone']);

        $this->putJson(self::ENDPOINT, $this->fullValidPayload(['phone' => '+5511987654321']))
            ->assertOk()
            ->assertJson(['phone' => '+5511987654321']);
    }

    /** CP10: whatsapp must be E.164. */
    public function test_cp10_whatsapp_must_be_e164(): void
    {
        $this->actingAsNewCompanyMember();

        $this->putJson(self::ENDPOINT, $this->fullValidPayload(['whatsapp' => 'not-a-phone']))
            ->assertStatus(422)
            ->assertJsonValidationErrors(['whatsapp']);
    }

    /** CP11: email is validated. */
    public function test_cp11_email_is_validated(): void
    {
        $this->actingAsNewCompanyMember();

        $this->putJson(self::ENDPOINT, $this->fullValidPayload(['email' => 'not-an-email']))
            ->assertStatus(422)
            ->assertJsonValidationErrors(['email']);

        $this->putJson(self::ENDPOINT, $this->fullValidPayload(['email' => ' Contato@Exemplo.COM ']))
            ->assertOk()
            ->assertJson(['email' => 'contato@exemplo.com']);
    }

    /** CP12: CEP is canonicalized to 8 digits, state is uppercased. */
    public function test_cp12_postal_code_and_state_are_canonical(): void
    {
        $this->actingAsNewCompanyMember();

        $this->putJson(self::ENDPOINT, $this->fullValidPayload(['postal_code' => '01001-000', 'state' => 'sp']))
            ->assertOk()
            ->assertJson(['address' => ['postal_code' => '01001000', 'state' => 'SP']]);

        $this->putJson(self::ENDPOINT, $this->fullValidPayload(['state' => 'XX']))
            ->assertStatus(422)
            ->assertJsonValidationErrors(['state']);
    }

    /** CP13: a valid IANA timezone is accepted. */
    public function test_cp13_valid_timezone_is_accepted(): void
    {
        $this->actingAsNewCompanyMember();

        $this->putJson(self::ENDPOINT, $this->fullValidPayload(['timezone' => 'America/Manaus']))
            ->assertOk()
            ->assertJson(['timezone' => 'America/Manaus']);
    }

    /** CP14: an invalid/arbitrary timezone string is rejected with 422. */
    public function test_cp14_invalid_timezone_is_rejected(): void
    {
        $this->actingAsNewCompanyMember();

        $this->putJson(self::ENDPOINT, $this->fullValidPayload(['timezone' => 'Not/A_Real_Zone']))
            ->assertStatus(422)
            ->assertJsonValidationErrors(['timezone']);
    }

    /** CP15: Company A's profile is never reachable through this endpoint while B is active — the endpoint only ever resolves whichever company is currently active. */
    public function test_cp15_cross_tenant_is_impossible_through_the_endpoint(): void
    {
        [$companyA, $user] = $this->makeCompanyWithMember(['name' => 'Empresa A']);
        $companyB = Company::factory()->create(['name' => 'Empresa B']);
        $companyB->memberships()->create(['user_id' => $user->id, 'role' => CompanyRole::Owner]);

        Sanctum::actingAs($user);

        $this->postJson("/api/v1/companies/{$companyA->id}/activate")->assertOk();
        $this->getJson(self::ENDPOINT)->assertOk()->assertJson(['id' => $companyA->id, 'name' => 'Empresa A']);

        $this->postJson("/api/v1/companies/{$companyB->id}/activate")->assertOk();
        $this->getJson(self::ENDPOINT)->assertOk()->assertJson(['id' => $companyB->id, 'name' => 'Empresa B']);
    }

    /** CP16: the resource never exposes logo_path, only logo_url. */
    public function test_cp16_resource_never_exposes_logo_path(): void
    {
        $this->actingAsNewCompanyMember();

        $body = $this->getJson(self::ENDPOINT)->assertOk()->json();
        $this->assertArrayNotHasKey('logo_path', $body);
        $this->assertArrayHasKey('logo_url', $body);
    }
}
