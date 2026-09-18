<?php

namespace Database\Factories;

use App\Models\Supplier;
use App\Support\Document;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Supplier>
 *
 * company_id is never set here — forced by BelongsToCompany's creating
 * hook from the active CurrentCompanyContext.
 */
class SupplierFactory extends Factory
{
    protected $model = Supplier::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'name' => fake()->company(),
            'document' => null,
            'contact_name' => fake()->optional()->name(),
            'phone' => null,
            'email' => fake()->optional()->companyEmail(),
            'address' => fake()->optional()->address(),
            'notes' => null,
            'active' => true,
        ];
    }

    public function withCpf(): static
    {
        return $this->state(fn () => ['document' => Document::generateCpf()]);
    }

    public function withCnpj(): static
    {
        return $this->state(fn () => ['document' => Document::generateCnpj()]);
    }

    public function inactive(): static
    {
        return $this->state(['active' => false]);
    }
}
