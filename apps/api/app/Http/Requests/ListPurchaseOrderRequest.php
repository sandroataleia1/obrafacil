<?php

namespace App\Http\Requests;

use App\Enums\PurchaseOrderCommercialStatus;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * GET /api/v1/purchase-orders — SUPPLY-API-01C §54-56.
 */
class ListPurchaseOrderRequest extends FormRequest
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
            'search' => ['nullable', 'string'],
            'commercial_status' => ['nullable', Rule::enum(PurchaseOrderCommercialStatus::class)],
            'project_id' => ['nullable', 'string'],
            'supplier_id' => ['nullable', 'string'],
            'page' => ['nullable', 'integer', 'min:1'],
            'per_page' => ['nullable', 'integer', 'min:1'],
        ];
    }
}
