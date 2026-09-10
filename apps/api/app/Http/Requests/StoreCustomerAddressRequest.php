<?php

namespace App\Http\Requests;

use App\Enums\CustomerAddressType;
use App\Support\BrazilianStates;
use App\Support\Document;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class StoreCustomerAddressRequest extends FormRequest
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
            'customer_id' => ['prohibited'],
            'created_at' => ['prohibited'],
            'updated_at' => ['prohibited'],

            'label' => ['required', 'string', 'max:255'],
            'type' => ['required', Rule::enum(CustomerAddressType::class)],
            'postal_code' => ['nullable', 'digits:8'],
            'street' => ['nullable', 'string', 'max:255'],
            'number' => ['nullable', 'string', 'max:50'],
            'complement' => ['nullable', 'string', 'max:255'],
            'neighborhood' => ['nullable', 'string', 'max:255'],
            'city' => ['nullable', 'string', 'max:255'],
            'state' => ['nullable', 'string', 'size:2', Rule::in(BrazilianStates::CODES)],
            'reference_point' => ['nullable', 'string', 'max:255'],
            'is_primary' => ['sometimes', 'boolean'],
        ];
    }

    protected function prepareForValidation(): void
    {
        $this->merge([
            'postal_code' => Document::digitsOnly($this->input('postal_code')),
            'state' => is_string($this->input('state')) ? Str::upper(trim($this->input('state'))) : $this->input('state'),
        ]);
    }
}
