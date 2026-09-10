<?php

namespace Tests\Feature\Customers;

use App\Customers\CustomerService;
use App\Models\Customer;
use App\Models\CustomerAddress;
use App\Support\Document;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Laravel\Sanctum\Sanctum;
use Tests\Feature\Customers\Concerns\InteractsWithCustomers;
use Tests\TestCase;

/**
 * BACKEND-04B: U1-U6 (document unique-violation -> ValidationException
 * mapping, real Postgres constraint, not mocked), S1-S5 (tenant-safe
 * contact search subquery).
 */
class CustomerHardeningApiTest extends TestCase
{
    use InteractsWithCustomers, RefreshDatabase;

    private const string ENDPOINT = '/api/v1/customers';

    // ---------------------------------------------------------------
    // U1-U6: document conflict mapping
    // ---------------------------------------------------------------

    /** U1: the common-case duplicate via HTTP is still 422 (the pre-check path). */
    public function test_u1_common_duplicate_via_http_is_422(): void
    {
        $this->actingAsNewCompanyMember();
        $cpf = Document::generateCpf();

        $this->postJson(self::ENDPOINT, $this->validCustomerPayload(['document' => $cpf]))->assertStatus(201);
        $this->postJson(self::ENDPOINT, $this->validCustomerPayload(['name' => 'Outro Nome', 'document' => $cpf]))
            ->assertStatus(422)
            ->assertJsonValidationErrors('document');
    }

    /**
     * U2: CustomerService::create() hitting the real
     * customers_company_document_unique constraint directly (bypassing
     * StoreCustomerRequest's pre-check entirely) converts the 23505 into a
     * ValidationException — proving the actual backstop, not just the
     * friendly pre-check. Never mocked: this is the real Postgres
     * partial unique index.
     */
    public function test_u2_service_create_converts_real_constraint_violation(): void
    {
        [$company] = $this->makeCompanyWithMember();
        $service = app(CustomerService::class);
        $cpf = Document::generateCpf();

        $this->currentCompanyContext()->run($company, function () use ($service, $cpf) {
            $service->create(['kind' => 'individual', 'name' => 'Primeiro', 'document' => $cpf]);

            try {
                $service->create(['kind' => 'individual', 'name' => 'Segundo', 'document' => $cpf]);
                $this->fail('Expected a ValidationException from the real unique constraint.');
            } catch (ValidationException $e) {
                $this->assertArrayHasKey('document', $e->errors());
            }
        });

        $count = $this->currentCompanyContext()->run(
            $company,
            fn () => Customer::query()->where('document', $cpf)->count()
        );
        $this->assertSame(1, $count);
    }

    /** U3: the same backstop applies to CustomerService::update() — a race landing after the FormRequest's pre-check. */
    public function test_u3_service_update_converts_real_constraint_violation(): void
    {
        [$company] = $this->makeCompanyWithMember();
        $service = app(CustomerService::class);
        $documentX = Document::generateCpf();
        $documentY = Document::generateCpf();

        $this->currentCompanyContext()->run($company, function () use ($service, $documentX, $documentY) {
            $service->create(['kind' => 'individual', 'name' => 'Customer A', 'document' => $documentX]);
            $customerB = $service->create(['kind' => 'individual', 'name' => 'Customer B', 'document' => $documentY]);

            try {
                $service->update($customerB, ['kind' => 'individual', 'name' => 'Customer B', 'document' => $documentX]);
                $this->fail('Expected a ValidationException from the real unique constraint.');
            } catch (ValidationException $e) {
                $this->assertArrayHasKey('document', $e->errors());
            }

            $this->assertSame($documentY, $customerB->fresh()->document);
        });
    }

    /** U4: a QueryException that is NOT the document unique violation is never converted to a validation error. */
    public function test_u4_unrelated_query_exception_is_not_converted(): void
    {
        [$company] = $this->makeCompanyWithMember();
        $service = app(CustomerService::class);
        $customer = $this->currentCompanyContext()->run(
            $company,
            fn () => $service->create(['kind' => 'individual', 'name' => 'Original'])
        );

        // Force a genuine, unrelated database failure (a broken schema) —
        // this must propagate as a real QueryException, never be
        // reinterpreted as a document conflict.
        DB::statement('ALTER TABLE customers RENAME COLUMN name TO name_renamed_for_u4_test');

        try {
            $this->currentCompanyContext()->run(
                $company,
                fn () => $service->update($customer, ['kind' => 'individual', 'name' => 'Renamed'])
            );
            $this->fail('Expected a QueryException from the broken schema.');
        } catch (QueryException $e) {
            // expected — never a ValidationException
            $this->assertNotInstanceOf(ValidationException::class, $e);
        } finally {
            DB::statement('ALTER TABLE customers RENAME COLUMN name_renamed_for_u4_test TO name');
        }
    }

    /** U5: the same document across different companies remains allowed (unaffected by the hardening). */
    public function test_u5_same_document_across_companies_still_allowed(): void
    {
        $cpf = Document::generateCpf();

        $this->actingAsNewCompanyMember();
        $this->postJson(self::ENDPOINT, $this->validCustomerPayload(['document' => $cpf]))->assertStatus(201);

        $this->actingAsNewCompanyMember();
        $this->postJson(self::ENDPOINT, $this->validCustomerPayload(['document' => $cpf]))->assertStatus(201);
    }

    /** U6: Customer + addresses + contacts remain rollback-safe when the real constraint rejects the create. */
    public function test_u6_create_remains_rollback_safe_on_conflict(): void
    {
        [$company] = $this->makeCompanyWithMember();
        $service = app(CustomerService::class);
        $cpf = Document::generateCpf();

        $this->currentCompanyContext()->run($company, function () use ($service, $cpf) {
            $service->create(['kind' => 'individual', 'name' => 'Primeiro', 'document' => $cpf]);

            try {
                $service->create([
                    'kind' => 'individual',
                    'name' => 'Rollback U6',
                    'document' => $cpf,
                    'addresses' => [['label' => 'Casa', 'type' => 'residential', 'is_primary' => true]],
                    'contacts' => [['name' => 'Contato', 'is_primary' => true]],
                ]);
                $this->fail('Expected a ValidationException.');
            } catch (ValidationException) {
                // expected
            }
        });

        $customerCount = $this->currentCompanyContext()->run(
            $company,
            fn () => Customer::query()->where('name', 'Rollback U6')->count()
        );
        $this->assertSame(0, $customerCount);

        $addressCount = $this->currentCompanyContext()->run(
            $company,
            fn () => CustomerAddress::query()->where('label', 'Casa')->count()
        );
        // Only the "Casa" address that would have belonged to the
        // rolled-back "Rollback U6" customer — none should exist.
        $this->assertSame(0, $addressCount);
    }

    // ---------------------------------------------------------------
    // S1-S5: tenant-safe contact search
    // ---------------------------------------------------------------

    /** S1: a normal, same-company contact still finds its customer. */
    public function test_s1_normal_contact_finds_customer(): void
    {
        [$company, $user] = $this->makeCompanyWithMember();
        $this->currentCompanyContext()->run($company, function () {
            $customer = Customer::factory()->create(['name' => 'Construtora ABC']);
            $customer->contacts()->create([
                'name' => 'João Pereira', 'is_primary' => true,
            ]);
        });
        Sanctum::actingAs($user);

        $response = $this->getJson(self::ENDPOINT.'?search=João')->assertOk();
        $this->assertCount(1, $response->json('data'));
        $this->assertSame('Construtora ABC', $response->json('data.0.name'));
    }

    /** S2: search by the contact's phone still works. */
    public function test_s2_search_by_contact_phone(): void
    {
        [$company, $user] = $this->makeCompanyWithMember();
        $this->currentCompanyContext()->run($company, function () {
            $customer = Customer::factory()->create(['name' => 'Construtora ABC']);
            $customer->contacts()->create([
                'name' => 'João', 'phone' => '+5531955554444', 'is_primary' => true,
            ]);
        });
        Sanctum::actingAs($user);

        $response = $this->getJson(self::ENDPOINT.'?search=31955554444')->assertOk();
        $this->assertCount(1, $response->json('data'));
    }

    /** S3: search by the contact's WhatsApp still works. */
    public function test_s3_search_by_contact_whatsapp(): void
    {
        [$company, $user] = $this->makeCompanyWithMember();
        $this->currentCompanyContext()->run($company, function () {
            $customer = Customer::factory()->create(['name' => 'Construtora ABC']);
            $customer->contacts()->create([
                'name' => 'João', 'whatsapp' => '+5531966663333', 'is_primary' => true,
            ]);
        });
        Sanctum::actingAs($user);

        $response = $this->getJson(self::ENDPOINT.'?search=31966663333')->assertOk();
        $this->assertCount(1, $response->json('data'));
    }

    /**
     * S4: a customer_contacts row whose company_id does NOT match its
     * customer's company_id (structurally corrupted — never producible
     * through the API, simulated by inserting directly) must never
     * surface a customer via search. Proves the search subquery is
     * fail-closed on the tenant boundary, not merely "correct given
     * well-formed data".
     */
    public function test_s4_mismatched_contact_company_id_does_not_leak(): void
    {
        [$companyA, $userA] = $this->makeCompanyWithMember();
        [$companyB] = $this->makeCompanyWithMember();

        $customerA = $this->currentCompanyContext()->run(
            $companyA,
            fn () => Customer::factory()->create(['name' => 'Cliente Legitimo A'])
        );

        // Deliberately corrupted row: customer_id points at Company A's
        // customer, but company_id claims Company B — never producible
        // through CustomerContactService (which always derives company_id
        // from CurrentCompanyContext), inserted directly to simulate data
        // corruption/a future bug elsewhere.
        DB::table('customer_contacts')->insert([
            'id' => (string) Str::uuid(),
            'company_id' => $companyB->id,
            'customer_id' => $customerA->id,
            'name' => 'Contato Secreto B',
            'is_primary' => false,
            'active' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        Sanctum::actingAs($userA);
        $response = $this->getJson(self::ENDPOINT.'?search=Contato Secreto B')->assertOk();

        $this->assertSame(0, $response->json('meta.total'));
    }

    /** S5: pagination has no duplicates even when multiple contacts of the same customer match. */
    public function test_s5_pagination_has_no_duplicates(): void
    {
        [$company, $user] = $this->makeCompanyWithMember();
        $this->currentCompanyContext()->run($company, function () {
            $customer = Customer::factory()->create(['name' => 'Multi Contato Ltda']);
            $customer->contacts()->create(['name' => 'Busca Alfa Um', 'is_primary' => true]);
            $customer->contacts()->create(['name' => 'Busca Alfa Dois', 'is_primary' => false]);
        });
        Sanctum::actingAs($user);

        $response = $this->getJson(self::ENDPOINT.'?search=Busca Alfa')->assertOk();
        $this->assertSame(1, $response->json('meta.total'));
        $this->assertCount(1, $response->json('data'));
    }
}
