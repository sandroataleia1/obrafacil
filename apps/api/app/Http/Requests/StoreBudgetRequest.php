<?php

namespace App\Http\Requests;

use App\Http\Requests\Concerns\ValidatesBudgetRelations;
use Illuminate\Contracts\Validation\Validator as ValidatorContract;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * POST /api/v1/budgets. `status`/`number`/`company_id`/
 * `created_by_user_id`/every snapshot field/`sale_subtotal`/
 * `cost_subtotal`/`margin_amount`/`margin_percentage`/`total`/
 * `proposal_token`/`calculation_snapshot`/`project_id` are all hostile
 * fields — never accepted from the client. `margin_percentage` in
 * particular is 100% server-derived and never accepted anywhere in this
 * gate. `subtotal` (the pre-BUDGET-API-01A name) is ALSO kept rejected
 * as an unknown/legacy hostile field (§11) — a client still built
 * against the old contract must get a clean 422, never a silently
 * ignored field.
 */
class StoreBudgetRequest extends FormRequest
{
    use ValidatesBudgetRelations;

    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'id' => ['prohibited'],
            'company_id' => ['prohibited'],
            'number' => ['prohibited'],
            'status' => ['prohibited'],
            'created_by_user_id' => ['prohibited'],
            'created_at' => ['prohibited'],
            'updated_at' => ['prohibited'],
            'project_id' => ['prohibited'],
            'subtotal' => ['prohibited'],
            'sale_subtotal' => ['prohibited'],
            'cost_subtotal' => ['prohibited'],
            'margin_amount' => ['prohibited'],
            'margin_percentage' => ['prohibited'],
            'total' => ['prohibited'],
            'proposal_token' => ['prohibited'],
            'calculation_snapshot' => ['prohibited'],
            'customer_name' => ['prohibited'],
            'customer_document' => ['prohibited'],
            'customer_phone' => ['prohibited'],
            'customer_email' => ['prohibited'],
            // PROPOSAL-DOC-01A §14: never accepted from the client — set
            // exclusively by BudgetService::submit() from the server-side
            // Company row, never from the browser.
            'company_snapshot' => ['prohibited'],
            'proposal_logo_path' => ['prohibited'],
            'proposal_template_version' => ['prohibited'],

            'customer_id' => ['required', 'string'],
            'title' => ['required', 'string', 'max:255'],
            'reference' => ['nullable', 'string', 'max:255'],
            'notes' => ['nullable', 'string'],
            // PROPOSAL-DOC-01A §11/§14: client-facing commercial
            // conditions — distinct from `notes`, which stays internal
            // (§13) and is never shown to the customer.
            'valid_until' => ['nullable', 'date_format:Y-m-d'],
            'payment_terms' => ['nullable', 'string', 'max:5000'],
            'execution_terms' => ['nullable', 'string', 'max:5000'],
            'proposal_terms' => ['nullable', 'string', 'max:5000'],
            'discount_amount' => ['nullable', 'numeric', 'min:0'],

            'items' => ['sometimes', 'array'],
            'items.*.id' => ['prohibited'],
            'items.*.company_id' => ['prohibited'],
            'items.*.budget_id' => ['prohibited'],
            'items.*.type' => ['prohibited'],
            'items.*.line_total' => ['prohibited'],
            'items.*.line_cost_total' => ['prohibited'],
            'items.*.source_type' => ['required', Rule::in(['catalog', 'calculator', 'manual'])],
            'items.*.catalog_item_id' => ['required_if:items.*.source_type,catalog', 'prohibited_unless:items.*.source_type,catalog', 'string'],
            'items.*.calculator_type' => [
                'required_if:items.*.source_type,calculator',
                'prohibited_unless:items.*.source_type,calculator',
                Rule::in(['masonry', 'floor', 'ceiling', 'slab']),
            ],
            'items.*.code' => ['prohibited_if:items.*.source_type,catalog', 'nullable', 'string', 'max:255'],
            'items.*.name' => ['required_unless:items.*.source_type,catalog', 'prohibited_if:items.*.source_type,catalog', 'string', 'max:255'],
            // §14-16: unit is nullable for calculator/manual (a closed-price
            // line has no natural unit of measure to force) — never
            // required_unless here.
            'items.*.unit' => ['prohibited_if:items.*.source_type,catalog', 'nullable', 'string', 'max:255'],
            'items.*.description' => ['prohibited_if:items.*.source_type,catalog', 'nullable', 'string'],
            'items.*.quantity' => ['required', 'numeric', 'gt:0', 'regex:/^\d+(\.\d{1,3})?$/'],
            'items.*.unit_price' => ['nullable', 'numeric', 'min:0', 'required_unless:items.*.source_type,catalog'],
            // §20: unit_cost for a catalog item is never client-supplied
            // here either — same rule as StoreBudgetItemRequest.
            'items.*.unit_cost' => ['prohibited_if:items.*.source_type,catalog', 'nullable', 'numeric', 'min:0'],
            'items.*.line_discount' => ['nullable', 'numeric', 'min:0'],
            // §19-20: calculation_snapshot is REQUIRED for calculator items
            // (a calculator-sourced line is meaningless without its audit
            // trail) and prohibited otherwise — never merely optional.
            'items.*.calculation_snapshot' => [
                'required_if:items.*.source_type,calculator',
                'prohibited_unless:items.*.source_type,calculator',
                'array',
            ],
            'items.*.notes' => ['nullable', 'string'],
        ];
    }

    public function withValidator(ValidatorContract $validator): void
    {
        $validator->after(function (ValidatorContract $validator) {
            $this->validateCustomer($validator);

            foreach ((array) $this->input('items', []) as $index => $item) {
                if (($item['source_type'] ?? null) === 'catalog') {
                    $this->validateCatalogItem($validator, "items.{$index}.catalog_item_id");
                }
            }
        });
    }
}
