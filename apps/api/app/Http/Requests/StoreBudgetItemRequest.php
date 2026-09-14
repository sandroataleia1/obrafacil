<?php

namespace App\Http\Requests;

use App\Http\Requests\Concerns\ValidatesBudgetRelations;
use Illuminate\Contracts\Validation\Validator as ValidatorContract;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreBudgetItemRequest extends FormRequest
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
            'budget_id' => ['prohibited'],
            'type' => ['prohibited'],
            'line_total' => ['prohibited'],
            'line_cost_total' => ['prohibited'],

            'source_type' => ['required', Rule::in(['catalog', 'calculator', 'manual'])],
            'catalog_item_id' => ['required_if:source_type,catalog', 'prohibited_unless:source_type,catalog', 'string'],
            'calculator_type' => [
                'required_if:source_type,calculator',
                'prohibited_unless:source_type,calculator',
                Rule::in(['masonry', 'floor', 'ceiling', 'slab']),
            ],
            'code' => ['prohibited_if:source_type,catalog', 'nullable', 'string', 'max:255'],
            'name' => ['required_unless:source_type,catalog', 'prohibited_if:source_type,catalog', 'string', 'max:255'],
            // BUDGET-API-01A §14-16: unit is nullable for calculator/manual
            // items — a closed-price line has no natural unit of measure
            // to force. Never required_unless here.
            'unit' => ['prohibited_if:source_type,catalog', 'nullable', 'string', 'max:255'],
            'description' => ['prohibited_if:source_type,catalog', 'nullable', 'string'],
            'quantity' => ['required', 'numeric', 'gt:0', 'regex:/^\d+(\.\d{1,3})?$/'],
            'unit_price' => ['nullable', 'numeric', 'min:0', 'required_unless:source_type,catalog'],
            // §20: unit_cost for a catalog item is never client-supplied —
            // it always mirrors CatalogItem.cost_price server-side. Only
            // calculator/manual items may carry an explicit unit_cost.
            'unit_cost' => ['prohibited_if:source_type,catalog', 'nullable', 'numeric', 'min:0'],
            'line_discount' => ['nullable', 'numeric', 'min:0'],
            // BUDGET-API-01A §19-20: calculation_snapshot is REQUIRED for
            // calculator items (no auditability of the calculator's origin
            // without it) and prohibited otherwise.
            'calculation_snapshot' => [
                'required_if:source_type,calculator',
                'prohibited_unless:source_type,calculator',
                'array',
            ],
            'notes' => ['nullable', 'string'],
        ];
    }

    public function withValidator(ValidatorContract $validator): void
    {
        $validator->after(function (ValidatorContract $validator) {
            if ($this->input('source_type') === 'catalog') {
                $this->validateCatalogItem($validator);
            }
        });
    }
}
