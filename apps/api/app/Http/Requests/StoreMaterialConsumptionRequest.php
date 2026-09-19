<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * POST /api/v1/projects/{project}/material-consumptions — SUPPLY-API-01E
 * §8-9. `project_id` always comes from the route. `consumed_at` is
 * date-only, required, and never in the future (§8). Every derived/hostile
 * field is prohibited (§9) — none of them exist as real input anywhere.
 */
class StoreMaterialConsumptionRequest extends FormRequest
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
            'project_id' => ['prohibited'],
            'created_at' => ['prohibited'],
            'updated_at' => ['prohibited'],
            'available' => ['prohibited'],
            'balance' => ['prohibited'],
            'received_quantity' => ['prohibited'],
            'unit_code' => ['prohibited'],

            'material_id' => ['required', 'string'],
            'quantity' => ['required', 'numeric', 'gt:0', 'regex:/^\d+(\.\d{1,3})?$/'],
            'consumed_at' => ['required', 'date_format:Y-m-d', 'before_or_equal:today'],
            'notes' => ['nullable', 'string'],
        ];
    }

    protected function prepareForValidation(): void
    {
        if ($this->has('notes')) {
            $notes = trim((string) $this->input('notes'));
            $this->merge(['notes' => $notes === '' ? null : $notes]);
        }
    }
}
