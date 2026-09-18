<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * GET /api/v1/suppliers — SUPPLY-API-01A §27. `search` matches
 * `Supplier.name` and, when the term looks like a document, the
 * canonical (digits-only) `document` column too.
 */
class ListSupplierRequest extends FormRequest
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
            'per_page' => ['nullable', 'integer', 'min:1'],
            'active' => ['nullable', 'in:true,false,0,1'],
        ];
    }
}
