<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * GET /api/v1/materials — SUPPLY-API-01A §11. `search` matches
 * `Material.name` only. `active` filters explicitly; omitted returns
 * both (same administrative-screen default as CatalogItem, §11 — "Sem
 * active: retorna ambos").
 */
class ListMaterialRequest extends FormRequest
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
            // The controller clamps an over-limit per_page to 100 (same
            // pattern as CatalogItem/Customer) — not a validation error.
            'per_page' => ['nullable', 'integer', 'min:1'],
            // Laravel's `boolean` rule rejects the literal query strings
            // "true"/"false" (only 0/1/"0"/"1" pass) — `in` accepts
            // exactly what §11 requires.
            'active' => ['nullable', 'in:true,false,0,1'],
        ];
    }
}
