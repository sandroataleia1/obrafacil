<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * PUT /api/v1/service-orders/{serviceOrder}/items/{item} — §44.
 * `catalog_item_id`/`type`/`code`/`name`/`unit`/`description` are the
 * snapshot from insertion time — this endpoint can never touch them. To
 * pick a different CatalogItem, remove the line and add a new one (§44).
 */
class UpdateServiceOrderItemRequest extends FormRequest
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
            'catalog_item_id' => ['prohibited'],
            'type' => ['prohibited'],
            'code' => ['prohibited'],
            'name' => ['prohibited'],
            'unit' => ['prohibited'],
            'description' => ['prohibited'],
            'line_total' => ['prohibited'],
            'created_at' => ['prohibited'],
            'updated_at' => ['prohibited'],

            'quantity' => ['sometimes', 'numeric', 'gt:0', 'regex:/^\d+(\.\d{1,3})?$/'],
            'unit_price' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'line_discount' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'notes' => ['sometimes', 'nullable', 'string'],
            'sort_order' => ['sometimes', 'integer', 'min:0'],
        ];
    }
}
