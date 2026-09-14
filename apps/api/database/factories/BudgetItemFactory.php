<?php

namespace Database\Factories;

use App\Enums\BudgetItemSourceType;
use App\Models\Budget;
use App\Models\BudgetItem;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<BudgetItem>
 *
 * company_id is never set here — see BudgetFactory's docblock.
 */
class BudgetItemFactory extends Factory
{
    protected $model = BudgetItem::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'budget_id' => Budget::factory(),
            'catalog_item_id' => null,
            'source_type' => BudgetItemSourceType::Manual,
            'type' => null,
            'calculator_type' => null,
            'code' => null,
            'name' => fake()->words(3, true),
            'unit' => 'un',
            'description' => null,
            'quantity' => '1.000',
            'unit_price' => '100.00',
            'unit_cost' => '60.00',
            'line_discount' => '0.00',
            'line_total' => '100.00',
            'line_cost_total' => '60.00',
            'calculation_snapshot' => null,
            'notes' => null,
            'sort_order' => 0,
        ];
    }
}
