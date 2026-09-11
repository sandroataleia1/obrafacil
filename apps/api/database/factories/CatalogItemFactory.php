<?php

namespace Database\Factories;

use App\Enums\CatalogItemType;
use App\Models\CatalogItem;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<CatalogItem>
 *
 * company_id is never set here — forced by BelongsToCompany's creating
 * hook from the active CurrentCompanyContext (same as CustomerFactory).
 */
class CatalogItemFactory extends Factory
{
    protected $model = CatalogItem::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'type' => fake()->randomElement(CatalogItemType::cases()),
            'code' => null,
            'name' => fake()->words(3, true),
            'category' => fake()->randomElement(['Pintura', 'Elétrica', 'Hidráulica', 'Alvenaria', 'Acabamento']),
            'unit' => fake()->randomElement(['un', 'm', 'm²', 'm³', 'kg', 'h', 'diária']),
            'description' => fake()->optional()->sentence(),
            'cost_price' => fake()->randomFloat(2, 0, 5000),
            'sale_price' => fake()->randomFloat(2, 0, 5000),
            'active' => true,
        ];
    }

    public function product(): static
    {
        return $this->state(['type' => CatalogItemType::Product]);
    }

    public function service(): static
    {
        return $this->state(['type' => CatalogItemType::Service]);
    }

    public function inactive(): static
    {
        return $this->state(['active' => false]);
    }
}
