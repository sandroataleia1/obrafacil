<?php

namespace App\Http\Resources;

use App\Models\BudgetItem;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @property BudgetItem $resource
 */
class BudgetItemResource extends JsonResource
{
    public static $wrap = null;

    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'source_type' => $this->source_type->value,
            'catalog_item_id' => $this->catalog_item_id,
            'type' => $this->type,
            'calculator_type' => $this->calculator_type,
            'code' => $this->code,
            'name' => $this->name,
            'unit' => $this->unit,
            'description' => $this->description,
            'quantity' => (string) $this->quantity,
            'unit_price' => (string) $this->unit_price,
            'unit_cost' => $this->unit_cost !== null ? (string) $this->unit_cost : null,
            'line_discount' => (string) $this->line_discount,
            'line_total' => (string) $this->line_total,
            'line_cost_total' => $this->line_cost_total !== null ? (string) $this->line_cost_total : null,
            'calculation_snapshot' => $this->calculation_snapshot,
            'notes' => $this->notes,
            'sort_order' => $this->sort_order,
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
