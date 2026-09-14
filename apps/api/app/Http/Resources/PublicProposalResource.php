<?php

namespace App\Http\Resources;

use App\Models\Budget;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * PUBLIC — served from GET /proposals/{token} and the public approve/
 * reject endpoints, with no auth. Deliberately excludes: company_id,
 * customer_id, customer_document, customer_phone, customer_email,
 * unit_cost, line_cost_total, cost_subtotal, margin_amount,
 * margin_percentage, internal notes, calculation_snapshot,
 * created_by_user_id, decision_by_user_id — a customer viewing/deciding
 * on a proposal only ever sees the commercial terms being offered, never
 * this company's internal cost/margin/tenant data.
 *
 * @property Budget $resource
 */
class PublicProposalResource extends JsonResource
{
    public static $wrap = null;

    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'number' => $this->formattedNumber(),
            'status' => $this->status->value,
            'title' => $this->title,
            'reference' => $this->reference,

            'customer_name' => $this->customer_name,

            'sale_subtotal' => (string) $this->sale_subtotal,
            'discount_amount' => (string) $this->discount_amount,
            'total' => (string) $this->total,

            'submitted_at' => $this->submitted_at,
            'decided_at' => $this->decided_at,
            'decision_by_name' => $this->decision_by_name,

            'items' => PublicProposalItemResource::collection($this->whenLoaded('items')),
        ];
    }
}
