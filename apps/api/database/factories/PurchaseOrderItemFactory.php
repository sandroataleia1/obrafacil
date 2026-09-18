<?php

namespace Database\Factories;

use App\Enums\MaterialUnitCode;
use App\Models\Material;
use App\Models\PurchaseOrder;
use App\Models\PurchaseOrderItem;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<PurchaseOrderItem>
 *
 * company_id is never set here — forced by BelongsToCompany's creating
 * hook. `unit_code`/`unit_custom_label` default to a plain "un" snapshot,
 * mirroring MaterialFactory's own default — a real create always copies
 * these from the Material at insertion time (App\Purchases\
 * PurchaseOrderItemService::addItem()), tested separately via the HTTP API.
 */
class PurchaseOrderItemFactory extends Factory
{
    protected $model = PurchaseOrderItem::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'purchase_order_id' => PurchaseOrder::factory(),
            'material_id' => Material::factory(),
            'description' => fake()->words(3, true),
            'unit_code' => MaterialUnitCode::Un,
            'unit_custom_label' => null,
            'quantity' => fake()->randomFloat(3, 1, 100),
            'unit_price' => fake()->randomFloat(2, 1, 500),
        ];
    }
}
