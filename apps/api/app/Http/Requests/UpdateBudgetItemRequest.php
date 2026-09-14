<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * PUT /api/v1/budgets/{budget}/items/{item} — draft-only. Only
 * quantity/unit_price/line_discount/notes/sort_order can be changed —
 * source_type/catalog_item_id/type/calculator_type/code/name/unit/
 * description/calculation_snapshot are the immutable snapshot from
 * insertion time and never touched here (mirrors
 * UpdateServiceOrderItemRequest; `calculator_type` is treated the same
 * as `catalog_item_id` — a creation-time-only snapshot field, never
 * editable afterwards).
 *
 * `unit_cost` (BUDGET-API-01A §1-4) is ALSO a creation-time-only
 * snapshot as of this gate — a catalog item's cost must always mirror
 * `CatalogItem.cost_price` as of insertion time, and a calculator
 * item's cost is tied to its (also immutable) `calculation_snapshot`;
 * allowing either to drift via PUT would silently corrupt historical
 * cost data with no matching audit trail. `App\Budgets\BudgetItemService
 * ::updateItem()` never reads `$input['unit_cost']` even as
 * belt-and-suspenders — this `prohibited` rule is the first line of
 * defense, not the only one.
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
            // §1-4: unit_cost is a creation-time-only snapshot, never
            // mutable via PUT — regardless of source_type.
            'unit_cost' => ['prohibited'],

            'quantity' => ['sometimes', 'numeric', 'gt:0', 'regex:/^\d+(\.\d{1,3})?$/'],
            'unit_price' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'line_discount' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'notes' => ['sometimes', 'nullable', 'string'],
            'sort_order' => ['sometimes', 'integer', 'min:0'],
        ];
    }
}
