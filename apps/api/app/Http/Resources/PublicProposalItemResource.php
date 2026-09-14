<?php

namespace App\Http\Resources;

use App\Models\BudgetItem;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * PUBLIC — served from GET /proposals/{token} with no auth. Deliberately
 * excludes: company_id, catalog_item_id, type, calculator_type,
 * unit_cost, line_cost_total, calculation_snapshot (internal audit
 * detail) — a customer viewing a proposal only ever sees what they're
 * being sold and for how much. `line_discount` IS included (spec §29
 * explicitly lists it alongside quantity/unit/unit_price/line_total as
 * public-safe — it's a commercial term of the offer, not internal cost
 * data).
 *
 * @property BudgetItem $resource
 */
class PublicProposalItemResource extends JsonResource
{
    public static $wrap = null;

    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'code' => $this->code,
            'name' => $this->name,
            'unit' => $this->unit,
            'description' => $this->description,
            'quantity' => (string) $this->quantity,
            'unit_price' => (string) $this->unit_price,
            'line_discount' => (string) $this->line_discount,
            'line_total' => (string) $this->line_total,
            'sort_order' => $this->sort_order,
        ];
    }
}
