<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * PUT .../purchase-orders/{purchaseOrder}/items/{item} — SUPPLY-API-01C
 * §32/§51. `material_id`/`unit_code`/`unit_custom_label`/
 * `purchase_order_id` are immutable — once created, a wrong Material means
 * delete-and-recreate, never edit-in-place (mirrors MaterialRequirement's
 * own §11 rule).
 *
 * SUPPLY-API-01D §62: `received_quantity`/`remaining_quantity`/
 * `fulfillment_status` are always derived — explicitly prohibited here so
 * a hostile/stale value in the payload can never even reach the Service.
 */
class UpdatePurchaseOrderItemRequest extends FormRequest
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
            'material_id' => ['prohibited'],
            'unit_code' => ['prohibited'],
            'unit_custom_label' => ['prohibited'],
            'line_total' => ['prohibited'],
            'received_quantity' => ['prohibited'],
            'remaining_quantity' => ['prohibited'],
            'fulfillment_status' => ['prohibited'],
            'created_at' => ['prohibited'],

            'description' => ['required', 'string', 'max:255'],
            'quantity' => ['required', 'numeric', 'gt:0', 'regex:/^\d+(\.\d{1,3})?$/'],
            'unit_price' => ['required', 'numeric', 'min:0', 'regex:/^\d+(\.\d{1,2})?$/'],
            'updated_at' => ['required', 'date'],
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
