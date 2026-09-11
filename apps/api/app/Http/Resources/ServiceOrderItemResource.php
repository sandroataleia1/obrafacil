<?php

namespace App\Http\Resources;

use App\Models\ServiceOrderItem;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * §62. `company_id`/`service_order_id` are never exposed (redundant with
 * the parent ServiceOrder response). Money/quantity are always the
 * model's decimal-cast strings, never floats (§63).
 *
 * @property ServiceOrderItem $resource
 */
class ServiceOrderItemResource extends JsonResource
{
    public static $wrap = null;

    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'catalog_item_id' => $this->catalog_item_id,
            'type' => $this->type->value,
            'code' => $this->code,
            'name' => $this->name,
            'unit' => $this->unit,
            'description' => $this->description,
            'quantity' => $this->quantity,
            'unit_price' => $this->unit_price,
            'line_discount' => $this->line_discount,
            'line_total' => $this->line_total,
            'notes' => $this->notes,
            'sort_order' => $this->sort_order,
        ];
    }
}
