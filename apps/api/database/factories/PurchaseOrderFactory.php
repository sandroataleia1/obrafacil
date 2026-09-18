<?php

namespace Database\Factories;

use App\Enums\PurchaseOrderCommercialStatus;
use App\Models\Project;
use App\Models\PurchaseOrder;
use App\Models\Supplier;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<PurchaseOrder>
 *
 * company_id is never set here — forced by BelongsToCompany's creating
 * hook. `number` here is just a fake unique value, never authoritative
 * sequencing behavior (the real create flow goes through
 * PurchaseOrderNumberAllocator, tested separately via the HTTP API).
 */
class PurchaseOrderFactory extends Factory
{
    protected $model = PurchaseOrder::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'number' => fake()->unique()->numberBetween(1, 999999),
            'supplier_id' => Supplier::factory(),
            'project_id' => Project::factory(),
            'order_date' => now()->toDateString(),
            'expected_delivery_date' => null,
            'commercial_status' => PurchaseOrderCommercialStatus::Draft,
            'notes' => null,
        ];
    }

    public function ordered(): static
    {
        return $this->state(['commercial_status' => PurchaseOrderCommercialStatus::Ordered]);
    }

    public function cancelled(): static
    {
        return $this->state(['commercial_status' => PurchaseOrderCommercialStatus::Cancelled]);
    }
}
