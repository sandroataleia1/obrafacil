<?php

namespace Tests\Feature\Projects;

use App\Models\Customer;
use App\Models\CustomerAddress;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Tests\Feature\Projects\Concerns\InteractsWithProjects;
use Tests\TestCase;

/**
 * PROJECT-API-01 §18-19/§30/§58. PC1-PC8 — the Customer relation is LIVE,
 * never a frozen snapshot (§18).
 */
class ProjectCustomerTest extends TestCase
{
    use InteractsWithProjects, RefreshDatabase;

    private const string ENDPOINT = '/api/v1/projects';

    /** PC1: the Customer relation is live — accessible via customer_id. */
    public function test_pc1_customer_relation_is_live(): void
    {
        $this->actingAsNewCompanyMember();
        $customer = $this->makeCustomer(['name' => 'Cliente Original']);

        $response = $this->postJson(self::ENDPOINT, $this->validProjectPayload(['customer_id' => $customer->id]))
            ->assertStatus(201);

        $this->assertSame($customer->id, $response->json('customer.id'));
        $this->assertSame('Cliente Original', $response->json('customer.name'));
    }

    /** PC2: renaming the Customer afterward is reflected in ProjectResource — no snapshot. */
    public function test_pc2_customer_rename_appears_in_project_resource(): void
    {
        $this->actingAsNewCompanyMember();
        $customer = $this->makeCustomer(['name' => 'Nome Antigo']);
        $id = $this->postJson(self::ENDPOINT, $this->validProjectPayload(['customer_id' => $customer->id]))->json('id');

        $this->currentCompanyContext()->run($this->activeTestCompany, function () use ($customer) {
            $customer->update(['name' => 'Nome Novo']);
        });

        $this->getJson(self::ENDPOINT."/{$id}")->assertJsonPath('customer.name', 'Nome Novo');
    }

    /** PC3: there is no customer_name column persisted anywhere on Project. */
    public function test_pc3_no_customer_name_column(): void
    {
        $this->assertFalse(Schema::hasColumn('projects', 'customer_name'));
    }

    /** PC4: an invalid/nonexistent Customer is rejected. */
    public function test_pc4_invalid_customer_rejected(): void
    {
        $this->actingAsNewCompanyMember();

        $this->postJson(self::ENDPOINT, $this->validProjectPayload(['customer_id' => (string) Str::uuid()]))
            ->assertStatus(422)
            ->assertJsonValidationErrors('customer_id');
    }

    /** PC5: an inactive Customer still works — Project follows the same policy as Budget/ServiceOrder (no active-only enforcement). */
    public function test_pc5_inactive_customer_follows_customer_policy(): void
    {
        $this->actingAsNewCompanyMember();
        $customer = $this->makeCustomer(['active' => false]);

        $this->postJson(self::ENDPOINT, $this->validProjectPayload(['customer_id' => $customer->id]))
            ->assertStatus(201);
    }

    /** PC6: updating to a different, valid Customer works. */
    public function test_pc6_update_to_valid_customer(): void
    {
        $this->actingAsNewCompanyMember();
        $created = $this->postJson(self::ENDPOINT, $this->validProjectPayload())->json();
        $newCustomer = $this->makeCustomer(['name' => 'Novo Cliente']);

        $response = $this->putJson(self::ENDPOINT."/{$created['id']}", [
            'customer_id' => $newCustomer->id,
            'updated_at' => $created['updated_at'],
        ])->assertOk();

        $this->assertSame($newCustomer->id, $response->json('customer.id'));
    }

    /** PC7: changing Customer detaches a customer_address_id that doesn't belong to the new Customer. */
    public function test_pc7_customer_change_detaches_incompatible_source_address(): void
    {
        $this->actingAsNewCompanyMember();
        $oldCustomer = $this->makeCustomer();
        $oldAddress = $this->currentCompanyContext()->run(
            $this->activeTestCompany,
            fn () => CustomerAddress::factory()->for($oldCustomer)->create(['street' => 'Rua Antiga'])
        );

        $created = $this->postJson(self::ENDPOINT, $this->validProjectPayload([
            'customer_id' => $oldCustomer->id,
            'customer_address_id' => $oldAddress->id,
        ]))->assertStatus(201)->json();

        $this->assertSame($oldAddress->id, $created['customer_address_id']);

        $newCustomer = $this->makeCustomer();
        $response = $this->putJson(self::ENDPOINT."/{$created['id']}", [
            'customer_id' => $newCustomer->id,
            'updated_at' => $created['updated_at'],
        ])->assertOk();

        $this->assertNull($response->json('customer_address_id'));
        // The physical address snapshot is preserved even though the
        // source reference was detached (§30).
        $this->assertSame('Rua Antiga', $response->json('address.street'));
    }

    /** PC8: the Project row itself remains fully intact after a Customer change. */
    public function test_pc8_project_remains_intact_after_customer_change(): void
    {
        $this->actingAsNewCompanyMember();
        $created = $this->postJson(self::ENDPOINT, $this->validProjectPayload([
            'name' => 'Obra Preservada',
            'reference' => 'Ref preservada',
        ]))->json();

        $newCustomer = $this->makeCustomer();
        $response = $this->putJson(self::ENDPOINT."/{$created['id']}", [
            'customer_id' => $newCustomer->id,
            'updated_at' => $created['updated_at'],
        ])->assertOk();

        $this->assertSame('Obra Preservada', $response->json('name'));
        $this->assertSame('Ref preservada', $response->json('reference'));
        $this->assertSame($created['id'], $response->json('id'));
        $this->assertSame($created['number'], $response->json('number'));
    }
}
