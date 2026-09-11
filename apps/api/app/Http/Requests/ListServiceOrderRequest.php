<?php

namespace App\Http\Requests;

use App\Enums\ServiceOrderStatus;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * GET /api/v1/service-orders — §56-59. `customer_id` is only format-
 * validated here — a cross-tenant/nonexistent customer_id simply yields
 * an empty result set (the query is already company-scoped), never a
 * validation error that could reveal whether the id exists (§59).
 */
class ListServiceOrderRequest extends FormRequest
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
            'page' => ['nullable', 'integer', 'min:1'],
            // §56: the controller silently clamps an over-limit per_page to
            // 100 — not a validation error, so no upper-bound rule here.
            'per_page' => ['nullable', 'integer', 'min:1'],
            'status' => ['nullable', Rule::enum(ServiceOrderStatus::class)],
            'customer_id' => ['nullable', 'string'],
        ];
    }
}
