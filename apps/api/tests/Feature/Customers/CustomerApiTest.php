<?php

namespace Tests\Feature\Customers;

use App\Models\Company;
use App\Models\Customer;
use App\Support\CurrentCompanyContext;
use App\Support\Document;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\Feature\Customers\Concerns\InteractsWithCustomers;
use Tests\TestCase;

/**
 * BACKEND-04: C1-C18 (create/validation), L1-L10 (list/search), X1-X6
 * (soft delete), T1-T10 (tenant isolation).
 */
class CustomerApiTest extends TestCase
{
    use InteractsWithCustomers, RefreshDatabase;

    private const string ENDPOINT = '/api/v1/customers';

    // ---------------------------------------------------------------
    // C1-C18: create + validation
    // ---------------------------------------------------------------

    /** C1: no auth -> 401. */
    public function test_c1_unauthenticated_create_is_rejected(): void
    {
        $this->postJson(self::ENDPOINT, $this->validCustomerPayload())->assertStatus(401);
    }

    /** C2: auth + company -> creates Customer. */
    public function test_c2_creates_customer(): void
    {
        $this->actingAsNewCompanyMember();

        $this->postJson(self::ENDPOINT, $this->validCustomerPayload())
            ->assertStatus(201)
            ->assertJsonPath('name', 'João da Silva');
    }

    /** C3: company_id comes from context, never the client. */
    public function test_c3_company_id_comes_from_context(): void
    {
        [$company] = $this->actingAsNewCompanyMember();

        $response = $this->postJson(self::ENDPOINT, $this->validCustomerPayload())->assertStatus(201);

        $customer = $this->currentCompanyContext()->run(
            $company,
            fn () => Customer::query()->findOrFail($response->json('id'))
        );
        $this->assertSame($company->id, $customer->company_id);
    }

    /** C4: kind individual. */
    public function test_c4_kind_individual(): void
    {
        $this->actingAsNewCompanyMember();

        $this->postJson(self::ENDPOINT, $this->validCustomerPayload(['kind' => 'individual']))
            ->assertStatus(201)
            ->assertJsonPath('kind', 'individual');
    }

    /** C5: kind company. */
    public function test_c5_kind_company(): void
    {
        $this->actingAsNewCompanyMember();

        $this->postJson(self::ENDPOINT, $this->validCustomerPayload(['kind' => 'company', 'name' => 'Mercado Central']))
            ->assertStatus(201)
            ->assertJsonPath('kind', 'company');
    }

    /** C6: a valid, masked CPF is normalized and persisted digits-only. */
    public function test_c6_valid_cpf_persists_digits_only(): void
    {
        $this->actingAsNewCompanyMember();
        $cpf = Document::generateCpf();
        $masked = substr($cpf, 0, 3).'.'.substr($cpf, 3, 3).'.'.substr($cpf, 6, 3).'-'.substr($cpf, 9, 2);

        $this->postJson(self::ENDPOINT, $this->validCustomerPayload(['document' => $masked]))
            ->assertStatus(201)
            ->assertJsonPath('document', $cpf);
    }

    /** C7: an invalid CPF -> 422. */
    public function test_c7_invalid_cpf_is_rejected(): void
    {
        $this->actingAsNewCompanyMember();

        $this->postJson(self::ENDPOINT, $this->validCustomerPayload(['document' => '11111111111']))
            ->assertStatus(422)
            ->assertJsonValidationErrors('document');
    }

    /** C8: a valid, masked CNPJ is normalized and persisted digits-only. */
    public function test_c8_valid_cnpj_persists_digits_only(): void
    {
        $this->actingAsNewCompanyMember();
        $cnpj = Document::generateCnpj();
        $masked = substr($cnpj, 0, 2).'.'.substr($cnpj, 2, 3).'.'.substr($cnpj, 5, 3).'/'.substr($cnpj, 8, 4).'-'.substr($cnpj, 12, 2);

        $this->postJson(self::ENDPOINT, $this->validCustomerPayload([
            'kind' => 'company',
            'name' => 'Mercado Central',
            'document' => $masked,
        ]))->assertStatus(201)->assertJsonPath('document', $cnpj);
    }

    /** C9: an invalid CNPJ -> 422. */
    public function test_c9_invalid_cnpj_is_rejected(): void
    {
        $this->actingAsNewCompanyMember();

        $this->postJson(self::ENDPOINT, $this->validCustomerPayload([
            'kind' => 'company',
            'name' => 'Mercado Central',
            'document' => '11111111111111',
        ]))->assertStatus(422)->assertJsonValidationErrors('document');
    }

    /** C10: a CPF with kind=company -> 422. */
    public function test_c10_cpf_with_company_kind_is_rejected(): void
    {
        $this->actingAsNewCompanyMember();

        $this->postJson(self::ENDPOINT, $this->validCustomerPayload([
            'kind' => 'company',
            'name' => 'Mercado Central',
            'document' => Document::generateCpf(),
        ]))->assertStatus(422)->assertJsonValidationErrors('document');
    }

    /** C11: a CNPJ with kind=individual -> 422. */
    public function test_c11_cnpj_with_individual_kind_is_rejected(): void
    {
        $this->actingAsNewCompanyMember();

        $this->postJson(self::ENDPOINT, $this->validCustomerPayload([
            'kind' => 'individual',
            'document' => Document::generateCnpj(),
        ]))->assertStatus(422)->assertJsonValidationErrors('document');
    }

    /** C12: document is nullable and accepted. */
    public function test_c12_document_is_nullable(): void
    {
        $this->actingAsNewCompanyMember();

        $this->postJson(self::ENDPOINT, $this->validCustomerPayload(['document' => null]))
            ->assertStatus(201)
            ->assertJsonPath('document', null);
    }

    /** C13: a duplicated document within the same company -> 422. */
    public function test_c13_duplicate_document_same_company_is_rejected(): void
    {
        $this->actingAsNewCompanyMember();
        $cpf = Document::generateCpf();

        $this->postJson(self::ENDPOINT, $this->validCustomerPayload(['document' => $cpf]))->assertStatus(201);
        $this->postJson(self::ENDPOINT, $this->validCustomerPayload(['name' => 'Outro Nome', 'document' => $cpf]))
            ->assertStatus(422);
    }

    /** C14: the same document across different companies is allowed. */
    public function test_c14_same_document_across_companies_is_allowed(): void
    {
        $cpf = Document::generateCpf();

        $this->actingAsNewCompanyMember();
        $this->postJson(self::ENDPOINT, $this->validCustomerPayload(['document' => $cpf]))->assertStatus(201);

        $this->actingAsNewCompanyMember();
        $this->postJson(self::ENDPOINT, $this->validCustomerPayload(['document' => $cpf]))->assertStatus(201);
    }

    /** C15: a valid E.164 phone persists. */
    public function test_c15_valid_phone_persists(): void
    {
        $this->actingAsNewCompanyMember();

        $this->postJson(self::ENDPOINT, $this->validCustomerPayload(['phone' => '+5511988887777']))
            ->assertStatus(201)
            ->assertJsonPath('phone', '+5511988887777');
    }

    /** C16: an invalid phone -> 422. */
    public function test_c16_invalid_phone_is_rejected(): void
    {
        $this->actingAsNewCompanyMember();

        $this->postJson(self::ENDPOINT, $this->validCustomerPayload(['phone' => '(11) 99999-9999']))
            ->assertStatus(422)
            ->assertJsonValidationErrors('phone');
    }

    /** C17: email is normalized to lowercase/trim. */
    public function test_c17_email_is_normalized(): void
    {
        $this->actingAsNewCompanyMember();

        $this->postJson(self::ENDPOINT, $this->validCustomerPayload(['email' => '  Joao@EXAMPLE.com  ']))
            ->assertStatus(201)
            ->assertJsonPath('email', 'joao@example.com');
    }

    /** C18: hostile company_id/id fields -> 422. */
    public function test_c18_hostile_fields_are_rejected(): void
    {
        [$company] = $this->actingAsNewCompanyMember();

        foreach (['id' => (string) Str::uuid(), 'company_id' => $company->id] as $field => $value) {
            $this->postJson(self::ENDPOINT, $this->validCustomerPayload([$field => $value]))
                ->assertStatus(422)
                ->assertJsonValidationErrors($field);
        }
    }

    // ---------------------------------------------------------------
    // L1-L10: list / search / pagination
    // ---------------------------------------------------------------

    /** L1: default pagination. */
    public function test_l1_default_pagination(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $this->currentCompanyContext()->run($company, fn () => Customer::factory()->count(20)->create());

        $response = $this->getJson(self::ENDPOINT)->assertOk();

        $this->assertCount(15, $response->json('data'));
        $this->assertSame(20, $response->json('meta.total'));
    }

    /** L2: per_page is capped at a sane maximum. */
    public function test_l2_per_page_is_capped(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $this->currentCompanyContext()->run($company, fn () => Customer::factory()->count(150)->create());

        $response = $this->getJson(self::ENDPOINT.'?per_page=1000')->assertOk();

        $this->assertCount(100, $response->json('data'));
    }

    /** L3: deterministic ordering (name ASC, id ASC tiebreak). */
    public function test_l3_deterministic_ordering(): void
    {
        [$company, $user] = $this->makeCompanyWithMember();
        $this->currentCompanyContext()->run($company, function () {
            Customer::factory()->create(['name' => 'Zeca']);
            Customer::factory()->create(['name' => 'Ana']);
            Customer::factory()->create(['name' => 'Bruno']);
        });
        Sanctum::actingAs($user);

        $response = $this->getJson(self::ENDPOINT)->assertOk();
        $names = array_column($response->json('data'), 'name');
        $this->assertSame(['Ana', 'Bruno', 'Zeca'], $names);
    }

    /** L4: search by name. */
    public function test_l4_search_by_name(): void
    {
        [$company, $user] = $this->makeCompanyWithMember();
        $this->currentCompanyContext()->run($company, function () {
            Customer::factory()->create(['name' => 'Construtora Alfa']);
            Customer::factory()->create(['name' => 'Mercado Beta']);
        });
        Sanctum::actingAs($user);

        $response = $this->getJson(self::ENDPOINT.'?search=Alfa')->assertOk();
        $this->assertCount(1, $response->json('data'));
        $this->assertSame('Construtora Alfa', $response->json('data.0.name'));
    }

    /** L5: search by legal_name/trade_name. */
    public function test_l5_search_by_legal_and_trade_name(): void
    {
        [$company, $user] = $this->makeCompanyWithMember();
        $this->currentCompanyContext()->run($company, function () {
            Customer::factory()->company()->create(['legal_name' => 'Comercial Unica Ltda', 'trade_name' => 'Loja Unica']);
            Customer::factory()->company()->create(['legal_name' => 'Outra Empresa Ltda', 'trade_name' => 'Outra Loja']);
        });
        Sanctum::actingAs($user);

        $this->getJson(self::ENDPOINT.'?search=Unica')->assertOk()->assertJsonCount(1, 'data');
        $this->getJson(self::ENDPOINT.'?search=Loja Unica')->assertOk()->assertJsonCount(1, 'data');
    }

    /** L6: search by masked or canonical document. */
    public function test_l6_search_by_document(): void
    {
        [$company, $user] = $this->makeCompanyWithMember();
        $cpf = Document::generateCpf();
        $this->currentCompanyContext()->run($company, fn () => Customer::factory()->create(['document' => $cpf]));
        Sanctum::actingAs($user);

        $masked = substr($cpf, 0, 3).'.'.substr($cpf, 3, 3).'.'.substr($cpf, 6, 3).'-'.substr($cpf, 9, 2);
        $this->getJson(self::ENDPOINT.'?search='.urlencode($masked))->assertOk()->assertJsonCount(1, 'data');
        $this->getJson(self::ENDPOINT.'?search='.$cpf)->assertOk()->assertJsonCount(1, 'data');
    }

    /** L7: search by phone. */
    public function test_l7_search_by_phone(): void
    {
        [$company, $user] = $this->makeCompanyWithMember();
        $this->currentCompanyContext()->run($company, fn () => Customer::factory()->create(['phone' => '+5511977776666']));
        Sanctum::actingAs($user);

        $this->getJson(self::ENDPOINT.'?search=11977776666')->assertOk()->assertJsonCount(1, 'data');
    }

    /** L8: list returns primary_address, never the full addresses collection. */
    public function test_l8_list_returns_primary_address_only(): void
    {
        [$company, $user] = $this->makeCompanyWithMember();
        $this->currentCompanyContext()->run($company, function () {
            $customer = Customer::factory()->create();
            $customer->addresses()->create([
                'label' => 'Casa', 'type' => 'residential', 'is_primary' => true,
            ]);
            $customer->addresses()->create([
                'label' => 'Trabalho', 'type' => 'commercial', 'is_primary' => false,
            ]);
        });
        Sanctum::actingAs($user);

        $response = $this->getJson(self::ENDPOINT)->assertOk();
        $row = $response->json('data.0');
        $this->assertArrayNotHasKey('addresses', $row);
        $this->assertSame('Casa', $row['primary_address']['label']);
    }

    /** L9: show returns all addresses. */
    public function test_l9_show_returns_all_addresses(): void
    {
        [$company, $user] = $this->makeCompanyWithMember();
        $customerId = $this->currentCompanyContext()->run($company, function () {
            $customer = Customer::factory()->create();
            $customer->addresses()->create(['label' => 'Casa', 'type' => 'residential', 'is_primary' => true]);
            $customer->addresses()->create(['label' => 'Trabalho', 'type' => 'commercial', 'is_primary' => false]);

            return $customer->id;
        });
        Sanctum::actingAs($user);

        $response = $this->getJson(self::ENDPOINT."/{$customerId}")->assertOk();
        $this->assertCount(2, $response->json('addresses'));
    }

    /** L10: primary address comes first in show. */
    public function test_l10_primary_comes_first_in_show(): void
    {
        [$company, $user] = $this->makeCompanyWithMember();
        $customerId = $this->currentCompanyContext()->run($company, function () {
            $customer = Customer::factory()->create();
            $customer->addresses()->create(['label' => 'Trabalho', 'type' => 'commercial', 'is_primary' => false]);
            $customer->addresses()->create(['label' => 'Casa', 'type' => 'residential', 'is_primary' => true]);

            return $customer->id;
        });
        Sanctum::actingAs($user);

        $response = $this->getJson(self::ENDPOINT."/{$customerId}")->assertOk();
        $this->assertTrue($response->json('addresses.0.is_primary'));
    }

    // ---------------------------------------------------------------
    // X1-X6: soft delete
    // ---------------------------------------------------------------

    /** X1: DELETE -> 204. */
    public function test_x1_delete_returns_204(): void
    {
        [$company, $user] = $this->makeCompanyWithMember();
        $customerId = $this->currentCompanyContext()->run($company, fn () => Customer::factory()->create()->id);
        Sanctum::actingAs($user);

        $this->deleteJson(self::ENDPOINT."/{$customerId}")->assertStatus(204);
    }

    /** X2: deleted_at is populated. */
    public function test_x2_deleted_at_is_populated(): void
    {
        [$company, $user] = $this->makeCompanyWithMember();
        $customerId = $this->currentCompanyContext()->run($company, fn () => Customer::factory()->create()->id);
        Sanctum::actingAs($user);

        $this->deleteJson(self::ENDPOINT."/{$customerId}")->assertStatus(204);

        $deletedAt = $this->currentCompanyContext()->run(
            $company,
            fn () => Customer::withTrashed()->findOrFail($customerId)->deleted_at
        );
        $this->assertNotNull($deletedAt);
    }

    /** X3: a subsequent GET -> 404. */
    public function test_x3_get_after_delete_is_404(): void
    {
        [$company, $user] = $this->makeCompanyWithMember();
        $customerId = $this->currentCompanyContext()->run($company, fn () => Customer::factory()->create()->id);
        Sanctum::actingAs($user);

        $this->deleteJson(self::ENDPOINT."/{$customerId}")->assertStatus(204);
        $this->getJson(self::ENDPOINT."/{$customerId}")->assertStatus(404);
    }

    /** X4: the listing no longer contains the customer. */
    public function test_x4_list_no_longer_contains_customer(): void
    {
        [$company, $user] = $this->makeCompanyWithMember();
        $customerId = $this->currentCompanyContext()->run($company, fn () => Customer::factory()->create(['name' => 'Sumido'])->id);
        Sanctum::actingAs($user);

        $this->deleteJson(self::ENDPOINT."/{$customerId}")->assertStatus(204);

        $response = $this->getJson(self::ENDPOINT)->assertOk();
        $this->assertNotContains($customerId, array_column($response->json('data'), 'id'));
    }

    /** X5: no physical hard delete — the row still exists with withTrashed(). */
    public function test_x5_no_hard_delete(): void
    {
        [$company, $user] = $this->makeCompanyWithMember();
        $customerId = $this->currentCompanyContext()->run($company, fn () => Customer::factory()->create()->id);
        Sanctum::actingAs($user);

        $this->deleteJson(self::ENDPOINT."/{$customerId}")->assertStatus(204);

        $stillExists = $this->currentCompanyContext()->run(
            $company,
            fn () => Customer::withTrashed()->whereKey($customerId)->exists()
        );
        $this->assertTrue($stillExists);
    }

    /** X6: Company B cannot delete Company A's customer. */
    public function test_x6_company_b_cannot_delete_company_as_customer(): void
    {
        [$companyA] = $this->makeCompanyWithMember();
        $customerId = $this->currentCompanyContext()->run($companyA, fn () => Customer::factory()->create()->id);

        $this->actingAsNewCompanyMember();
        $this->deleteJson(self::ENDPOINT."/{$customerId}")->assertStatus(404);

        $stillExists = $this->currentCompanyContext()->run(
            $companyA,
            fn () => Customer::query()->whereKey($customerId)->exists()
        );
        $this->assertTrue($stillExists);
    }

    // ---------------------------------------------------------------
    // T1-T10: tenant isolation
    // ---------------------------------------------------------------

    /** T1: Company A never lists Company B's customers. */
    public function test_t1_company_a_does_not_list_company_bs_customers(): void
    {
        [$companyB] = $this->makeCompanyWithMember();
        $this->currentCompanyContext()->run($companyB, fn () => Customer::factory()->create(['name' => 'De B']));

        $this->actingAsNewCompanyMember();
        $response = $this->getJson(self::ENDPOINT)->assertOk();
        $this->assertSame(0, $response->json('meta.total'));
    }

    /** T2: Company A cannot show Company B's customer. */
    public function test_t2_company_a_cannot_show_company_bs_customer(): void
    {
        [$companyB] = $this->makeCompanyWithMember();
        $customerId = $this->currentCompanyContext()->run($companyB, fn () => Customer::factory()->create()->id);

        $this->actingAsNewCompanyMember();
        $this->getJson(self::ENDPOINT."/{$customerId}")->assertStatus(404);
    }

    /** T3: Company A cannot edit Company B's customer. */
    public function test_t3_company_a_cannot_edit_company_bs_customer(): void
    {
        [$companyB] = $this->makeCompanyWithMember();
        $customerId = $this->currentCompanyContext()->run($companyB, fn () => Customer::factory()->create(['name' => 'Original'])->id);

        $this->actingAsNewCompanyMember();
        $this->putJson(self::ENDPOINT."/{$customerId}", $this->validCustomerPayload(['name' => 'Hackeado']))
            ->assertStatus(404);

        $name = $this->currentCompanyContext()->run($companyB, fn () => Customer::query()->findOrFail($customerId)->name);
        $this->assertSame('Original', $name);
    }

    /** T4: Company A cannot delete Company B's customer (see also X6). */
    public function test_t4_company_a_cannot_delete_company_bs_customer(): void
    {
        [$companyB] = $this->makeCompanyWithMember();
        $customerId = $this->currentCompanyContext()->run($companyB, fn () => Customer::factory()->create()->id);

        $this->actingAsNewCompanyMember();
        $this->deleteJson(self::ENDPOINT."/{$customerId}")->assertStatus(404);
    }

    /** T5: Company A cannot list/access Company B's address (via the address endpoints). */
    public function test_t5_company_a_cannot_reach_company_bs_address(): void
    {
        [$companyB] = $this->makeCompanyWithMember();
        [$customerId, $addressId] = $this->currentCompanyContext()->run($companyB, function () {
            $customer = Customer::factory()->create();
            $address = $customer->addresses()->create(['label' => 'Casa', 'type' => 'residential', 'is_primary' => true]);

            return [$customer->id, $address->id];
        });

        $this->actingAsNewCompanyMember();
        $this->putJson(self::ENDPOINT."/{$customerId}/addresses/{$addressId}", $this->validAddressPayload())
            ->assertStatus(404);
    }

    /** T6: Company A cannot create an address for Company B's customer. */
    public function test_t6_company_a_cannot_create_address_for_company_bs_customer(): void
    {
        [$companyB] = $this->makeCompanyWithMember();
        $customerId = $this->currentCompanyContext()->run($companyB, fn () => Customer::factory()->create()->id);

        $this->actingAsNewCompanyMember();
        $this->postJson(self::ENDPOINT."/{$customerId}/addresses", $this->validAddressPayload())
            ->assertStatus(404);
    }

    /** T7: a job/console context without CurrentCompanyContext fails closed on queries. */
    public function test_t7_query_without_context_throws(): void
    {
        $this->currentCompanyContext()->clear();

        $this->expectException(\RuntimeException::class);
        Customer::query()->count();
    }

    /** T8: a company_id in the update payload never switches tenant. */
    public function test_t8_company_id_in_payload_never_switches_tenant(): void
    {
        [$companyA, $user] = $this->makeCompanyWithMember();
        [$companyB] = $this->makeCompanyWithMember();
        $customerId = $this->currentCompanyContext()->run($companyA, fn () => Customer::factory()->create()->id);
        Sanctum::actingAs($user);

        $this->putJson(self::ENDPOINT."/{$customerId}", $this->validCustomerPayload(['company_id' => $companyB->id]))
            ->assertStatus(422);
    }

    /** T9: the same document may exist across tenants (duplicate of C14, phrased as a tenant guarantee). */
    public function test_t9_same_document_exists_across_tenants(): void
    {
        $document = Document::generateCnpj();

        [$companyA] = $this->makeCompanyWithMember();
        $this->currentCompanyContext()->run($companyA, fn () => Customer::factory()->company()->create(['document' => $document]));

        [$companyB] = $this->makeCompanyWithMember();
        $created = $this->currentCompanyContext()->run($companyB, fn () => Customer::factory()->company()->create(['document' => $document]));

        $this->assertSame($document, $created->document);
    }

    /** T10: a random UUID cross-tenant route is indistinguishable from any other 404. */
    public function test_t10_random_uuid_cross_tenant_is_404(): void
    {
        $this->actingAsNewCompanyMember();

        $this->getJson(self::ENDPOINT.'/'.Str::uuid())->assertStatus(404);
    }
}
