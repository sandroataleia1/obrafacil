<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * POST /api/v1/purchase-orders — SUPPLY-API-01C §16. `commercial_status`
 * is always `draft` and `number` is always allocator-assigned — both
 * server-authoritative, never accepted from the request.
 */
class StorePurchaseOrderRequest extends FormRequest
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
            'number' => ['prohibited'],
            'commercial_status' => ['prohibited'],
            'created_at' => ['prohibited'],
            'updated_at' => ['prohibited'],
            'total' => ['prohibited'],
            'items' => ['prohibited'],

            'supplier_id' => ['required', 'string'],
            'project_id' => ['required', 'string'],
            'order_date' => ['required', 'date_format:Y-m-d'],
            'expected_delivery_date' => ['nullable', 'date_format:Y-m-d'],
            'notes' => ['nullable', 'string'],
        ];
    }

    protected function prepareForValidation(): void
    {
        $notes = $this->input('notes');
        if (is_string($notes)) {
            $trimmed = trim($notes);
            $this->merge(['notes' => $trimmed === '' ? null : $trimmed]);
        }
    }
}
