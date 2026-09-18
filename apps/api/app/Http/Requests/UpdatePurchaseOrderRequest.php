<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * PUT /api/v1/purchase-orders/{purchaseOrder} — SUPPLY-API-01C §20-21.
 * `commercial_status` is always prohibited here — it only ever changes
 * via the explicit action endpoints (confirm/cancel/return-to-draft).
 * Whether `supplier_id`/`project_id`/`order_date` are actually LOCKED
 * depends on the Order's current status, which only PurchaseOrderService
 * (already holding the row lock) can check safely — this Request only
 * validates shape/format.
 */
class UpdatePurchaseOrderRequest extends FormRequest
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
            'total' => ['prohibited'],
            'items' => ['prohibited'],

            'supplier_id' => ['required', 'string'],
            'project_id' => ['required', 'string'],
            'order_date' => ['required', 'date_format:Y-m-d'],
            'expected_delivery_date' => ['nullable', 'date_format:Y-m-d'],
            'notes' => ['nullable', 'string'],
            'updated_at' => ['required', 'date'],
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
