<?php

namespace Database\Factories;

use App\Enums\ProjectStatus;
use App\Models\Customer;
use App\Models\Project;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Project>
 *
 * company_id is never set here — force-set by BelongsToCompany from the
 * active CurrentCompanyContext, same as every other tenant factory. This
 * deliberately does NOT go through ProjectNumberAllocator (the real
 * create flow, tested separately via the HTTP API) — `number` here is
 * just a fake unique value, never authoritative sequencing behavior.
 * Defaults: planning, a valid Customer, no source Budget, no address, no
 * optional dates.
 */
class ProjectFactory extends Factory
{
    protected $model = Project::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'number' => fake()->unique()->numberBetween(1, 999999),
            'status' => ProjectStatus::Planning,
            'name' => fake()->words(3, true),
            'reference' => null,
            'customer_id' => Customer::factory(),
            'customer_address_id' => null,
            'address_postal_code' => null,
            'address_street' => null,
            'address_number' => null,
            'address_complement' => null,
            'address_neighborhood' => null,
            'address_city' => null,
            'address_state' => null,
            'address_reference_point' => null,
            'expected_start_date' => null,
            'expected_end_date' => null,
            'source_budget_id' => null,
        ];
    }
}
