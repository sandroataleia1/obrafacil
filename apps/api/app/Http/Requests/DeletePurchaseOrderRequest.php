<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * DELETE /api/v1/purchase-orders/{purchaseOrder} — SUPPLY-API-01C §53.
 * `updated_at` travels in the JSON body so a stale draft (edited by
 * someone else since the client last loaded it) is never silently
 * discarded.
 */
class DeletePurchaseOrderRequest extends FormRequest
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
            'updated_at' => ['required', 'date'],
        ];
    }
}
