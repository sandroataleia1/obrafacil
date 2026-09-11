<?php

namespace Tests\Feature\ServiceOrders;

use App\Models\Company;
use App\Models\ServiceOrder;
use App\ServiceOrders\ServiceOrderService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Feature\ServiceOrders\Concerns\InteractsWithServiceOrders;
use Tests\TestCase;

/**
 * BACKEND-06 §31-35/§74. GET/PUT /api/v1/service-orders/settings.
 */
class ServiceOrderSettingsApiTest extends TestCase
{
    use InteractsWithServiceOrders, RefreshDatabase;

    /** S1: GET without a persisted row returns 0.00. */
    public function test_s1_get_without_row_returns_default(): void
    {
        $this->actingAsNewCompanyMember();

        $response = $this->getJson('/api/v1/service-orders/settings');

        $response->assertOk()->assertJson(['default_travel_fee' => '0.00']);
    }

    /** S2: GET does not persist a row as a side effect. */
    public function test_s2_get_does_not_write_a_row(): void
    {
        [$company] = $this->actingAsNewCompanyMember();

        $this->getJson('/api/v1/service-orders/settings')->assertOk();

        $this->currentCompanyContext()->run($company, function () {
            $this->assertDatabaseCount('service_order_settings', 0);
        });
    }

    /** S3: PUT 80.00 persists. */
    public function test_s3_put_persists(): void
    {
        $this->actingAsNewCompanyMember();

        $this->putJson('/api/v1/service-orders/settings', ['default_travel_fee' => '80.00'])
            ->assertOk()
            ->assertJson(['default_travel_fee' => '80.00']);

        $this->getJson('/api/v1/service-orders/settings')->assertJson(['default_travel_fee' => '80.00']);
    }

    /** S4: a negative value is rejected. */
    public function test_s4_negative_is_rejected(): void
    {
        $this->actingAsNewCompanyMember();

        $this->putJson('/api/v1/service-orders/settings', ['default_travel_fee' => '-1.00'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['default_travel_fee']);
    }

    /** S5: a hostile company_id in the payload is rejected/ignored. */
    public function test_s5_hostile_company_id_is_rejected(): void
    {
        $otherCompany = Company::factory()->create();
        $this->actingAsNewCompanyMember();

        $this->putJson('/api/v1/service-orders/settings', [
            'default_travel_fee' => '10.00',
            'company_id' => $otherCompany->id,
        ])->assertStatus(422)->assertJsonValidationErrors(['company_id']);
    }

    /** S6: Company A's setting never affects Company B's. */
    public function test_s6_companies_are_independent(): void
    {
        $this->actingAsNewCompanyMember();
        $this->putJson('/api/v1/service-orders/settings', ['default_travel_fee' => '80.00'])->assertOk();

        $this->actingAsNewCompanyMember();
        $this->getJson('/api/v1/service-orders/settings')->assertJson(['default_travel_fee' => '0.00']);
    }

    /** S7: creating an O.S. without travel_fee uses the company's current default. */
    public function test_s7_create_without_travel_fee_uses_default(): void
    {
        [$company, $user] = $this->actingAsNewCompanyMember();
        $this->putJson('/api/v1/service-orders/settings', ['default_travel_fee' => '80.00'])->assertOk();

        $this->currentCompanyContext()->run($company, function () use ($user) {
            [$customer, $address] = $this->makeCustomerWithAddressAndContact();

            $order = app(ServiceOrderService::class)->create([
                'customer_id' => $customer->id,
                'customer_address_id' => $address->id,
                'title' => 'Visita técnica',
            ], $user);

            $this->assertSame('80.00', (string) $order->travel_fee);
        });
    }

    /** S8: changing the default afterwards never changes an already-created O.S. */
    public function test_s8_changing_default_later_does_not_change_existing_order(): void
    {
        [$company, $user] = $this->actingAsNewCompanyMember();
        $this->putJson('/api/v1/service-orders/settings', ['default_travel_fee' => '80.00'])->assertOk();

        $orderId = $this->currentCompanyContext()->run($company, function () use ($user) {
            [$customer, $address] = $this->makeCustomerWithAddressAndContact();

            return app(ServiceOrderService::class)->create([
                'customer_id' => $customer->id,
                'customer_address_id' => $address->id,
                'title' => 'Visita técnica',
            ], $user)->id;
        });

        $this->putJson('/api/v1/service-orders/settings', ['default_travel_fee' => '200.00'])->assertOk();

        $this->currentCompanyContext()->run($company, function () use ($orderId) {
            $order = ServiceOrder::query()->findOrFail($orderId);
            $this->assertSame('80.00', (string) $order->travel_fee);
        });
    }
}
