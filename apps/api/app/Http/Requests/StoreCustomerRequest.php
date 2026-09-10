<?php

namespace App\Http\Requests;

use App\Enums\CustomerAddressType;
use App\Enums\CustomerKind;
use App\Models\Customer;
use App\Rules\E164Phone;
use App\Support\BrazilianStates;
use App\Support\Document;
use Illuminate\Contracts\Validation\Validator as ValidatorContract;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

/**
 * POST /api/v1/customers — Customer + addresses + contacts created
 * atomically (§37/§78). This same endpoint is what a future "novo cliente"
 * flow inside a Service Order will call (§39) — there is deliberately no
 * separate "quick create" contract.
 */
class StoreCustomerRequest extends FormRequest
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
            // Hostile/foreign fields (§47) — never silently dropped.
            'id' => ['prohibited'],
            'company_id' => ['prohibited'],
            'created_at' => ['prohibited'],
            'updated_at' => ['prohibited'],
            'deleted_at' => ['prohibited'],

            'kind' => ['required', Rule::enum(CustomerKind::class)],
            'name' => ['required', 'string', 'max:255'],
            'legal_name' => ['nullable', 'string', 'max:255'],
            'trade_name' => ['nullable', 'string', 'max:255'],
            'document' => ['nullable', 'string'],
            'phone' => ['nullable', new E164Phone],
            'email' => ['nullable', 'email', 'max:255'],
            'notes' => ['nullable', 'string'],
            'active' => ['sometimes', 'boolean'],

            'addresses' => ['sometimes', 'array'],
            'addresses.*.id' => ['prohibited'],
            'addresses.*.company_id' => ['prohibited'],
            'addresses.*.customer_id' => ['prohibited'],
            'addresses.*.label' => ['required', 'string', 'max:255'],
            'addresses.*.type' => ['required', Rule::enum(CustomerAddressType::class)],
            'addresses.*.postal_code' => ['nullable', 'digits:8'],
            'addresses.*.street' => ['nullable', 'string', 'max:255'],
            'addresses.*.number' => ['nullable', 'string', 'max:50'],
            'addresses.*.complement' => ['nullable', 'string', 'max:255'],
            'addresses.*.neighborhood' => ['nullable', 'string', 'max:255'],
            'addresses.*.city' => ['nullable', 'string', 'max:255'],
            'addresses.*.state' => ['nullable', 'string', 'size:2', Rule::in(BrazilianStates::CODES)],
            'addresses.*.reference_point' => ['nullable', 'string', 'max:255'],
            'addresses.*.is_primary' => ['sometimes', 'boolean'],

            'contacts' => ['sometimes', 'array'],
            'contacts.*.id' => ['prohibited'],
            'contacts.*.company_id' => ['prohibited'],
            'contacts.*.customer_id' => ['prohibited'],
            'contacts.*.name' => ['required', 'string', 'max:255'],
            'contacts.*.role' => ['nullable', 'string', 'max:255'],
            'contacts.*.department' => ['nullable', 'string', 'max:255'],
            'contacts.*.phone' => ['nullable', new E164Phone],
            'contacts.*.whatsapp' => ['nullable', new E164Phone],
            'contacts.*.email' => ['nullable', 'email', 'max:255'],
            'contacts.*.notes' => ['nullable', 'string'],
            'contacts.*.is_primary' => ['sometimes', 'boolean'],
            'contacts.*.active' => ['sometimes', 'boolean'],
        ];
    }

    protected function prepareForValidation(): void
    {
        $this->merge([
            'document' => Document::digitsOnly($this->input('document')),
            'email' => $this->normalizeEmail($this->input('email')),
        ]);

        $addresses = $this->input('addresses');
        if (is_array($addresses)) {
            $this->merge(['addresses' => array_map($this->normalizeAddress(...), $addresses)]);
        }

        $contacts = $this->input('contacts');
        if (is_array($contacts)) {
            $this->merge(['contacts' => array_map($this->normalizeContact(...), $contacts)]);
        }
    }

    public function withValidator(ValidatorContract $validator): void
    {
        $validator->after(function (ValidatorContract $validator) {
            $this->validateDocumentMatchesKind($validator);
            $this->validateDocumentIsUnique($validator);
            $this->validatePrimaryCount($validator, 'addresses');
            $this->validatePrimaryCount($validator, 'contacts');
        });
    }

    private function validateDocumentMatchesKind(ValidatorContract $validator): void
    {
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
    }

    /**
     * §11: a clean 422 for the common case — Customer::query() is already
     * scoped to the active company by CompanyScope, and the real partial
     * unique index (customers_company_document_unique) remains the
     * authoritative, race-safe backstop regardless of this check.
     */
    private function validateDocumentIsUnique(ValidatorContract $validator): void
    {
        $document = $this->input('document');
        if ($document === null || $document === '') {
            return;
        }

        if (Customer::query()->where('document', $document)->exists()) {
            $validator->errors()->add('document', 'A customer with this document already exists.');
        }
    }

    /**
     * §28/§79: with exactly one entry, the server forces is_primary
     * itself (handled in the service layer) — no validation needed there.
     * With 2+, exactly one must be explicitly marked primary.
     */
    private function validatePrimaryCount(ValidatorContract $validator, string $field): void
    {
        $items = $this->input($field);
        if (! is_array($items) || count($items) < 2) {
            return;
        }

        $primaryCount = collect($items)->filter(fn ($item) => (bool) ($item['is_primary'] ?? false))->count();

        if ($primaryCount !== 1) {
            $validator->errors()->add($field, "Exactly one {$field} entry must be marked as primary when providing more than one.");
        }
    }

    private function normalizeEmail(mixed $email): mixed
    {
        return is_string($email) ? Str::lower(trim($email)) : $email;
    }

    /**
     * @param  mixed  $address
     * @return mixed
     */
    private function normalizeAddress($address)
    {
        if (! is_array($address)) {
            return $address;
        }

        if (array_key_exists('postal_code', $address)) {
            $address['postal_code'] = Document::digitsOnly($address['postal_code']);
        }
        if (array_key_exists('state', $address) && is_string($address['state'])) {
            $address['state'] = Str::upper(trim($address['state']));
        }

        return $address;
    }

    /**
     * @param  mixed  $contact
     * @return mixed
     */
    private function normalizeContact($contact)
    {
        if (! is_array($contact)) {
            return $contact;
        }

        if (array_key_exists('email', $contact)) {
            $contact['email'] = $this->normalizeEmail($contact['email']);
        }

        return $contact;
    }
}
