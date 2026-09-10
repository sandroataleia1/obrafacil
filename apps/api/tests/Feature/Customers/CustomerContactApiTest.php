<?php

namespace Tests\Feature\Customers;

use App\Customers\CustomerService;
use App\Models\Customer;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\Feature\Customers\Concerns\InteractsWithCustomers;
use Tests\TestCase;

/**
 * BACKEND-04 addendum: K1-K18 (create Customer + contacts atomically),
 * KC1-KC12 (contact CRUD). Mirrors CustomerAddressApiTest exactly —
 * CustomerContact has the same primary-invariant architecture as
 * CustomerAddress.
 */
class CustomerContactApiTest extends TestCase
{
    use InteractsWithCustomers, RefreshDatabase;

    private const string ENDPOINT = '/api/v1/customers';

    // ---------------------------------------------------------------
    // K1-K18: create + contact
    // ---------------------------------------------------------------

    /** K1: a Customer without contacts is allowed. */
    public function test_k1_customer_without_contacts_is_allowed(): void
    {
        $this->actingAsNewCompanyMember();

        $this->postJson(self::ENDPOINT, $this->validCustomerPayload())
            ->assertStatus(201)
            ->assertJsonPath('contacts', []);
    }

    /** K2: Customer + 1 contact created atomically. */
    public function test_k2_customer_plus_one_contact_created_atomically(): void
    {
        $this->actingAsNewCompanyMember();

        $response = $this->postJson(self::ENDPOINT, $this->validCustomerPayload([
            'contacts' => [$this->validContactPayload()],
        ]))->assertStatus(201);

        $this->assertCount(1, $response->json('contacts'));
        $this->assertSame('Maria Souza', $response->json('contacts.0.name'));
    }

    /** K3: the single contact automatically becomes primary. */
    public function test_k3_single_contact_becomes_primary(): void
    {
        $this->actingAsNewCompanyMember();

        $response = $this->postJson(self::ENDPOINT, $this->validCustomerPayload([
            'contacts' => [$this->validContactPayload(['is_primary' => false])],
        ]))->assertStatus(201);

        $this->assertTrue($response->json('contacts.0.is_primary'));
    }

    /** K4: 2 contacts + exactly 1 primary -> success. */
    public function test_k4_two_contacts_exactly_one_primary_succeeds(): void
    {
        $this->actingAsNewCompanyMember();

        $response = $this->postJson(self::ENDPOINT, $this->validCustomerPayload([
            'contacts' => [
                $this->validContactPayload(['name' => 'João', 'is_primary' => true]),
                $this->validContactPayload(['name' => 'Pedro', 'is_primary' => false]),
            ],
        ]))->assertStatus(201);

        $this->assertCount(2, $response->json('contacts'));
    }

    /** K5: 2 contacts + zero primary -> 422. */
    public function test_k5_two_contacts_zero_primary_is_rejected(): void
    {
        $this->actingAsNewCompanyMember();

        $this->postJson(self::ENDPOINT, $this->validCustomerPayload([
            'contacts' => [
                $this->validContactPayload(['name' => 'João', 'is_primary' => false]),
                $this->validContactPayload(['name' => 'Pedro', 'is_primary' => false]),
            ],
        ]))->assertStatus(422)->assertJsonValidationErrors('contacts');
    }

    /** K6: 2 contacts + 2 primary -> 422. */
    public function test_k6_two_contacts_two_primary_is_rejected(): void
    {
        $this->actingAsNewCompanyMember();

        $this->postJson(self::ENDPOINT, $this->validCustomerPayload([
            'contacts' => [
                $this->validContactPayload(['name' => 'João', 'is_primary' => true]),
                $this->validContactPayload(['name' => 'Pedro', 'is_primary' => true]),
            ],
        ]))->assertStatus(422)->assertJsonValidationErrors('contacts');
    }

    /** K7: a valid E.164 phone persists. */
    public function test_k7_valid_phone_persists(): void
    {
        $this->actingAsNewCompanyMember();

        $response = $this->postJson(self::ENDPOINT, $this->validCustomerPayload([
            'contacts' => [$this->validContactPayload(['phone' => '+5531977776666'])],
        ]))->assertStatus(201);

        $this->assertSame('+5531977776666', $response->json('contacts.0.phone'));
    }

    /** K8: an invalid phone -> 422. */
    public function test_k8_invalid_phone_is_rejected(): void
    {
        $this->actingAsNewCompanyMember();

        $this->postJson(self::ENDPOINT, $this->validCustomerPayload([
            'contacts' => [$this->validContactPayload(['phone' => '(31) 99999-9999'])],
        ]))->assertStatus(422)->assertJsonValidationErrors('contacts.0.phone');
    }

    /** K9: a valid E.164 WhatsApp persists. */
    public function test_k9_valid_whatsapp_persists(): void
    {
        $this->actingAsNewCompanyMember();

        $response = $this->postJson(self::ENDPOINT, $this->validCustomerPayload([
            'contacts' => [$this->validContactPayload(['whatsapp' => '+5531988885555'])],
        ]))->assertStatus(201);

        $this->assertSame('+5531988885555', $response->json('contacts.0.whatsapp'));
    }

    /** K10: an invalid WhatsApp -> 422. */
    public function test_k10_invalid_whatsapp_is_rejected(): void
    {
        $this->actingAsNewCompanyMember();

        $this->postJson(self::ENDPOINT, $this->validCustomerPayload([
            'contacts' => [$this->validContactPayload(['whatsapp' => 'invalid'])],
        ]))->assertStatus(422)->assertJsonValidationErrors('contacts.0.whatsapp');
    }

    /** K11: email is normalized. */
    public function test_k11_email_is_normalized(): void
    {
        $this->actingAsNewCompanyMember();

        $response = $this->postJson(self::ENDPOINT, $this->validCustomerPayload([
            'contacts' => [$this->validContactPayload(['email' => '  Maria@EXAMPLE.com '])],
        ]))->assertStatus(201);

        $this->assertSame('maria@example.com', $response->json('contacts.0.email'));
    }

    /** K12: role persists. */
    public function test_k12_role_persists(): void
    {
        $this->actingAsNewCompanyMember();

        $response = $this->postJson(self::ENDPOINT, $this->validCustomerPayload([
            'contacts' => [$this->validContactPayload(['role' => 'Responsável pela obra'])],
        ]))->assertStatus(201);

        $this->assertSame('Responsável pela obra', $response->json('contacts.0.role'));
    }

    /** K13: department persists. */
    public function test_k13_department_persists(): void
    {
        $this->actingAsNewCompanyMember();

        $response = $this->postJson(self::ENDPOINT, $this->validCustomerPayload([
            'contacts' => [$this->validContactPayload(['department' => 'Financeiro'])],
        ]))->assertStatus(201);

        $this->assertSame('Financeiro', $response->json('contacts.0.department'));
    }

    /** K14: notes persists. */
    public function test_k14_notes_persists(): void
    {
        $this->actingAsNewCompanyMember();

        $response = $this->postJson(self::ENDPOINT, $this->validCustomerPayload([
            'contacts' => [$this->validContactPayload(['notes' => 'Responsável técnico'])],
        ]))->assertStatus(201);

        $this->assertSame('Responsável técnico', $response->json('contacts.0.notes'));
    }

    /**
     * K15: a failure in the contact rolls back the Customer + addresses +
     * contacts. Same technique as A14 — a genuine DB-level failure via a
     * temporarily broken schema, called through CustomerService directly.
     */
    public function test_k15_failure_in_contact_rolls_back_everything(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $service = app(CustomerService::class);

        DB::statement('ALTER TABLE customer_contacts RENAME COLUMN name TO name_renamed_for_k15_test');

        try {
            $this->currentCompanyContext()->run($company, function () use ($service) {
                $service->create([
                    'kind' => 'individual',
                    'name' => 'Rollback Test K15',
                    'addresses' => [
                        ['label' => 'Casa', 'type' => 'residential', 'is_primary' => true],
                    ],
                    'contacts' => [
                        ['name' => 'João', 'is_primary' => true],
                    ],
                ]);
            });
            $this->fail('Expected a QueryException from the broken contacts schema.');
        } catch (QueryException) {
            // expected
        } finally {
            DB::statement('ALTER TABLE customer_contacts RENAME COLUMN name_renamed_for_k15_test TO name');
        }

        $count = $this->currentCompanyContext()->run(
            $company,
            fn () => Customer::query()->where('name', 'Rollback Test K15')->count()
        );
        $this->assertSame(0, $count);
    }

    /** K16: hostile company_id/customer_id/id fields -> 422. */
    public function test_k16_hostile_fields_are_rejected(): void
    {
        $this->actingAsNewCompanyMember();

        foreach (['id', 'company_id', 'customer_id'] as $field) {
            $this->postJson(self::ENDPOINT, $this->validCustomerPayload([
                'contacts' => [array_merge($this->validContactPayload(), [$field => (string) Str::uuid()])],
            ]))->assertStatus(422)->assertJsonValidationErrors("contacts.0.{$field}");
        }
    }

    /** K17: show returns contacts. */
    public function test_k17_show_returns_contacts(): void
    {
        $this->actingAsNewCompanyMember();
        $customerId = $this->postJson(self::ENDPOINT, $this->validCustomerPayload([
            'contacts' => [$this->validContactPayload()],
        ]))->json('id');

        $response = $this->getJson(self::ENDPOINT."/{$customerId}")->assertOk();
        $this->assertCount(1, $response->json('contacts'));
    }

    /** K18: list returns only primary_contact, never all contacts. */
    public function test_k18_list_returns_primary_contact_only(): void
    {
        $this->actingAsNewCompanyMember();
        $this->postJson(self::ENDPOINT, $this->validCustomerPayload([
            'contacts' => [
                $this->validContactPayload(['name' => 'João', 'is_primary' => true]),
                $this->validContactPayload(['name' => 'Pedro', 'is_primary' => false]),
            ],
        ]))->assertStatus(201);

        $response = $this->getJson(self::ENDPOINT)->assertOk();
        $row = $response->json('data.0');
        $this->assertArrayNotHasKey('contacts', $row);
        $this->assertSame('João', $row['primary_contact']['name']);
    }

    // ---------------------------------------------------------------
    // KC1-KC12: contact CRUD
    // ---------------------------------------------------------------

    /** KC1: adding the first contact makes it primary automatically. */
    public function test_kc1_first_contact_becomes_primary(): void
    {
        $this->actingAsNewCompanyMember();
        $customerId = $this->postJson(self::ENDPOINT, $this->validCustomerPayload())->json('id');

        $response = $this->postJson(self::ENDPOINT."/{$customerId}/contacts", $this->validContactPayload())
            ->assertStatus(201);

        $this->assertTrue($response->json('is_primary'));
    }

    /** KC2: adding a second default contact is not primary. */
    public function test_kc2_second_default_contact_is_not_primary(): void
    {
        $this->actingAsNewCompanyMember();
        $customerId = $this->postJson(self::ENDPOINT, $this->validCustomerPayload())->json('id');
        $this->postJson(self::ENDPOINT."/{$customerId}/contacts", $this->validContactPayload(['name' => 'João']));

        $response = $this->postJson(self::ENDPOINT."/{$customerId}/contacts", $this->validContactPayload(['name' => 'Pedro']))
            ->assertStatus(201);

        $this->assertFalse($response->json('is_primary'));
    }

    /** KC3: switching primary happens atomically. */
    public function test_kc3_switching_primary_is_atomic(): void
    {
        $this->actingAsNewCompanyMember();
        $customerId = $this->postJson(self::ENDPOINT, $this->validCustomerPayload())->json('id');
        $first = $this->postJson(self::ENDPOINT."/{$customerId}/contacts", $this->validContactPayload(['name' => 'João']))->json();
        $second = $this->postJson(self::ENDPOINT."/{$customerId}/contacts", $this->validContactPayload(['name' => 'Pedro']))->json();

        $this->putJson(self::ENDPOINT."/{$customerId}/contacts/{$second['id']}", $this->validContactPayload(['name' => 'Pedro', 'is_primary' => true]))
            ->assertOk()
            ->assertJsonPath('is_primary', true);

        $contacts = $this->getJson(self::ENDPOINT."/{$customerId}")->json('contacts');
        $firstRow = collect($contacts)->firstWhere('id', $first['id']);
        $this->assertFalse($firstRow['is_primary']);
    }

    /** KC4: the database constraint allows at most one primary. */
    public function test_kc4_constraint_allows_at_most_one_primary(): void
    {
        [$company, $user] = $this->makeCompanyWithMember();
        $customerId = $this->currentCompanyContext()->run($company, fn () => Customer::factory()->create()->id);
        Sanctum::actingAs($user);

        $this->postJson(self::ENDPOINT."/{$customerId}/contacts", $this->validContactPayload(['name' => 'João']))->assertStatus(201);
        $this->postJson(self::ENDPOINT."/{$customerId}/contacts", $this->validContactPayload(['name' => 'Pedro']))->assertStatus(201);

        $primaryCount = $this->currentCompanyContext()->run(
            $company,
            fn () => Customer::query()->findOrFail($customerId)->contacts()->where('is_primary', true)->count()
        );
        $this->assertSame(1, $primaryCount);
    }

    /** KC5: update phone. */
    public function test_kc5_update_phone(): void
    {
        $this->actingAsNewCompanyMember();
        $customerId = $this->postJson(self::ENDPOINT, $this->validCustomerPayload())->json('id');
        $contact = $this->postJson(self::ENDPOINT."/{$customerId}/contacts", $this->validContactPayload())->json();

        $this->putJson(
            self::ENDPOINT."/{$customerId}/contacts/{$contact['id']}",
            $this->validContactPayload(['phone' => '+5531933332222'])
        )->assertOk()->assertJsonPath('phone', '+5531933332222');
    }

    /** KC6: update whatsapp. */
    public function test_kc6_update_whatsapp(): void
    {
        $this->actingAsNewCompanyMember();
        $customerId = $this->postJson(self::ENDPOINT, $this->validCustomerPayload())->json('id');
        $contact = $this->postJson(self::ENDPOINT."/{$customerId}/contacts", $this->validContactPayload())->json();

        $this->putJson(
            self::ENDPOINT."/{$customerId}/contacts/{$contact['id']}",
            $this->validContactPayload(['whatsapp' => '+5531944443333'])
        )->assertOk()->assertJsonPath('whatsapp', '+5531944443333');
    }

    /** KC7: update role/department. */
    public function test_kc7_update_role_and_department(): void
    {
        $this->actingAsNewCompanyMember();
        $customerId = $this->postJson(self::ENDPOINT, $this->validCustomerPayload())->json('id');
        $contact = $this->postJson(self::ENDPOINT."/{$customerId}/contacts", $this->validContactPayload())->json();

        $this->putJson(
            self::ENDPOINT."/{$customerId}/contacts/{$contact['id']}",
            $this->validContactPayload(['role' => 'Comprador', 'department' => 'Compras'])
        )->assertOk()
            ->assertJsonPath('role', 'Comprador')
            ->assertJsonPath('department', 'Compras');
    }

    /** KC8: active=false preserves the record. */
    public function test_kc8_inactive_preserves_record(): void
    {
        $this->actingAsNewCompanyMember();
        $customerId = $this->postJson(self::ENDPOINT, $this->validCustomerPayload())->json('id');
        $contact = $this->postJson(self::ENDPOINT."/{$customerId}/contacts", $this->validContactPayload())->json();

        $this->putJson(
            self::ENDPOINT."/{$customerId}/contacts/{$contact['id']}",
            $this->validContactPayload(['active' => false])
        )->assertOk()->assertJsonPath('active', false);

        $this->getJson(self::ENDPOINT."/{$customerId}")->assertOk()->assertJsonCount(1, 'contacts');
    }

    /** KC9: cannot unset primary inconsistently. */
    public function test_kc9_cannot_unset_primary_inconsistently(): void
    {
        $this->actingAsNewCompanyMember();
        $customerId = $this->postJson(self::ENDPOINT, $this->validCustomerPayload())->json('id');
        $first = $this->postJson(self::ENDPOINT."/{$customerId}/contacts", $this->validContactPayload(['name' => 'João']))->json();
        $this->postJson(self::ENDPOINT."/{$customerId}/contacts", $this->validContactPayload(['name' => 'Pedro']));

        $this->putJson(
            self::ENDPOINT."/{$customerId}/contacts/{$first['id']}",
            $this->validContactPayload(['name' => 'João', 'is_primary' => false])
        )->assertStatus(422)->assertJsonValidationErrors('is_primary');
    }

    /** KC10: cannot delete the primary contact when others exist. */
    public function test_kc10_cannot_delete_primary_when_others_exist(): void
    {
        $this->actingAsNewCompanyMember();
        $customerId = $this->postJson(self::ENDPOINT, $this->validCustomerPayload())->json('id');
        $first = $this->postJson(self::ENDPOINT."/{$customerId}/contacts", $this->validContactPayload(['name' => 'João']))->json();
        $this->postJson(self::ENDPOINT."/{$customerId}/contacts", $this->validContactPayload(['name' => 'Pedro']));

        $this->deleteJson(self::ENDPOINT."/{$customerId}/contacts/{$first['id']}")->assertStatus(422);
    }

    /** KC11: can delete the only contact. */
    public function test_kc11_can_delete_only_contact(): void
    {
        $this->actingAsNewCompanyMember();
        $customerId = $this->postJson(self::ENDPOINT, $this->validCustomerPayload())->json('id');
        $contact = $this->postJson(self::ENDPOINT."/{$customerId}/contacts", $this->validContactPayload())->json();

        $this->deleteJson(self::ENDPOINT."/{$customerId}/contacts/{$contact['id']}")->assertStatus(204);
    }

    /** KC12: cross-customer/cross-company contact id -> 404. */
    public function test_kc12_cross_customer_and_cross_company_contact_is_404(): void
    {
        [$company, $user] = $this->makeCompanyWithMember();
        Sanctum::actingAs($user);
        $customerA = $this->postJson(self::ENDPOINT, $this->validCustomerPayload(['name' => 'A']))->json('id');
        $customerB = $this->postJson(self::ENDPOINT, $this->validCustomerPayload(['name' => 'B']))->json('id');
        $contactOfB = $this->postJson(self::ENDPOINT."/{$customerB}/contacts", $this->validContactPayload())->json('id');

        // cross-customer, same company
        $this->putJson(self::ENDPOINT."/{$customerA}/contacts/{$contactOfB}", $this->validContactPayload())
            ->assertStatus(404);

        // cross-company
        [$companyC] = $this->makeCompanyWithMember();
        $customerIdC = $this->currentCompanyContext()->run($companyC, fn () => Customer::factory()->create()->id);
        $this->postJson(self::ENDPOINT."/{$customerIdC}/contacts", $this->validContactPayload())->assertStatus(404);
    }
}
