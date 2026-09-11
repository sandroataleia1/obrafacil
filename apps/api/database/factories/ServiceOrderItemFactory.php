<?php

namespace Database\Factories;

use App\Enums\CatalogItemType;
use App\Models\ServiceOrder;
use App\Models\ServiceOrderItem;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<ServiceOrderItem>
 *
 * company_id is never set here — see CatalogItemFactory's docblock.
 */
class ServiceOrderItemFactory extends Factory
{
    protected $model = ServiceOrderItem::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'service_order_id' => ServiceOrder::factory(),
            'catalog_item_id' => null,
            'type' => CatalogItemType::Service,
            'code' => null,
            'name' => fake()->words(3, true),
            'unit' => 'un',
            'description' => null,
            'quantity' => '1.000',
            'unit_price' => '100.00',
            'line_discount' => '0.00',
            'line_total' => '100.00',
            'notes' => null,
            'sort_order' => 0,
        ];
    }
}
