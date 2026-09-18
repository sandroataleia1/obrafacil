<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * POST .../confirm | .../cancel | .../return-to-draft — SUPPLY-API-01C
 * §50. Every status action requires the same optimistic-concurrency
 * precondition as the header PUT — an action must never apply against a
 * stale representation of the Order.
 */
class PurchaseOrderStatusActionRequest extends FormRequest
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
