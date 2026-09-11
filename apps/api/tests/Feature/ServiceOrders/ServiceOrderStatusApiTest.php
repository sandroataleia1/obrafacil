<?php

namespace Tests\Feature\ServiceOrders;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Feature\ServiceOrders\Concerns\InteractsWithServiceOrders;
use Tests\TestCase;

/**
 * BACKEND-06 §48-52/§79. POST start/complete/cancel.
 */
class ServiceOrderStatusApiTest extends TestCase
{
    use InteractsWithServiceOrders, RefreshDatabase;

    private function createOpenOrder(): string
    {
        $this->actingAsNewCompanyMember();
        [$customer, $address] = $this->makeCustomerWithAddressAndContact();

        return $this->postJson('/api/v1/service-orders', $this->validServiceOrderPayload([
            'customer_id' => $customer->id,
            'customer_address_id' => $address->id,
        ]))->json('id');
    }

    /** ST1: a created O.S. starts as open. */
    public function test_st1_create_is_open(): void
    {
        $orderId = $this->createOpenOrder();

        $this->getJson("/api/v1/service-orders/{$orderId}")->assertJson(['status' => 'open']);
    }

    /** ST2: open -> in_progress via start. */
    public function test_st2_open_to_in_progress(): void
    {
        $orderId = $this->createOpenOrder();

        $this->postJson("/api/v1/service-orders/{$orderId}/start")->assertOk()->assertJson(['status' => 'in_progress']);
    }

    /** ST3: start sets started_at. */
    public function test_st3_start_sets_started_at(): void
    {
        $orderId = $this->createOpenOrder();

        $response = $this->postJson("/api/v1/service-orders/{$orderId}/start");
        $this->assertNotNull($response->json('started_at'));
    }

    /** ST4: starting an already in_progress order is rejected. */
    public function test_st4_repeat_start_is_rejected(): void
    {
        $orderId = $this->createOpenOrder();
        $this->postJson("/api/v1/service-orders/{$orderId}/start")->assertOk();

        $this->postJson("/api/v1/service-orders/{$orderId}/start")->assertStatus(409);
    }

    /** ST5: open -> completed is permitted directly. */
    public function test_st5_open_to_completed(): void
    {
        $orderId = $this->createOpenOrder();

        $this->postJson("/api/v1/service-orders/{$orderId}/complete")->assertOk()->assertJson(['status' => 'completed']);
    }

    /** ST6: in_progress -> completed is permitted. */
    public function test_st6_in_progress_to_completed(): void
    {
        $orderId = $this->createOpenOrder();
        $this->postJson("/api/v1/service-orders/{$orderId}/start")->assertOk();

        $this->postJson("/api/v1/service-orders/{$orderId}/complete")->assertOk()->assertJson(['status' => 'completed']);
    }

    /** ST7: complete sets completed_at. */
    public function test_st7_complete_sets_completed_at(): void
    {
        $orderId = $this->createOpenOrder();

        $response = $this->postJson("/api/v1/service-orders/{$orderId}/complete");
        $this->assertNotNull($response->json('completed_at'));
    }

    /** ST8: open -> cancelled is permitted. */
    public function test_st8_open_to_cancelled(): void
    {
        $orderId = $this->createOpenOrder();

        $this->postJson("/api/v1/service-orders/{$orderId}/cancel", ['reason' => 'Cliente desistiu'])
            ->assertOk()->assertJson(['status' => 'cancelled']);
    }

    /** ST9: in_progress -> cancelled is permitted. */
    public function test_st9_in_progress_to_cancelled(): void
    {
        $orderId = $this->createOpenOrder();
        $this->postJson("/api/v1/service-orders/{$orderId}/start")->assertOk();

        $this->postJson("/api/v1/service-orders/{$orderId}/cancel", ['reason' => 'Cliente desistiu'])
            ->assertOk()->assertJson(['status' => 'cancelled']);
    }

    /** ST10: cancel requires a reason. */
    public function test_st10_cancel_reason_is_required(): void
    {
        $orderId = $this->createOpenOrder();

        $this->postJson("/api/v1/service-orders/{$orderId}/cancel", [])
            ->assertStatus(422)->assertJsonValidationErrors(['reason']);
    }

    /** ST11: cancel sets cancelled_at and persists the reason. */
    public function test_st11_cancel_sets_cancelled_at_and_reason(): void
    {
        $orderId = $this->createOpenOrder();

        $response = $this->postJson("/api/v1/service-orders/{$orderId}/cancel", ['reason' => 'Cliente cancelou o atendimento']);

        $this->assertNotNull($response->json('cancelled_at'));
        $response->assertJson(['cancellation_reason' => 'Cliente cancelou o atendimento']);
    }

    /** ST12: completed is terminal — no further status action is allowed. */
    public function test_st12_completed_is_terminal(): void
    {
        $orderId = $this->createOpenOrder();
        $this->postJson("/api/v1/service-orders/{$orderId}/complete")->assertOk();

        $this->postJson("/api/v1/service-orders/{$orderId}/start")->assertStatus(409);
        $this->postJson("/api/v1/service-orders/{$orderId}/complete")->assertStatus(409);
        $this->postJson("/api/v1/service-orders/{$orderId}/cancel", ['reason' => 'x'])->assertStatus(409);
    }

    /** ST13: cancelled is terminal — no further status action is allowed. */
    public function test_st13_cancelled_is_terminal(): void
    {
        $orderId = $this->createOpenOrder();
        $this->postJson("/api/v1/service-orders/{$orderId}/cancel", ['reason' => 'x'])->assertOk();

        $this->postJson("/api/v1/service-orders/{$orderId}/start")->assertStatus(409);
        $this->postJson("/api/v1/service-orders/{$orderId}/complete")->assertStatus(409);
        $this->postJson("/api/v1/service-orders/{$orderId}/cancel", ['reason' => 'y'])->assertStatus(409);
    }

    /** ST14: status is prohibited in the generic PUT. */
    public function test_st14_status_is_prohibited_in_put(): void
    {
        $this->actingAsNewCompanyMember();
        [$customer, $address] = $this->makeCustomerWithAddressAndContact();
        $orderId = $this->postJson('/api/v1/service-orders', $this->validServiceOrderPayload([
            'customer_id' => $customer->id,
            'customer_address_id' => $address->id,
        ]))->json('id');

        $this->putJson("/api/v1/service-orders/{$orderId}", $this->validServiceOrderPayload([
            'customer_id' => $customer->id,
            'customer_address_id' => $address->id,
            'status' => 'completed',
        ]))->assertStatus(422)->assertJsonValidationErrors(['status']);
    }
}
