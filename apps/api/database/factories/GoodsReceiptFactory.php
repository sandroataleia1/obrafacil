<?php

namespace Database\Factories;

use App\Models\GoodsReceipt;
use App\Models\PurchaseOrder;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<GoodsReceipt>
 *
 * company_id is never set here — forced by BelongsToCompany's creating
 * hook.
 */
class GoodsReceiptFactory extends Factory
{
    protected $model = GoodsReceipt::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'purchase_order_id' => PurchaseOrder::factory(),
            'received_at' => now()->toDateString(),
            'notes' => null,
        ];
    }
}
