<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * PUT /api/v1/budgets/{budget}/items/{item} — draft-only. Only
 * quantity/unit_price/unit_cost/line_discount/notes/sort_order can be
 * changed — source_type/catalog_item_id/type/calculator_type/code/name/
 * unit/description are the immutable snapshot from insertion time and
 * never touched here (mirrors UpdateServiceOrderItemRequest;
 * `calculator_type` is treated the same as `catalog_item_id` — a
 * creation-time-only snapshot field, never editable afterwards).
 */
class UpdateBudgetItemRequest extends FormRequest
{
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
            'budget_id' => ['prohibited'],
            'source_type' => ['prohibited'],
            'catalog_item_id' => ['prohibited'],
            'type' => ['prohibited'],
            'calculator_type' => ['prohibited'],
            'code' => ['prohibited'],
            'name' => ['prohibited'],
            'unit' => ['prohibited'],
            'description' => ['prohibited'],
            'calculation_snapshot' => ['prohibited'],
            'line_total' => ['prohibited'],
            'line_cost_total' => ['prohibited'],

            'quantity' => ['sometimes', 'numeric', 'gt:0', 'regex:/^\d+(\.\d{1,3})?$/'],
            'unit_price' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'unit_cost' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'line_discount' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'notes' => ['sometimes', 'nullable', 'string'],
            'sort_order' => ['sometimes', 'integer', 'min:0'],
        ];
    }
}
