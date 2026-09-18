<?php

namespace Database\Factories;

use App\Enums\MaterialUnitCode;
use App\Models\Material;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Material>
 *
 * company_id is never set here — forced by BelongsToCompany's creating
 * hook from the active CurrentCompanyContext (same as CatalogItemFactory).
 */
class MaterialFactory extends Factory
{
    protected $model = Material::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'name' => fake()->words(3, true),
            'unit_code' => MaterialUnitCode::Un,
            'unit_custom_label' => null,
            'notes' => fake()->optional()->sentence(),
            'active' => true,
        ];
    }

    public function other(string $customLabel = 'saco de 20kg'): static
    {
        return $this->state([
            'unit_code' => MaterialUnitCode::Other,
            'unit_custom_label' => $customLabel,
        ]);
    }

    public function inactive(): static
    {
        return $this->state(['active' => false]);
    }
}
