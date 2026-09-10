<?php

namespace Database\Factories;

use App\Models\Customer;
use App\Models\CustomerContact;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<CustomerContact>
 *
 * company_id is never set here — see CustomerFactory's docblock.
 */
class CustomerContactFactory extends Factory
{
    protected $model = CustomerContact::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'customer_id' => Customer::factory(),
            'name' => fake()->name(),
            'role' => 'Responsável',
            'department' => null,
            'phone' => null,
            'whatsapp' => null,
            'email' => fake()->unique()->safeEmail(),
            'notes' => null,
            'is_primary' => false,
            'active' => true,
        ];
    }

    public function primary(): static
    {
        return $this->state(['is_primary' => true]);
    }

    public function inactive(): static
    {
        return $this->state(['active' => false]);
    }
}
