<?php

namespace App\Http\Resources;

use App\Models\PurchaseOrderItem;
use App\Purchases\PurchaseOrderCalculator;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * SUPPLY-API-01C §59/§71. `material.name` is a live relation; `description`
 * is the pedido's own commercial snapshot — they can legitimately diverge
 * over time, and that divergence is intentional. `line_total` is always
 * computed here, never read from a column.
 *
 * SUPPLY-API-01D §29/§62: `received_quantity`/`remaining_quantity`/
 * `fulfillment_status` are always DERIVED (App\Purchases\
 * PurchaseOrderFulfillmentService), never persisted columns. The caller
 * (controller) MUST have already attached a `fulfillment` array to this
 * Item instance — via `PurchaseOrderFulfillmentService::attachToOrders()`
 * — before wrapping it here, so this Resource never issues its own query
 * (zero N+1, §34/§63).
 *
 * @mixin PurchaseOrderItem
 */
class PurchaseOrderItemResource extends JsonResource
{
    public static $wrap = null;

    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'material' => [
                'id' => $this->material->id,
                'name' => $this->material->name,
                'active' => $this->material->active,
            ],
            'description' => $this->description,
            'unit_code' => $this->unit_code->value,
            'unit_custom_label' => $this->unit_custom_label,
            'quantity' => (string) $this->quantity,
            'unit_price' => (string) $this->unit_price,
            'line_total' => PurchaseOrderCalculator::lineTotal((string) $this->quantity, (string) $this->unit_price),
            'received_quantity' => $this->fulfillment['received_quantity'],
            'remaining_quantity' => $this->fulfillment['remaining_quantity'],
            'fulfillment_status' => $this->fulfillment['fulfillment_status'],
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
