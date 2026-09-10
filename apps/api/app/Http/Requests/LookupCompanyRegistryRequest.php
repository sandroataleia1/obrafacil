<?php

namespace App\Http\Requests;

use App\Rules\Cnpj;
use App\Support\Document;
use Illuminate\Foundation\Http\FormRequest;

/**
 * GET /api/v1/lookups/cnpj?cnpj=... — §8: accepts masked or canonical
 * input, normalizes via Document::digitsOnly(), validates the real
 * check-digit algorithm (App\Rules\Cnpj, reused from BACKEND-04) before
 * ever calling the provider — never wastes an external call on a
 * locally-invalid CNPJ.
 */
class LookupCompanyRegistryRequest extends FormRequest
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
            'cnpj' => ['required', 'digits:14', new Cnpj],
        ];
    }

    protected function prepareForValidation(): void
    {
        $this->merge([
            'cnpj' => Document::digitsOnly($this->input('cnpj')),
        ]);
    }
}
