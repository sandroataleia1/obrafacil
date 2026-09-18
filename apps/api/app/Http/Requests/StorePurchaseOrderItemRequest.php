<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * POST .../purchase-orders/{purchaseOrder}/items — SUPPLY-API-01C §28.
 * `unit_code`/`unit_custom_label` are prohibited — always copied
 * server-side from the Material (§8), never accepted from the browser.
 */
class StorePurchaseOrderItemRequest extends FormRequest
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
            'unit_code' => ['prohibited'],
            'unit_custom_label' => ['prohibited'],
            'line_total' => ['prohibited'],
            'created_at' => ['prohibited'],
            'updated_at' => ['prohibited'],

            'material_id' => ['required', 'string'],
            'description' => ['required', 'string', 'max:255'],
            'quantity' => ['required', 'numeric', 'gt:0', 'regex:/^\d+(\.\d{1,3})?$/'],
            'unit_price' => ['required', 'numeric', 'min:0', 'regex:/^\d+(\.\d{1,2})?$/'],
        ];
    }

    protected function prepareForValidation(): void
    {
        $description = $this->input('description');
        if (is_string($description)) {
            $this->merge(['description' => trim($description)]);
        }
    }
}
