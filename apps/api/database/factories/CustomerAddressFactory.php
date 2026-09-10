<?php

namespace Database\Factories;

use App\Enums\CustomerAddressType;
use App\Models\Customer;
use App\Models\CustomerAddress;
use App\Support\BrazilianStates;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<CustomerAddress>
 *
 * company_id is never set here — see CustomerFactory's docblock.
 */
class CustomerAddressFactory extends Factory
{
    protected $model = CustomerAddress::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'customer_id' => Customer::factory(),
            'label' => 'Casa',
            'type' => CustomerAddressType::Residential,
            'postal_code' => fake()->numerify('########'),
            'street' => fake()->streetName(),
            'number' => (string) fake()->buildingNumber(),
            'complement' => null,
            'neighborhood' => fake()->citySuffix(),
            'city' => fake()->city(),
            'state' => fake()->randomElement(BrazilianStates::CODES),
            'reference_point' => null,
            'is_primary' => false,
        ];
    }

    public function primary(): static
    {
        return $this->state(['is_primary' => true]);
    }
}
