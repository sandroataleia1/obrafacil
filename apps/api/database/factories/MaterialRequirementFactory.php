<?php

namespace Database\Factories;

use App\Models\Material;
use App\Models\MaterialRequirement;
use App\Models\Project;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<MaterialRequirement>
 *
 * company_id is never set here — forced by BelongsToCompany's creating
 * hook from the active CurrentCompanyContext, same as every other tenant
 * factory.
 */
class MaterialRequirementFactory extends Factory
{
    protected $model = MaterialRequirement::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'project_id' => Project::factory(),
            'material_id' => Material::factory(),
            'required_quantity' => fake()->randomFloat(3, 1, 500),
            'notes' => null,
        ];
    }
}
