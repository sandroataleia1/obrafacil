<?php

namespace Tests\Feature\Customers;

use App\Customers\CustomerService;
use App\Models\Customer;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\Feature\Customers\Concerns\InteractsWithCustomers;
use Tests\TestCase;

/**
 * BACKEND-04: A1-A14 (create Customer + addresses atomically),
 * D1-D14 (address CRUD).
 */
class CustomerAddressApiTest extends TestCase
{
    use InteractsWithCustomers, RefreshDatabase;

    private const string ENDPOINT = '/api/v1/customers';

    // ---------------------------------------------------------------
    // A1-A14: create + address
    // ---------------------------------------------------------------

    /** A1: a Customer without addresses is allowed. */
    public function test_a1_customer_without_addresses_is_allowed(): void
    {
        $this->actingAsNewCompanyMember();

        $this->postJson(self::ENDPOINT, $this->validCustomerPayload())
            ->assertStatus(201)
            ->assertJsonPath('addresses', []);
    }

    /** A2: Customer + 1 address created atomically. */
    public function test_a2_customer_plus_one_address_created_atomically(): void
    {
        $this->actingAsNewCompanyMember();

        $response = $this->postJson(self::ENDPOINT, $this->validCustomerPayload([
            'addresses' => [$this->validAddressPayload()],
        ]))->assertStatus(201);

        $this->assertCount(1, $response->json('addresses'));
        $this->assertSame('Casa', $response->json('addresses.0.label'));
    }

    /** A3: the single address automatically becomes primary. */
    public function test_a3_single_address_becomes_primary(): void
    {
        $this->actingAsNewCompanyMember();

        $response = $this->postJson(self::ENDPOINT, $this->validCustomerPayload([
            'addresses' => [$this->validAddressPayload(['is_primary' => false])],
        ]))->assertStatus(201);

        $this->assertTrue($response->json('addresses.0.is_primary'));
    }

    /** A4: 2 addresses + exactly 1 primary -> success. */
    public function test_a4_two_addresses_exactly_one_primary_succeeds(): void
    {
        $this->actingAsNewCompanyMember();

        $response = $this->postJson(self::ENDPOINT, $this->validCustomerPayload([
            'addresses' => [
                $this->validAddressPayload(['label' => 'Casa', 'is_primary' => true]),
                $this->validAddressPayload(['label' => 'Trabalho', 'is_primary' => false]),
            ],
        ]))->assertStatus(201);

        $this->assertCount(2, $response->json('addresses'));
    }

    /** A5: 2 addresses + zero primary -> 422. */
    public function test_a5_two_addresses_zero_primary_is_rejected(): void
    {
        $this->actingAsNewCompanyMember();

        $this->postJson(self::ENDPOINT, $this->validCustomerPayload([
            'addresses' => [
                $this->validAddressPayload(['label' => 'Casa', 'is_primary' => false]),
                $this->validAddressPayload(['label' => 'Trabalho', 'is_primary' => false]),
            ],
        ]))->assertStatus(422)->assertJsonValidationErrors('addresses');
    }

    /** A6: 2 addresses + 2 primary -> 422. */
    public function test_a6_two_addresses_two_primary_is_rejected(): void
    {
        $this->actingAsNewCompanyMember();

        $this->postJson(self::ENDPOINT, $this->validCustomerPayload([
            'addresses' => [
                $this->validAddressPayload(['label' => 'Casa', 'is_primary' => true]),
                $this->validAddressPayload(['label' => 'Trabalho', 'is_primary' => true]),
            ],
        ]))->assertStatus(422)->assertJsonValidationErrors('addresses');
    }

    /** A7: a masked CEP persists as 8 digits. */
    public function test_a7_masked_cep_persists_digits_only(): void
    {
        $this->actingAsNewCompanyMember();

        $response = $this->postJson(self::ENDPOINT, $this->validCustomerPayload([
            'addresses' => [$this->validAddressPayload(['postal_code' => '30140-110'])],
        ]))->assertStatus(201);

        $this->assertSame('30140110', $response->json('addresses.0.postal_code'));
    }

    /** A8: an invalid CEP -> 422. */
    public function test_a8_invalid_cep_is_rejected(): void
    {
        $this->actingAsNewCompanyMember();

        $this->postJson(self::ENDPOINT, $this->validCustomerPayload([
            'addresses' => [$this->validAddressPayload(['postal_code' => '123'])],
        ]))->assertStatus(422)->assertJsonValidationErrors('addresses.0.postal_code');
    }

    /** A9: a lowercase UF is uppercased. */
    public function test_a9_lowercase_uf_is_uppercased(): void
    {
        $this->actingAsNewCompanyMember();

        $response = $this->postJson(self::ENDPOINT, $this->validCustomerPayload([
            'addresses' => [$this->validAddressPayload(['state' => 'mg'])],
        ]))->assertStatus(201);

        $this->assertSame('MG', $response->json('addresses.0.state'));
    }

    /** A10: a non-existent UF -> 422. */
    public function test_a10_unknown_uf_is_rejected(): void
    {
        $this->actingAsNewCompanyMember();

        $this->postJson(self::ENDPOINT, $this->validCustomerPayload([
            'addresses' => [$this->validAddressPayload(['state' => 'XX'])],
        ]))->assertStatus(422)->assertJsonValidationErrors('addresses.0.state');
    }

    /** A11: complement persists. */
    public function test_a11_complement_persists(): void
    {
        $this->actingAsNewCompanyMember();

        $response = $this->postJson(self::ENDPOINT, $this->validCustomerPayload([
            'addresses' => [$this->validAddressPayload(['complement' => 'Apto 302'])],
        ]))->assertStatus(201);

        $this->assertSame('Apto 302', $response->json('addresses.0.complement'));
    }

    /** A12: reference_point persists. */
    public function test_a12_reference_point_persists(): void
    {
        $this->actingAsNewCompanyMember();

        $response = $this->postJson(self::ENDPOINT, $this->validCustomerPayload([
            'addresses' => [$this->validAddressPayload(['reference_point' => 'Ao lado da farmácia'])],
        ]))->assertStatus(201);

        $this->assertSame('Ao lado da farmácia', $response->json('addresses.0.reference_point'));
    }

    /** A13: label persists independently of type/complement. */
    public function test_a13_label_persists_independently(): void
    {
        $this->actingAsNewCompanyMember();

        $response = $this->postJson(self::ENDPOINT, $this->validCustomerPayload([
            'addresses' => [$this->validAddressPayload([
                'label' => 'Loja Centro',
                'type' => 'commercial',
                'complement' => 'Sala 203',
            ])],
        ]))->assertStatus(201);

        $this->assertSame('Loja Centro', $response->json('addresses.0.label'));
        $this->assertSame('commercial', $response->json('addresses.0.type'));
        $this->assertSame('Sala 203', $response->json('addresses.0.complement'));
    }

    /**
     * A14: a failure in the second address rolls back the Customer + first
     * address. HTTP-level validation already rejects malformed address
     * data before any write happens, so it cannot exercise the actual
     * transaction boundary — this forces a genuine database-level failure
     * (a temporarily broken customer_addresses schema) by calling
     * CustomerService::create() directly, the same technique used in
     * NOTIFICATIONS-API-01A's atomicity test.
     */
    public function test_a14_failure_in_second_address_rolls_back_everything(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $service = app(CustomerService::class);

        DB::statement('ALTER TABLE customer_addresses RENAME COLUMN label TO label_renamed_for_a14_test');

        try {
            $this->currentCompanyContext()->run($company, function () use ($service) {
                $service->create([
                    'kind' => 'individual',
                    'name' => 'Rollback Test',
                    'addresses' => [
                        ['label' => 'Casa', 'type' => 'residential', 'is_primary' => true],
                        ['label' => 'Trabalho', 'type' => 'commercial', 'is_primary' => false],
                    ],
                ]);
            });
            $this->fail('Expected a QueryException from the broken addresses schema.');
        } catch (QueryException) {
            // expected
        } finally {
            DB::statement('ALTER TABLE customer_addresses RENAME COLUMN label_renamed_for_a14_test TO label');
        }

        $count = $this->currentCompanyContext()->run(
            $company,
            fn () => Customer::query()->where('name', 'Rollback Test')->count()
        );
        $this->assertSame(0, $count);
    }

    // ---------------------------------------------------------------
    // D1-D14: address CRUD
    // ---------------------------------------------------------------

    /** D1: adding the first address makes it primary automatically. */
    public function test_d1_first_address_becomes_primary(): void
    {
        $this->actingAsNewCompanyMember();
        $customerId = $this->postJson(self::ENDPOINT, $this->validCustomerPayload())->json('id');

        $response = $this->postJson(self::ENDPOINT."/{$customerId}/addresses", $this->validAddressPayload())
            ->assertStatus(201);

        $this->assertTrue($response->json('is_primary'));
    }

    /** D2: adding a second address (default) is not primary. */
    public function test_d2_second_default_address_is_not_primary(): void
    {
        $this->actingAsNewCompanyMember();
        $customerId = $this->postJson(self::ENDPOINT, $this->validCustomerPayload())->json('id');
        $this->postJson(self::ENDPOINT."/{$customerId}/addresses", $this->validAddressPayload(['label' => 'Casa']));

        $response = $this->postJson(self::ENDPOINT."/{$customerId}/addresses", $this->validAddressPayload(['label' => 'Trabalho']))
            ->assertStatus(201);

        $this->assertFalse($response->json('is_primary'));
    }

    /** D3: marking the second as primary flips the first to false. */
    public function test_d3_marking_second_primary_flips_first(): void
    {
        $this->actingAsNewCompanyMember();
        $customerId = $this->postJson(self::ENDPOINT, $this->validCustomerPayload())->json('id');
        $first = $this->postJson(self::ENDPOINT."/{$customerId}/addresses", $this->validAddressPayload(['label' => 'Casa']))->json();
        $second = $this->postJson(self::ENDPOINT."/{$customerId}/addresses", $this->validAddressPayload(['label' => 'Trabalho']))->json();

        $this->putJson(self::ENDPOINT."/{$customerId}/addresses/{$second['id']}", $this->validAddressPayload(['label' => 'Trabalho', 'is_primary' => true]))
            ->assertOk()
            ->assertJsonPath('is_primary', true);

        $firstNow = $this->getJson(self::ENDPOINT."/{$customerId}")->json('addresses');
        $firstRow = collect($firstNow)->firstWhere('id', $first['id']);
        $this->assertFalse($firstRow['is_primary']);
    }

    /** D4: the database constraint allows at most one primary. */
    public function test_d4_constraint_allows_at_most_one_primary(): void
    {
        [$company, $user] = $this->makeCompanyWithMember();
        $customerId = $this->currentCompanyContext()->run($company, fn () => Customer::factory()->create()->id);
        Sanctum::actingAs($user);

        $this->postJson(self::ENDPOINT."/{$customerId}/addresses", $this->validAddressPayload(['label' => 'Casa']))->assertStatus(201);
        $this->postJson(self::ENDPOINT."/{$customerId}/addresses", $this->validAddressPayload(['label' => 'Trabalho']))->assertStatus(201);

        $primaryCount = $this->currentCompanyContext()->run(
            $company,
            fn () => Customer::query()->findOrFail($customerId)->addresses()->where('is_primary', true)->count()
        );
        $this->assertSame(1, $primaryCount);
    }

    /** D5: update complement. */
    public function test_d5_update_complement(): void
    {
        $this->actingAsNewCompanyMember();
        $customerId = $this->postJson(self::ENDPOINT, $this->validCustomerPayload())->json('id');
        $address = $this->postJson(self::ENDPOINT."/{$customerId}/addresses", $this->validAddressPayload())->json();

        $this->putJson(
            self::ENDPOINT."/{$customerId}/addresses/{$address['id']}",
            $this->validAddressPayload(['complement' => 'Fundos'])
        )->assertOk()->assertJsonPath('complement', 'Fundos');
    }

    /** D6: update reference_point. */
    public function test_d6_update_reference_point(): void
    {
        $this->actingAsNewCompanyMember();
        $customerId = $this->postJson(self::ENDPOINT, $this->validCustomerPayload())->json('id');
        $address = $this->postJson(self::ENDPOINT."/{$customerId}/addresses", $this->validAddressPayload())->json();

        $this->putJson(
            self::ENDPOINT."/{$customerId}/addresses/{$address['id']}",
            $this->validAddressPayload(['reference_point' => 'Portão azul'])
        )->assertOk()->assertJsonPath('reference_point', 'Portão azul');
    }

    /** D7: update label. */
    public function test_d7_update_label(): void
    {
        $this->actingAsNewCompanyMember();
        $customerId = $this->postJson(self::ENDPOINT, $this->validCustomerPayload())->json('id');
        $address = $this->postJson(self::ENDPOINT."/{$customerId}/addresses", $this->validAddressPayload())->json();

        $this->putJson(
            self::ENDPOINT."/{$customerId}/addresses/{$address['id']}",
            $this->validAddressPayload(['label' => 'Casa da mãe'])
        )->assertOk()->assertJsonPath('label', 'Casa da mãe');
    }

    /** D8: update type. */
    public function test_d8_update_type(): void
    {
        $this->actingAsNewCompanyMember();
        $customerId = $this->postJson(self::ENDPOINT, $this->validCustomerPayload())->json('id');
        $address = $this->postJson(self::ENDPOINT."/{$customerId}/addresses", $this->validAddressPayload())->json();

        $this->putJson(
            self::ENDPOINT."/{$customerId}/addresses/{$address['id']}",
            $this->validAddressPayload(['type' => 'work_site'])
        )->assertOk()->assertJsonPath('type', 'work_site');
    }

    /** D9: cannot unset primary inconsistently (only address, other exists but tries false). */
    public function test_d9_cannot_unset_primary_inconsistently(): void
    {
        $this->actingAsNewCompanyMember();
        $customerId = $this->postJson(self::ENDPOINT, $this->validCustomerPayload())->json('id');
        $first = $this->postJson(self::ENDPOINT."/{$customerId}/addresses", $this->validAddressPayload(['label' => 'Casa']))->json();
        $this->postJson(self::ENDPOINT."/{$customerId}/addresses", $this->validAddressPayload(['label' => 'Trabalho']));

        $this->putJson(
            self::ENDPOINT."/{$customerId}/addresses/{$first['id']}",
            $this->validAddressPayload(['label' => 'Casa', 'is_primary' => false])
        )->assertStatus(422)->assertJsonValidationErrors('is_primary');
    }

    /** D10: cannot delete the primary address when another exists. */
    public function test_d10_cannot_delete_primary_when_others_exist(): void
    {
        $this->actingAsNewCompanyMember();
        $customerId = $this->postJson(self::ENDPOINT, $this->validCustomerPayload())->json('id');
        $first = $this->postJson(self::ENDPOINT."/{$customerId}/addresses", $this->validAddressPayload(['label' => 'Casa']))->json();
        $this->postJson(self::ENDPOINT."/{$customerId}/addresses", $this->validAddressPayload(['label' => 'Trabalho']));

        $this->deleteJson(self::ENDPOINT."/{$customerId}/addresses/{$first['id']}")->assertStatus(422);
    }

    /** D11: can delete the only address. */
    public function test_d11_can_delete_only_address(): void
    {
        $this->actingAsNewCompanyMember();
        $customerId = $this->postJson(self::ENDPOINT, $this->validCustomerPayload())->json('id');
        $address = $this->postJson(self::ENDPOINT."/{$customerId}/addresses", $this->validAddressPayload())->json();

        $this->deleteJson(self::ENDPOINT."/{$customerId}/addresses/{$address['id']}")->assertStatus(204);
    }

    /** D12: a cross-customer address id -> 404. */
    public function test_d12_cross_customer_address_is_404(): void
    {
        [$company, $user] = $this->makeCompanyWithMember();
        Sanctum::actingAs($user);
        $customerA = $this->postJson(self::ENDPOINT, $this->validCustomerPayload(['name' => 'A']))->json('id');
        $customerB = $this->postJson(self::ENDPOINT, $this->validCustomerPayload(['name' => 'B']))->json('id');
        $addressOfB = $this->postJson(self::ENDPOINT."/{$customerB}/addresses", $this->validAddressPayload())->json('id');

        $this->putJson(self::ENDPOINT."/{$customerA}/addresses/{$addressOfB}", $this->validAddressPayload())
            ->assertStatus(404);
        $this->deleteJson(self::ENDPOINT."/{$customerA}/addresses/{$addressOfB}")->assertStatus(404);
    }

    /** D13: a cross-company customer id -> 404 (see also T5/T6). */
    public function test_d13_cross_company_customer_is_404(): void
    {
        [$companyB] = $this->makeCompanyWithMember();
        $customerId = $this->currentCompanyContext()->run($companyB, fn () => Customer::factory()->create()->id);

        $this->actingAsNewCompanyMember();
        $this->postJson(self::ENDPOINT."/{$customerId}/addresses", $this->validAddressPayload())->assertStatus(404);
    }

    /** D14: hostile customer_id/company_id in the address payload -> 422. */
    public function test_d14_hostile_fields_in_address_payload_are_rejected(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $customerId = $this->postJson(self::ENDPOINT, $this->validCustomerPayload())->json('id');

        $this->postJson(self::ENDPOINT."/{$customerId}/addresses", $this->validAddressPayload(['customer_id' => $customerId]))
            ->assertStatus(422)
            ->assertJsonValidationErrors('customer_id');
        $this->postJson(self::ENDPOINT."/{$customerId}/addresses", $this->validAddressPayload(['company_id' => $company->id]))
            ->assertStatus(422)
            ->assertJsonValidationErrors('company_id');
    }
}
