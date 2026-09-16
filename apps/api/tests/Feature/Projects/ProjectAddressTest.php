<?php

namespace Tests\Feature\Projects;

use App\Models\Customer;
use App\Models\CustomerAddress;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Feature\Projects\Concerns\InteractsWithProjects;
use Tests\TestCase;

/**
 * PROJECT-API-01 §20-30/§59. PA1-PA12 — the Obra's own structured address
 * snapshot, its optional CustomerAddress origin, and how the two interact.
 */
class ProjectAddressTest extends TestCase
{
    use InteractsWithProjects, RefreshDatabase;

    private const string ENDPOINT = '/api/v1/projects';

    private function makeCustomerAddress(Customer $customer, array $overrides = []): CustomerAddress
    {
        return $this->currentCompanyContext()->run(
            $this->activeTestCompany,
            fn () => CustomerAddress::factory()->for($customer)->create(array_merge([
                'street' => 'Rua das Flores', 'number' => '123', 'complement' => 'Apto 1',
                'neighborhood' => 'Centro', 'city' => 'São Paulo', 'state' => 'SP',
                'postal_code' => '01310100', 'reference_point' => 'Perto do metrô',
            ], $overrides))
        );
    }

    /** PA1: a manual, fully structured address with no CustomerAddress origin. */
    public function test_pa1_manual_structured_address(): void
    {
        $this->actingAsNewCompanyMember();

        $response = $this->postJson(self::ENDPOINT, $this->validProjectPayload([
            'address' => [
                'postal_code' => '01310100', 'street' => 'Av. Paulista', 'number' => '1000',
                'complement' => null, 'neighborhood' => 'Bela Vista', 'city' => 'São Paulo',
                'state' => 'sp', 'reference_point' => 'Perto do MASP',
            ],
        ]))->assertStatus(201);

        $this->assertSame('Av. Paulista', $response->json('address.street'));
        $this->assertSame('SP', $response->json('address.state'));
        $this->assertNull($response->json('customer_address_id'));
    }

    /** PA2: customer_address_id alone copies the fields server-side. */
    public function test_pa2_customer_address_source_copies_fields(): void
    {
        $this->actingAsNewCompanyMember();
        $customer = $this->makeCustomer();
        $address = $this->makeCustomerAddress($customer);

        $response = $this->postJson(self::ENDPOINT, $this->validProjectPayload([
            'customer_id' => $customer->id,
            'customer_address_id' => $address->id,
        ]))->assertStatus(201);

        $this->assertSame($address->id, $response->json('customer_address_id'));
        $this->assertSame('Rua das Flores', $response->json('address.street'));
        $this->assertSame('01310100', $response->json('address.postal_code'));
        $this->assertSame('SP', $response->json('address.state'));
    }

    /** PA3: an explicit address overrides the copied values, even with a source selected. */
    public function test_pa3_explicit_address_overrides_copied_values(): void
    {
        $this->actingAsNewCompanyMember();
        $customer = $this->makeCustomer();
        $address = $this->makeCustomerAddress($customer);

        $response = $this->postJson(self::ENDPOINT, $this->validProjectPayload([
            'customer_id' => $customer->id,
            'customer_address_id' => $address->id,
            'address' => ['street' => 'Rua Corrigida', 'number' => '999'],
        ]))->assertStatus(201);

        $this->assertSame($address->id, $response->json('customer_address_id'));
        $this->assertSame('Rua Corrigida', $response->json('address.street'));
        $this->assertSame('999', $response->json('address.number'));
    }

    /** PA4: customer_address_id must belong to the selected Customer. */
    public function test_pa4_source_must_belong_to_selected_customer(): void
    {
        $this->actingAsNewCompanyMember();
        $customerA = $this->makeCustomer();
        $customerB = $this->makeCustomer();
        $addressOfB = $this->makeCustomerAddress($customerB);

        $this->postJson(self::ENDPOINT, $this->validProjectPayload([
            'customer_id' => $customerA->id,
            'customer_address_id' => $addressOfB->id,
        ]))->assertStatus(422)->assertJsonValidationErrors('customer_address_id');
    }

    /** PA5: customer_address_id must belong to the active Company (cross-tenant rejected). */
    public function test_pa5_source_must_belong_to_company(): void
    {
        $this->actingAsNewCompanyMember();
        $customer = $this->makeCustomer();
        $foreignAddress = $this->makeCustomerAddress($customer);

        $this->actingAsNewCompanyMember();
        $localCustomer = $this->makeCustomer();

        $this->postJson(self::ENDPOINT, $this->validProjectPayload([
            'customer_id' => $localCustomer->id,
            'customer_address_id' => $foreignAddress->id,
        ]))->assertStatus(422)->assertJsonValidationErrors('customer_address_id');
    }

    /** PA6: editing the CustomerAddress afterward never mutates the Project's already-copied address. */
    public function test_pa6_customer_address_later_edit_does_not_mutate_project(): void
    {
        $this->actingAsNewCompanyMember();
        $customer = $this->makeCustomer();
        $address = $this->makeCustomerAddress($customer);

        $created = $this->postJson(self::ENDPOINT, $this->validProjectPayload([
            'customer_id' => $customer->id,
            'customer_address_id' => $address->id,
        ]))->json();

        $this->currentCompanyContext()->run($this->activeTestCompany, function () use ($address) {
            $address->update(['street' => 'Rua Alterada Depois']);
        });

        $this->getJson(self::ENDPOINT."/{$created['id']}")->assertJsonPath('address.street', 'Rua das Flores');
    }

    /** PA7: deleting the CustomerAddress nulls the FK but preserves the copied address snapshot. */
    public function test_pa7_customer_address_delete_nulls_fk_but_preserves_address(): void
    {
        $this->actingAsNewCompanyMember();
        $customer = $this->makeCustomer();
        $address = $this->makeCustomerAddress($customer);

        $created = $this->postJson(self::ENDPOINT, $this->validProjectPayload([
            'customer_id' => $customer->id,
            'customer_address_id' => $address->id,
        ]))->json();

        $this->currentCompanyContext()->run($this->activeTestCompany, function () use ($address) {
            $address->delete();
        });

        $this->getJson(self::ENDPOINT."/{$created['id']}")
            ->assertJsonPath('customer_address_id', null)
            ->assertJsonPath('address.street', 'Rua das Flores');
    }

    /** PA8: updating the address via PUT works. */
    public function test_pa8_update_address_works(): void
    {
        $this->actingAsNewCompanyMember();
        $created = $this->postJson(self::ENDPOINT, $this->validProjectPayload())->json();

        $response = $this->putJson(self::ENDPOINT."/{$created['id']}", [
            'address' => ['street' => 'Rua Nova', 'city' => 'Curitiba', 'state' => 'PR'],
            'updated_at' => $created['updated_at'],
        ])->assertOk();

        $this->assertSame('Rua Nova', $response->json('address.street'));
        $this->assertSame('PR', $response->json('address.state'));
    }

    /** PA9: address=null clears the snapshot. */
    public function test_pa9_address_null_clears_snapshot(): void
    {
        $this->actingAsNewCompanyMember();
        $created = $this->postJson(self::ENDPOINT, $this->validProjectPayload([
            'address' => ['street' => 'Rua Antes'],
        ]))->json();

        $response = $this->putJson(self::ENDPOINT."/{$created['id']}", [
            'address' => null,
            'updated_at' => $created['updated_at'],
        ])->assertOk();

        $this->assertNull($response->json('address'));
    }

    /** PA10: changing the source without sending address copies the new source's fields. */
    public function test_pa10_source_change_without_address_copies_new_source(): void
    {
        $this->actingAsNewCompanyMember();
        $customer = $this->makeCustomer();
        $addressA = $this->makeCustomerAddress($customer, ['street' => 'Rua A']);
        $addressB = $this->makeCustomerAddress($customer, ['street' => 'Rua B']);

        $created = $this->postJson(self::ENDPOINT, $this->validProjectPayload([
            'customer_id' => $customer->id,
            'customer_address_id' => $addressA->id,
        ]))->json();

        $response = $this->putJson(self::ENDPOINT."/{$created['id']}", [
            'customer_address_id' => $addressB->id,
            'updated_at' => $created['updated_at'],
        ])->assertOk();

        $this->assertSame($addressB->id, $response->json('customer_address_id'));
        $this->assertSame('Rua B', $response->json('address.street'));
    }

    /** PA11: source=null (alone) preserves the existing address snapshot, only detaches the reference. */
    public function test_pa11_source_null_preserves_existing_snapshot(): void
    {
        $this->actingAsNewCompanyMember();
        $customer = $this->makeCustomer();
        $address = $this->makeCustomerAddress($customer, ['street' => 'Rua Preservada']);

        $created = $this->postJson(self::ENDPOINT, $this->validProjectPayload([
            'customer_id' => $customer->id,
            'customer_address_id' => $address->id,
        ]))->json();

        $response = $this->putJson(self::ENDPOINT."/{$created['id']}", [
            'customer_address_id' => null,
            'updated_at' => $created['updated_at'],
        ])->assertOk();

        $this->assertNull($response->json('customer_address_id'));
        $this->assertSame('Rua Preservada', $response->json('address.street'));
    }

    /** PA12: state is uppercased and postal_code is canonicalized to digits-only on write, regardless of display formatting. */
    public function test_pa12_state_and_cep_canonicalization(): void
    {
        $this->actingAsNewCompanyMember();

        $response = $this->postJson(self::ENDPOINT, $this->validProjectPayload([
            'address' => ['postal_code' => '01310-100', 'state' => 'sp'],
        ]))->assertStatus(201);

        $this->assertSame('SP', $response->json('address.state'));
        $this->assertSame('01310100', $response->json('address.postal_code'));
    }
}
