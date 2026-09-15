<?php

namespace App\Http\Resources;

use App\Models\Budget;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Storage;

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
 * PROPOSAL-DOC-01A §22: `proposal_company` is the frozen
 * `company_snapshot` + derived `logo_url` (from `proposal_logo_path`) —
 * for auditing what was actually submitted. Only present once the
 * Budget has been submitted (null while draft). The raw
 * `proposal_logo_path` itself is never exposed, same discipline as
 * `CompanyProfileResource`'s `logo_path`/`logo_url` split.
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

            'valid_until' => $this->valid_until?->format('Y-m-d'),
            'payment_terms' => $this->payment_terms,
            'execution_terms' => $this->execution_terms,
            'proposal_terms' => $this->proposal_terms,

            'customer' => [
                'name' => $this->customer_name,
                'document' => $this->customer_document,
                'phone' => $this->customer_phone,
                'email' => $this->customer_email,
            ],

            'sale_subtotal' => (string) $this->sale_subtotal,
            'cost_subtotal' => $this->cost_subtotal !== null ? (string) $this->cost_subtotal : null,
            'margin_amount' => $this->margin_amount !== null ? (string) $this->margin_amount : null,
            'margin_percentage' => $this->margin_percentage !== null ? (string) $this->margin_percentage : null,
            'discount_amount' => (string) $this->discount_amount,
            'total' => (string) $this->total,

            'proposal_token' => $this->proposal_token,
            'submitted_at' => $this->submitted_at,
            'proposal_template_version' => $this->proposal_template_version,

            'proposal_company' => $this->company_snapshot !== null ? [
                'name' => $this->company_snapshot['name'] ?? null,
                'legal_name' => $this->company_snapshot['legal_name'] ?? null,
                'trade_name' => $this->company_snapshot['trade_name'] ?? null,
                'document' => $this->company_snapshot['document'] ?? null,
                'phone' => $this->company_snapshot['phone'] ?? null,
                'whatsapp' => $this->company_snapshot['whatsapp'] ?? null,
                'email' => $this->company_snapshot['email'] ?? null,
                'address' => $this->company_snapshot['address'] ?? null,
                'timezone' => $this->company_snapshot['timezone'] ?? null,
                'logo_url' => $this->proposal_logo_path ? Storage::disk('public')->url($this->proposal_logo_path) : null,
            ] : null,

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
