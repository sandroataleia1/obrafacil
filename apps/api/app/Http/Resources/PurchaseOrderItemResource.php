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
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
