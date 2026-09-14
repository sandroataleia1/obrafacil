<?php

namespace App\Http\Resources;

use App\Models\Budget;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * The full, AUTHENTICATED shape for POST/GET/PUT of a single Budget.
 * `company_id` is never exposed. Money fields are always decimal
 * strings, never JSON numbers — `margin_amount`/`margin_percentage` are
 * `null` whenever any item is missing `unit_cost` (never silently 0),
 * and `margin_amount` CAN be a negative string ("-20.00" — selling
 * below cost is valid). Each item's own `calculation_snapshot` (see
 * `BudgetItemResource`) IS included here via `items[]` — never in the
 * list resource.
 *
 * @property Budget $resource
 */
class BudgetResource extends JsonResource
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

            'customer_id' => $this->customer_id,
            'title' => $this->title,
            'reference' => $this->reference,
            'notes' => $this->notes,

            'customer' => [
                'name' => $this->customer_name,
                'document' => $this->customer_document,
                'phone' => $this->customer_phone,
                'email' => $this->customer_email,
            ],

            'subtotal' => (string) $this->subtotal,
            'cost_subtotal' => $this->cost_subtotal !== null ? (string) $this->cost_subtotal : null,
            'margin_amount' => $this->margin_amount !== null ? (string) $this->margin_amount : null,
            'margin_percentage' => $this->margin_percentage !== null ? (string) $this->margin_percentage : null,
            'discount_amount' => (string) $this->discount_amount,
            'total' => (string) $this->total,

            'proposal_token' => $this->proposal_token,
            'submitted_at' => $this->submitted_at,

            'decision_source' => $this->decision_source?->value,
            'decision_by_user_id' => $this->decision_by_user_id,
            'decision_by_name' => $this->decision_by_name,
            'decision_note' => $this->decision_note,
            'decided_at' => $this->decided_at,

            'items' => BudgetItemResource::collection($this->whenLoaded('items')),

            'created_by_user_id' => $this->created_by_user_id,
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
