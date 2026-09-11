<?php

namespace Tests\Feature\ServiceOrders;

use App\Models\Company;
use App\Models\Customer;
use App\Models\CustomerAddress;
use App\Models\CustomerContact;
use App\Models\ServiceOrder;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\Feature\ServiceOrders\Concerns\InteractsWithServiceOrders;
use Tests\TestCase;

/**
 * BACKEND-06 §37-38/§75. POST /api/v1/service-orders.
 */
class ServiceOrderCreateApiTest extends TestCase
{
    use InteractsWithServiceOrders, RefreshDatabase;

    /** C1: unauthenticated create is rejected. */
    public function test_c1_unauthenticated_create_is_rejected(): void
    {
        $this->postJson('/api/v1/service-orders', [])->assertStatus(401);
    }

    /** C2: a valid tenant member can create. */
    public function test_c2_valid_tenant_member_can_create(): void
    {
        $this->actingAsNewCompanyMember();
        [$customer, $address] = $this->makeCustomerWithAddressAndContact();

        $response = $this->postJson('/api/v1/service-orders', $this->validServiceOrderPayload([
            'customer_id' => $customer->id,
            'customer_address_id' => $address->id,
        ]));

        $response->assertStatus(201);
    }

    /** C3: a newly created O.S. always starts open. */
    public function test_c3_status_is_open(): void
    {
        $this->actingAsNewCompanyMember();
        [$customer, $address] = $this->makeCustomerWithAddressAndContact();

        $response = $this->postJson('/api/v1/service-orders', $this->validServiceOrderPayload([
            'customer_id' => $customer->id,
            'customer_address_id' => $address->id,
        ]));

        $response->assertJson(['status' => 'open']);
    }

    /** C4: the first O.S. of a company is OS-000001. */
    public function test_c4_number_is_os_000001(): void
    {
        $this->actingAsNewCompanyMember();
        [$customer, $address] = $this->makeCustomerWithAddressAndContact();

        $response = $this->postJson('/api/v1/service-orders', $this->validServiceOrderPayload([
            'customer_id' => $customer->id,
            'customer_address_id' => $address->id,
        ]));

        $response->assertJson(['number' => 'OS-000001']);
    }

    /** C5: the second O.S. of the same company is OS-000002. */
    public function test_c5_second_order_is_os_000002(): void
    {
        $this->actingAsNewCompanyMember();
        [$customer, $address] = $this->makeCustomerWithAddressAndContact();
        $payload = $this->validServiceOrderPayload(['customer_id' => $customer->id, 'customer_address_id' => $address->id]);

        $this->postJson('/api/v1/service-orders', $payload)->assertJson(['number' => 'OS-000001']);
        $this->postJson('/api/v1/service-orders', $payload)->assertJson(['number' => 'OS-000002']);
    }

    /** C6: Company B starts its own sequence at OS-000001. */
    public function test_c6_company_b_starts_at_os_000001(): void
    {
        $this->actingAsNewCompanyMember();
        [$customerA, $addressA] = $this->makeCustomerWithAddressAndContact();
        $this->postJson('/api/v1/service-orders', $this->validServiceOrderPayload([
            'customer_id' => $customerA->id,
            'customer_address_id' => $addressA->id,
        ]))->assertJson(['number' => 'OS-000001']);

        $this->actingAsNewCompanyMember();
        [$customerB, $addressB] = $this->makeCustomerWithAddressAndContact();
        $this->postJson('/api/v1/service-orders', $this->validServiceOrderPayload([
            'customer_id' => $customerB->id,
            'customer_address_id' => $addressB->id,
        ]))->assertJson(['number' => 'OS-000001']);
    }

    /** C7: customer_id is required. */
    public function test_c7_customer_is_required(): void
    {
        $this->actingAsNewCompanyMember();
        [, $address] = $this->makeCustomerWithAddressAndContact();

        $this->postJson('/api/v1/service-orders', $this->validServiceOrderPayload(['customer_address_id' => $address->id]))
            ->assertStatus(422)
            ->assertJsonValidationErrors(['customer_id']);
    }

    /** C8: customer_address_id is required. */
    public function test_c8_address_is_required(): void
    {
        $this->actingAsNewCompanyMember();
        [$customer] = $this->makeCustomerWithAddressAndContact();

        $this->postJson('/api/v1/service-orders', $this->validServiceOrderPayload(['customer_id' => $customer->id]))
            ->assertStatus(422)
            ->assertJsonValidationErrors(['customer_address_id']);
    }

    /** C9: the address must belong to the selected customer. */
    public function test_c9_address_must_belong_to_customer(): void
    {
        $this->actingAsNewCompanyMember();
        [$customer] = $this->makeCustomerWithAddressAndContact();
        [$otherCustomer, $otherAddress] = $this->currentCompanyContext()->run(Company::factory()->create(), function () {
            $otherCustomer = Customer::factory()->create();

            return [$otherCustomer, CustomerAddress::factory()->create(['customer_id' => $otherCustomer->id])];
        });

        $this->postJson('/api/v1/service-orders', $this->validServiceOrderPayload([
            'customer_id' => $customer->id,
            'customer_address_id' => $otherAddress->id,
        ]))->assertStatus(422)->assertJsonValidationErrors(['customer_address_id']);
    }

    /** C10: a cross-tenant customer_id is rejected as a generic 422. */
    public function test_c10_cross_tenant_customer_is_rejected(): void
    {
        $otherCustomer = $this->currentCompanyContext()->run(Company::factory()->create(), fn () => Customer::factory()->create());
        $this->actingAsNewCompanyMember();
        [, $address] = $this->makeCustomerWithAddressAndContact();

        $this->postJson('/api/v1/service-orders', $this->validServiceOrderPayload([
            'customer_id' => $otherCustomer->id,
            'customer_address_id' => $address->id,
        ]))->assertStatus(422)->assertJsonValidationErrors(['customer_id']);
    }

    /** C11: a cross-tenant customer_address_id is rejected as a generic 422. */
    public function test_c11_cross_tenant_address_is_rejected(): void
    {
        [$otherCustomer, $otherAddress] = $this->currentCompanyContext()->run(Company::factory()->create(), function () {
            $otherCustomer = Customer::factory()->create();

            return [$otherCustomer, CustomerAddress::factory()->create(['customer_id' => $otherCustomer->id])];
        });
        $this->actingAsNewCompanyMember();
        [$customer] = $this->makeCustomerWithAddressAndContact();

        $this->postJson('/api/v1/service-orders', $this->validServiceOrderPayload([
            'customer_id' => $customer->id,
            'customer_address_id' => $otherAddress->id,
        ]))->assertStatus(422)->assertJsonValidationErrors(['customer_address_id']);
    }

    /** C12: contact is optional. */
    public function test_c12_contact_is_optional(): void
    {
        $this->actingAsNewCompanyMember();
        [$customer, $address] = $this->makeCustomerWithAddressAndContact();

        $this->postJson('/api/v1/service-orders', $this->validServiceOrderPayload([
            'customer_id' => $customer->id,
            'customer_address_id' => $address->id,
        ]))->assertStatus(201)->assertJson(['contact' => null]);
    }

    /** C13: a contact belonging to a different customer is rejected. */
    public function test_c13_contact_of_another_customer_is_rejected(): void
    {
        $this->actingAsNewCompanyMember();
        [$customer, $address] = $this->makeCustomerWithAddressAndContact();
        $otherContact = $this->currentCompanyContext()->run(Company::factory()->create(), function () {
            $otherCustomer = Customer::factory()->create();

            return CustomerContact::factory()->create(['customer_id' => $otherCustomer->id]);
        });

        $this->postJson('/api/v1/service-orders', $this->validServiceOrderPayload([
            'customer_id' => $customer->id,
            'customer_address_id' => $address->id,
            'customer_contact_id' => $otherContact->id,
        ]))->assertStatus(422)->assertJsonValidationErrors(['customer_contact_id']);
    }

    /** C14: an inactive contact cannot be newly selected. */
    public function test_c14_inactive_contact_is_rejected(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        [$customer, $address] = $this->makeCustomerWithAddressAndContact();
        $inactiveContact = $this->currentCompanyContext()->run(
            $company,
            fn () => CustomerContact::factory()->inactive()->create(['customer_id' => $customer->id])
        );

        $this->postJson('/api/v1/service-orders', $this->validServiceOrderPayload([
            'customer_id' => $customer->id,
            'customer_address_id' => $address->id,
            'customer_contact_id' => $inactiveContact->id,
        ]))->assertStatus(422)->assertJsonValidationErrors(['customer_contact_id']);
    }

    /** C15: the customer snapshot is copied correctly. */
    public function test_c15_customer_snapshot_is_correct(): void
    {
        $this->actingAsNewCompanyMember();
        [$customer, $address] = $this->makeCustomerWithAddressAndContact([
            'name' => 'Fulano de Tal', 'document' => '52998224725', 'phone' => '+5511999999999', 'email' => 'fulano@example.com',
        ]);

        $response = $this->postJson('/api/v1/service-orders', $this->validServiceOrderPayload([
            'customer_id' => $customer->id,
            'customer_address_id' => $address->id,
        ]));

        $response->assertJson(['customer' => [
            'name' => 'Fulano de Tal',
            'document' => '52998224725',
            'phone' => '+5511999999999',
            'email' => 'fulano@example.com',
        ]]);
    }

    /** C16: the address snapshot is copied correctly. */
    public function test_c16_address_snapshot_is_correct(): void
    {
        $this->actingAsNewCompanyMember();
        [$customer, $address] = $this->makeCustomerWithAddressAndContact();
        $address->update(['label' => 'Galpão', 'city' => 'Contagem', 'state' => 'MG']);

        $response = $this->postJson('/api/v1/service-orders', $this->validServiceOrderPayload([
            'customer_id' => $customer->id,
            'customer_address_id' => $address->id,
        ]));

        $response->assertJson(['execution_address' => ['label' => 'Galpão', 'city' => 'Contagem', 'state' => 'MG']]);
    }

    /** C17: the contact snapshot is copied correctly. */
    public function test_c17_contact_snapshot_is_correct(): void
    {
        $this->actingAsNewCompanyMember();
        [$customer, $address, $contact] = $this->makeCustomerWithAddressAndContact();
        $contact->update(['name' => 'Engenheira Responsável', 'role' => 'Engenheira']);

        $response = $this->postJson('/api/v1/service-orders', $this->validServiceOrderPayload([
            'customer_id' => $customer->id,
            'customer_address_id' => $address->id,
            'customer_contact_id' => $contact->id,
        ]));

        $response->assertJson(['contact' => ['name' => 'Engenheira Responsável', 'role' => 'Engenheira']]);
    }

    /** C18: created_by is the authenticated user, server-side, never the payload. */
    public function test_c18_created_by_is_server_side(): void
    {
        [$company, $user] = $this->actingAsNewCompanyMember();
        [$customer, $address] = $this->makeCustomerWithAddressAndContact();

        $response = $this->postJson('/api/v1/service-orders', $this->validServiceOrderPayload([
            'customer_id' => $customer->id,
            'customer_address_id' => $address->id,
        ]));
        $orderId = $response->json('id');

        $this->currentCompanyContext()->run($company, function () use ($orderId, $user) {
            $order = ServiceOrder::query()->findOrFail($orderId);
            $this->assertSame($user->id, $order->created_by_user_id);
        });
    }

    /** C19: a member is accepted as responsible. */
    public function test_c19_member_responsible_is_accepted(): void
    {
        $this->actingAsNewCompanyMember();
        [$customer, $address] = $this->makeCustomerWithAddressAndContact();

        $this->postJson('/api/v1/service-orders', $this->validServiceOrderPayload([
            'customer_id' => $customer->id,
            'customer_address_id' => $address->id,
            'responsible_user_id' => auth()->id(),
        ]))->assertStatus(201);
    }

    /** C20: a non-member responsible_user_id is rejected. */
    public function test_c20_non_member_responsible_is_rejected(): void
    {
        $this->actingAsNewCompanyMember();
        [$customer, $address] = $this->makeCustomerWithAddressAndContact();
        $outsider = User::factory()->create();

        $this->postJson('/api/v1/service-orders', $this->validServiceOrderPayload([
            'customer_id' => $customer->id,
            'customer_address_id' => $address->id,
            'responsible_user_id' => $outsider->id,
        ]))->assertStatus(422)->assertJsonValidationErrors(['responsible_user_id']);
    }

    /** C21: project_id is prohibited. */
    public function test_c21_project_id_is_prohibited(): void
    {
        $this->actingAsNewCompanyMember();
        [$customer, $address] = $this->makeCustomerWithAddressAndContact();

        $this->postJson('/api/v1/service-orders', $this->validServiceOrderPayload([
            'customer_id' => $customer->id,
            'customer_address_id' => $address->id,
            'project_id' => (string) Str::uuid(),
        ]))->assertStatus(422)->assertJsonValidationErrors(['project_id']);
    }

    /** C22: a failure while adding an item rolls back the whole O.S. and its allocated number. */
    public function test_c22_item_failure_rolls_back_order_and_sequence(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        [$customer, $address] = $this->makeCustomerWithAddressAndContact();
        $inactiveCatalogItem = $this->makeCatalogItem(['active' => false]);

        $response = $this->postJson('/api/v1/service-orders', $this->validServiceOrderPayload([
            'customer_id' => $customer->id,
            'customer_address_id' => $address->id,
            'items' => [['catalog_item_id' => $inactiveCatalogItem->id, 'quantity' => '1.000']],
        ]));
        $response->assertStatus(422);

        $this->currentCompanyContext()->run($company, function () {
            $this->assertDatabaseCount('service_orders', 0);
            $sequenceRow = DB::table('service_order_sequences')->first();
            // Either no sequence row was ever created, or (if a prior
            // successful allocation already happened) next_number was
            // never advanced by this failed attempt.
            if ($sequenceRow !== null) {
                $this->assertSame(1, (int) $sequenceRow->next_number);
            }
        });

        // A subsequent successful create still gets OS-000001 — the
        // failed attempt never consumed a number.
        $this->postJson('/api/v1/service-orders', $this->validServiceOrderPayload([
            'customer_id' => $customer->id,
            'customer_address_id' => $address->id,
        ]))->assertJson(['number' => 'OS-000001']);
    }
}
