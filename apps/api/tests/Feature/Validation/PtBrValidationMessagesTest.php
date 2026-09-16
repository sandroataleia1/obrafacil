<?php

namespace Tests\Feature\Validation;

use App\Models\Customer;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Feature\Customers\Concerns\InteractsWithCustomers;
use Tests\TestCase;

/**
 * UX-HARDENING-01 (F2): VI1-VI14. Confirms validation-facing text is
 * PT-BR — normalization, rules, authorize(), tenant scoping, DB
 * constraints, and the response shape (422 + {message, errors}) are
 * untouched (§24).
 */
class PtBrValidationMessagesTest extends TestCase
{
    use InteractsWithCustomers, RefreshDatabase;

    /** VI1: the app's default locale is pt_BR. */
    public function test_vi1_app_locale_default_is_pt_br(): void
    {
        $this->assertSame('pt_BR', config('app.locale'));
    }

    /** VI2: a built-in "required" rule message is PT-BR. */
    public function test_vi2_required_built_in_rule_is_pt_br(): void
    {
        $this->actingAsNewCompanyMember();

        $response = $this->postJson('/api/v1/customers', $this->validCustomerPayload(['name' => null]))
            ->assertStatus(422);

        $this->assertStringContainsString('obrigatório', $response->json('errors.name.0'));
    }

    /** VI3: a built-in "email" rule message is PT-BR. */
    public function test_vi3_email_built_in_rule_is_pt_br(): void
    {
        $this->actingAsNewCompanyMember();

        $response = $this->postJson('/api/v1/customers', $this->validCustomerPayload(['email' => 'not-an-email']))
            ->assertStatus(422);

        $this->assertStringContainsString('válido', $response->json('errors.email.0'));
    }

    /** VI4: a built-in "digits" rule message (CEP) is PT-BR. */
    public function test_vi4_digits_built_in_rule_is_pt_br(): void
    {
        $this->actingAsNewCompanyMember();

        $response = $this->postJson('/api/v1/customers', $this->validCustomerPayload([
            'addresses' => [array_merge($this->validAddressPayload(), ['postal_code' => '123'])],
        ]))->assertStatus(422);

        $this->assertStringContainsString('8 dígitos', $response->json('errors')['addresses.0.postal_code'][0]);
    }

    /** VI5: a built-in "in" rule message (state/UF) is PT-BR. */
    public function test_vi5_state_in_rule_is_pt_br(): void
    {
        $this->actingAsNewCompanyMember();

        $response = $this->postJson('/api/v1/customers', $this->validCustomerPayload([
            'addresses' => [array_merge($this->validAddressPayload(), ['state' => 'ZZ'])],
        ]))->assertStatus(422);

        $this->assertStringContainsString('inválido', $response->json('errors')['addresses.0.state'][0]);
    }

    /** VI6: the Cnpj rule message is PT-BR. */
    public function test_vi6_cnpj_rule_is_pt_br(): void
    {
        $this->actingAsNewCompanyMember();

        $response = $this->putJson('/api/v1/company/profile', [
            'name' => 'Empresa Teste',
            'document' => '11111111000100',
        ])->assertStatus(422);

        $this->assertStringContainsString('CNPJ válido', $response->json('errors.document.0'));
    }

    /** VI7: the E164Phone rule message is PT-BR. */
    public function test_vi7_e164_phone_rule_is_pt_br(): void
    {
        $this->actingAsNewCompanyMember();

        $response = $this->postJson('/api/v1/customers', $this->validCustomerPayload(['phone' => 'not-a-phone']))
            ->assertStatus(422);

        $this->assertStringContainsString('inválido', $response->json('errors.phone.0'));
    }

    /** VI8: Customer CPF-mismatch-for-individual message is PT-BR. */
    public function test_vi8_customer_cpf_invalid_message_is_pt_br(): void
    {
        $this->actingAsNewCompanyMember();

        $response = $this->postJson('/api/v1/customers', $this->validCustomerPayload([
            'kind' => 'individual',
            'document' => '11111111111',
        ]))->assertStatus(422);

        $this->assertStringContainsString('CPF válido', $response->json('errors.document.0'));
    }

    /** VI9: Customer CNPJ-mismatch-for-company message is PT-BR. */
    public function test_vi9_customer_cnpj_invalid_message_is_pt_br(): void
    {
        $this->actingAsNewCompanyMember();

        $response = $this->postJson('/api/v1/customers', $this->validCustomerPayload([
            'kind' => 'company',
            'name' => 'Cliente Empresa',
            'document' => '11111111000100',
        ]))->assertStatus(422);

        $this->assertStringContainsString('CNPJ válido', $response->json('errors.document.0'));
    }

    /** VI10: duplicate document message is PT-BR. */
    public function test_vi10_customer_duplicate_document_message_is_pt_br(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $this->currentCompanyContext()->run($company, fn () => Customer::factory()->create([
            'kind' => 'individual',
            'document' => '52998224725',
        ]));

        $response = $this->postJson('/api/v1/customers', $this->validCustomerPayload([
            'kind' => 'individual',
            'document' => '52998224725',
        ]))->assertStatus(422);

        $this->assertStringContainsString('Já existe um cliente', $response->json('errors.document.0'));
    }

    /** VI11: primary-address-count message is PT-BR. */
    public function test_vi11_customer_primary_address_count_message_is_pt_br(): void
    {
        $this->actingAsNewCompanyMember();

        $response = $this->postJson('/api/v1/customers', $this->validCustomerPayload([
            'addresses' => [
                $this->validAddressPayload(['is_primary' => true]),
                $this->validAddressPayload(['label' => 'Trabalho', 'is_primary' => true]),
            ],
        ]))->assertStatus(422);

        $this->assertStringContainsString('principal', $response->json('errors.addresses.0'));
    }

    /** VI12: primary-contact-count message is PT-BR. */
    public function test_vi12_customer_primary_contact_count_message_is_pt_br(): void
    {
        $this->actingAsNewCompanyMember();

        $response = $this->postJson('/api/v1/customers', $this->validCustomerPayload([
            'contacts' => [
                $this->validContactPayload(['is_primary' => true]),
                $this->validContactPayload(['name' => 'Outro Contato', 'is_primary' => true]),
            ],
        ]))->assertStatus(422);

        $this->assertStringContainsString('principal', $response->json('errors.contacts.0'));
    }

    /** VI13: Company Profile CNPJ-invalid message is PT-BR (also covers UpdateCompanyProfileRequest). */
    public function test_vi13_company_profile_cnpj_invalid_is_pt_br(): void
    {
        $this->actingAsNewCompanyMember();

        $response = $this->putJson('/api/v1/company/profile', [
            'name' => 'Empresa Teste',
            'document' => '00000000000000',
        ])->assertStatus(422);

        $this->assertStringContainsString('CNPJ válido', $response->json('errors.document.0'));
    }

    /** VI14: the response shape stays exactly {message, errors: {field: [...]}} with 422 — no contract change. */
    public function test_vi14_response_shape_is_unchanged(): void
    {
        $this->actingAsNewCompanyMember();

        $response = $this->postJson('/api/v1/customers', $this->validCustomerPayload(['name' => null]))
            ->assertStatus(422)
            ->assertJsonStructure(['message', 'errors' => ['name']]);

        $this->assertIsString($response->json('message'));
        $this->assertIsArray($response->json('errors.name'));
    }
}
