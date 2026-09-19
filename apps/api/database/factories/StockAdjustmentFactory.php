<?php

namespace Database\Factories;

use App\Enums\StockAdjustmentType;
use App\Models\Material;
use App\Models\Project;
use App\Models\StockAdjustment;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<StockAdjustment>
 */
class StockAdjustmentFactory extends Factory
{
    protected $model = StockAdjustment::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'project_id' => Project::factory(),
            'material_id' => Material::factory(),
            'type' => StockAdjustmentType::AdjustmentIn,
            'quantity' => fake()->randomFloat(3, 1, 50),
            'occurred_at' => now()->toDateString(),
            'reason' => null,
        ];
    }
}
