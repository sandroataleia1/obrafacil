<?php

namespace Database\Factories;

use App\Enums\CustomerAddressType;
use App\Enums\ServiceOrderStatus;
use App\Models\Customer;
use App\Models\ServiceOrder;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<ServiceOrder>
 *
 * company_id is never set here — see CatalogItemFactory's docblock. This
 * factory is a convenience for tests that need "a ServiceOrder row
 * exists" (item CRUD, status actions) — it deliberately does NOT go
 * through ServiceOrderNumberAllocator (the real create flow, tested
 * separately via the HTTP API), so `number` here is just a fake unique
 * value, never authoritative sequencing behavior.
 */
class ServiceOrderFactory extends Factory
{
    protected $model = ServiceOrder::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $customer = Customer::factory()->create();
        $user = User::factory()->create();

        return [
            'number' => fake()->unique()->numberBetween(1, 999999),
            'status' => ServiceOrderStatus::Open,
            'customer_id' => $customer->id,
            'customer_address_id' => null,
            'customer_contact_id' => null,
            'responsible_user_id' => null,
            'title' => fake()->sentence(3),
            'description' => null,
            'customer_name' => $customer->name,
            'customer_document' => $customer->document,
            'customer_phone' => $customer->phone,
            'customer_email' => $customer->email,
            'execution_address_label' => 'Casa',
            'execution_address_type' => CustomerAddressType::Residential->value,
            'execution_postal_code' => null,
            'execution_street' => null,
            'execution_number' => null,
            'execution_complement' => null,
            'execution_neighborhood' => null,
            'execution_city' => null,
            'execution_state' => null,
            'execution_reference_point' => null,
            'contact_name' => null,
            'contact_role' => null,
            'contact_department' => null,
            'contact_phone' => null,
            'contact_whatsapp' => null,
            'contact_email' => null,
            'scheduled_start_at' => null,
            'scheduled_end_at' => null,
            'subtotal' => '0.00',
            'order_discount' => '0.00',
            'travel_fee' => '0.00',
            'total' => '0.00',
            'notes' => null,
            'created_by_user_id' => $user->id,
        ];
    }

    public function inProgress(): static
    {
        return $this->state(['status' => ServiceOrderStatus::InProgress, 'started_at' => now()]);
    }

    public function completed(): static
    {
        return $this->state(['status' => ServiceOrderStatus::Completed, 'completed_at' => now()]);
    }

    public function cancelled(): static
    {
        return $this->state([
            'status' => ServiceOrderStatus::Cancelled,
            'cancelled_at' => now(),
            'cancellation_reason' => 'Cancelado nos testes.',
        ]);
    }
}
