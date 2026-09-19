<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * POST .../purchase-orders/{purchaseOrder}/goods-receipts —
 * SUPPLY-API-01D §10-12. `items` must be a non-empty array of genuinely
 * positive lines — this Request never silently drops empty/zero rows the
 * way the frontend prototype's own form might (§11): a payload with zero
 * positive lines is 422, not a quiet no-op.
 */
class StoreGoodsReceiptRequest extends FormRequest
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
            'purchase_order_id' => ['prohibited'],
            'created_at' => ['prohibited'],
            'updated_at' => ['prohibited'],

            'received_at' => ['required', 'date_format:Y-m-d'],
            'notes' => ['nullable', 'string'],

            'items' => ['required', 'array', 'min:1'],
            'items.*.purchase_order_item_id' => ['required', 'string'],
            'items.*.quantity' => ['required', 'numeric', 'gt:0', 'regex:/^\d+(\.\d{1,3})?$/'],
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
