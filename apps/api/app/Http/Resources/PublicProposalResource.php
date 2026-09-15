<?php

namespace App\Http\Resources;

use App\Models\Budget;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Storage;

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
 * PROPOSAL-DOC-01A §19-21: `company`/`logo_url` and the client-facing
 * condition fields come EXCLUSIVELY from `company_snapshot` +
 * `proposal_logo_path` — the historical record frozen at submit — NEVER
 * from the live `Company` relation. `decision_note` and `Budget.notes`
 * stay excluded (§37/§13): the same `decision_note` column can hold an
 * internal manual-decision remark, and `notes` is always internal.
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

            'valid_until' => $this->valid_until?->format('Y-m-d'),
            'payment_terms' => $this->payment_terms,
            'execution_terms' => $this->execution_terms,
            'proposal_terms' => $this->proposal_terms,

            'company' => $this->company_snapshot !== null ? [
                'name' => $this->company_snapshot['name'] ?? null,
                'legal_name' => $this->company_snapshot['legal_name'] ?? null,
                'trade_name' => $this->company_snapshot['trade_name'] ?? null,
                'document' => $this->company_snapshot['document'] ?? null,
                'phone' => $this->company_snapshot['phone'] ?? null,
                'whatsapp' => $this->company_snapshot['whatsapp'] ?? null,
                'email' => $this->company_snapshot['email'] ?? null,
                'address' => $this->company_snapshot['address'] ?? null,
                'logo_url' => $this->proposal_logo_path ? Storage::disk('public')->url($this->proposal_logo_path) : null,
            ] : null,

            'submitted_at' => $this->submitted_at,
            'decided_at' => $this->decided_at,
            'decision_by_name' => $this->decision_by_name,

            'items' => PublicProposalItemResource::collection($this->whenLoaded('items')),
        ];
    }
}
