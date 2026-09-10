<?php

namespace App\Http\Requests;

use App\Enums\CustomerKind;
use App\Models\Customer;
use App\Rules\E164Phone;
use App\Support\Document;
use Illuminate\Contracts\Validation\Validator as ValidatorContract;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

/**
 * PUT /api/v1/customers/{customer} — Customer's own fields only (§38).
 * Addresses/contacts are never touched here, on purpose — they have their
 * own endpoints, avoiding a dangerous "snapshot sync" semantics.
 */
class UpdateCustomerRequest extends FormRequest
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
            'created_at' => ['prohibited'],
            'updated_at' => ['prohibited'],
            'deleted_at' => ['prohibited'],
            'addresses' => ['prohibited'],
            'contacts' => ['prohibited'],

            'kind' => ['required', Rule::enum(CustomerKind::class)],
            'name' => ['required', 'string', 'max:255'],
            'legal_name' => ['nullable', 'string', 'max:255'],
            'trade_name' => ['nullable', 'string', 'max:255'],
            'document' => ['nullable', 'string'],
            'phone' => ['nullable', new E164Phone],
            'email' => ['nullable', 'email', 'max:255'],
            'notes' => ['nullable', 'string'],
            'active' => ['sometimes', 'boolean'],
        ];
    }

    protected function prepareForValidation(): void
    {
        $this->merge([
            'document' => Document::digitsOnly($this->input('document')),
            'email' => is_string($this->input('email')) ? Str::lower(trim($this->input('email'))) : $this->input('email'),
        ]);
    }

    public function withValidator(ValidatorContract $validator): void
    {
        $validator->after(function (ValidatorContract $validator) {
            $document = $this->input('document');
            if ($document === null || $document === '') {
                return;
            }

            $kind = CustomerKind::tryFrom((string) $this->input('kind'));

            if ($kind === CustomerKind::Individual && ! Document::isValidCpf($document)) {
                $validator->errors()->add('document', 'The document must be a valid CPF for an individual customer.');
            }

            if ($kind === CustomerKind::Company && ! Document::isValidCnpj($document)) {
                $validator->errors()->add('document', 'The document must be a valid CNPJ for a company customer.');
            }

            $exists = Customer::query()
                ->where('document', $document)
                ->where('id', '!=', $this->route('customer'))
                ->exists();

            if ($exists) {
                $validator->errors()->add('document', 'A customer with this document already exists.');
            }
        });
    }
}
