<?php

namespace Database\Factories;

use App\Enums\CustomerKind;
use App\Models\Customer;
use App\Support\Document;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Customer>
 *
 * company_id is never set here — forced by BelongsToCompany's creating
 * hook from the active CurrentCompanyContext.
 */
class CustomerFactory extends Factory
{
    protected $model = Customer::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'kind' => CustomerKind::Individual,
            'name' => fake()->name(),
            'legal_name' => null,
            'trade_name' => null,
            'document' => null,
            'phone' => null,
            'email' => fake()->unique()->safeEmail(),
            'notes' => null,
            'active' => true,
        ];
    }

    public function individual(): static
    {
        return $this->state(fn () => [
            'kind' => CustomerKind::Individual,
            'document' => Document::generateCpf(),
        ]);
    }

    public function company(): static
    {
        return $this->state(fn () => [
            'kind' => CustomerKind::Company,
            'name' => fake()->company(),
            'legal_name' => fake()->company().' Ltda',
            'trade_name' => fake()->company(),
            'document' => Document::generateCnpj(),
        ]);
    }

    public function inactive(): static
    {
        return $this->state(['active' => false]);
    }
}
