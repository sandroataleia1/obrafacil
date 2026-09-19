<?php

namespace Database\Factories;

use App\Models\Material;
use App\Models\MaterialConsumption;
use App\Models\Project;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<MaterialConsumption>
 */
class MaterialConsumptionFactory extends Factory
{
    protected $model = MaterialConsumption::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'project_id' => Project::factory(),
            'material_id' => Material::factory(),
            'quantity' => fake()->randomFloat(3, 1, 50),
            'consumed_at' => now()->toDateString(),
            'notes' => null,
        ];
    }
}
