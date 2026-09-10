<?php

namespace App\Http\Requests;

use App\Support\Document;
use Illuminate\Foundation\Http\FormRequest;

/**
 * GET /api/v1/lookups/cep?cep=... — §7: accepts masked or canonical input,
 * normalizes to 8 digits before validating, never calls the provider for
 * a locally-invalid format.
 */
class LookupPostalCodeRequest extends FormRequest
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
            'cep' => ['required', 'digits:8'],
        ];
    }

    protected function prepareForValidation(): void
    {
        $this->merge([
            'cep' => Document::digitsOnly($this->input('cep')),
        ]);
    }
}
