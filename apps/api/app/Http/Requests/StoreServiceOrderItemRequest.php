<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * POST /api/v1/service-orders/{serviceOrder}/items — §20. `type`/`code`/
 * `name`/`unit`/`description`/`line_total` are the CatalogItem snapshot,
 * copied server-side (App\ServiceOrders\ServiceOrderItemService) — never
 * accepted from the request.
 */
class StoreServiceOrderItemRequest extends FormRequest
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
            'service_order_id' => ['prohibited'],
            'type' => ['prohibited'],
            'code' => ['prohibited'],
            'name' => ['prohibited'],
            'unit' => ['prohibited'],
            'description' => ['prohibited'],
            'line_total' => ['prohibited'],
            'created_at' => ['prohibited'],
            'updated_at' => ['prohibited'],

            'catalog_item_id' => ['required', 'string'],
            'quantity' => ['required', 'numeric', 'gt:0', 'regex:/^\d+(\.\d{1,3})?$/'],
            'unit_price' => ['nullable', 'numeric', 'min:0'],
            'line_discount' => ['nullable', 'numeric', 'min:0'],
            'notes' => ['nullable', 'string'],
        ];
    }
}
