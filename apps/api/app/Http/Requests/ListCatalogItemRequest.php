<?php

namespace App\Http\Requests;

use App\Enums\CatalogItemType;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * GET /api/v1/catalog-items — §27-29. An invalid `type`/`active` value is
 * a real 422, never silently ignored.
 */
class ListCatalogItemRequest extends FormRequest
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
            // §27: the controller silently clamps an over-limit per_page to
            // 100 (same pattern as CustomerController) — this is not a
            // validation error, so there is no upper-bound rule here.
            'per_page' => ['nullable', 'integer', 'min:1'],
            'type' => ['nullable', Rule::enum(CatalogItemType::class)],
            // §28: Laravel's `boolean` rule rejects the literal query
            // strings "true"/"false" (only 0/1/"0"/"1" pass) — `in` accepts
            // exactly the values §28 requires.
            'active' => ['nullable', 'in:true,false,0,1'],
        ];
    }
}
