<?php

namespace App\Http\Resources;

use App\Models\Budget;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * The lean shape for GET /budgets — enough for a list UI without loading/
 * serializing items or the calculation_snapshot. `company_id` is never
 * exposed.
 *
 * @property Budget $resource
 */
class BudgetListResource extends JsonResource
{
    public static $wrap = null;

    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'number' => $this->formattedNumber(),
            'status' => $this->status->value,
            'title' => $this->title,
            'reference' => $this->reference,
            'customer' => [
                'id' => $this->customer_id,
                'name' => $this->customer_name,
            ],
            'sale_subtotal' => (string) $this->sale_subtotal,
            'margin_amount' => $this->margin_amount !== null ? (string) $this->margin_amount : null,
            'margin_percentage' => $this->margin_percentage !== null ? (string) $this->margin_percentage : null,
            'discount_amount' => (string) $this->discount_amount,
            'total' => (string) $this->total,
            'submitted_at' => $this->submitted_at,
            'decided_at' => $this->decided_at,
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
