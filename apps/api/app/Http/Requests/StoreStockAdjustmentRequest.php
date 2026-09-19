<?php

namespace App\Http\Requests;

use App\Enums\StockAdjustmentType;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rules\Enum;

/**
 * POST /api/v1/projects/{project}/stock-adjustments — SUPPLY-API-01E
 * §21-22. `occurred_at` is date-only, required, never in the future (§21).
 * No update/delete Request exists for this entity — it is append-only for
 * its entire lifetime (§20).
 */
class StoreStockAdjustmentRequest extends FormRequest
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

            'material_id' => ['required', 'string'],
            'type' => ['required', new Enum(StockAdjustmentType::class)],
            'quantity' => ['required', 'numeric', 'gt:0', 'regex:/^\d+(\.\d{1,3})?$/'],
            'occurred_at' => ['required', 'date_format:Y-m-d', 'before_or_equal:today'],
            'reason' => ['nullable', 'string'],
        ];
    }

    protected function prepareForValidation(): void
    {
        if ($this->has('reason')) {
            $reason = trim((string) $this->input('reason'));
            $this->merge(['reason' => $reason === '' ? null : $reason]);
        }
    }
}
