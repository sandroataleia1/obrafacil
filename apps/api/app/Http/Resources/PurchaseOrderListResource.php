<?php

namespace App\Http\Resources;

use App\Models\PurchaseOrder;
use App\Purchases\PurchaseOrderCalculator;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * SUPPLY-API-01C §57/§60. ZERO `company_id`. `supplier`/`project` are live
 * relations. `total`/`items_count` are computed from the eager-loaded
 * `items` relation (quantity/unit_price only) — never a per-row N+1 query,
 * and never `round(SUM(...))` (§61: summed AFTER each line is rounded).
 *
 * SUPPLY-API-01D §30/§62: `fulfillment_status` is derived (App\Purchases\
 * PurchaseOrderFulfillmentService) — the controller MUST have already
 * called `attachToOrders()` on the whole paginated collection (one
 * aggregate query total, never one per row) before wrapping it here. The
 * full Receipt history is deliberately NOT included in the list (§30).
 *
 * @mixin PurchaseOrder
 */
class PurchaseOrderListResource extends JsonResource
{
    public static $wrap = null;

    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        $lineTotals = $this->items->map(
            fn ($item) => PurchaseOrderCalculator::lineTotal((string) $item->quantity, (string) $item->unit_price)
        );

        return [
            'id' => $this->id,
            'number' => $this->formattedNumber(),
            'commercial_status' => $this->commercial_status->value,
            'fulfillment_status' => $this->fulfillmentStatus,
            'supplier' => [
                'id' => $this->supplier->id,
                'name' => $this->supplier->name,
                'active' => $this->supplier->active,
            ],
            'project' => [
                'id' => $this->project->id,
                'number' => $this->project->formattedNumber(),
                'name' => $this->project->name,
            ],
            'order_date' => $this->order_date?->format('Y-m-d'),
            'expected_delivery_date' => $this->expected_delivery_date?->format('Y-m-d'),
            'items_count' => $this->items->count(),
            'total' => PurchaseOrderCalculator::total($lineTotals),
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
