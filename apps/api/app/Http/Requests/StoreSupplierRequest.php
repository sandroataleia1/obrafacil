<?php

namespace App\Http\Requests;

use App\Models\Supplier;
use App\Rules\CpfOrCnpj;
use App\Rules\E164Phone;
use App\Support\Document;
use Illuminate\Contracts\Validation\Validator as ValidatorContract;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Str;

/**
 * POST /api/v1/suppliers — SUPPLY-API-01A §16-19/§21-23. `active` defaults
 * to `true` when omitted (model default, same convention as
 * Material/CatalogItem).
 */
class StoreSupplierRequest extends FormRequest
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

            'name' => ['required', 'string', 'max:255'],
            'document' => ['nullable', new CpfOrCnpj],
            'contact_name' => ['nullable', 'string', 'max:255'],
            'phone' => ['nullable', new E164Phone],
            'email' => ['nullable', 'email', 'max:255'],
            'address' => ['nullable', 'string', 'max:255'],
            'notes' => ['nullable', 'string'],
            'active' => ['sometimes', 'boolean'],
        ];
    }

    protected function prepareForValidation(): void
    {
        $this->merge([
            'name' => $this->normalizeNullableString($this->input('name')),
            'document' => Document::digitsOnly($this->input('document')),
            'contact_name' => $this->normalizeNullableString($this->input('contact_name')),
            'email' => $this->normalizeEmail($this->input('email')),
            'address' => $this->normalizeNullableString($this->input('address')),
            'notes' => $this->normalizeNullableString($this->input('notes')),
        ]);
    }

    public function withValidator(ValidatorContract $validator): void
    {
        $validator->after(function (ValidatorContract $validator) {
            $this->validateDocumentIsUnique($validator);
        });
    }

    /**
     * §18: a clean 422 for the common case — Supplier::query() is already
     * scoped to the active company by CompanyScope, and the real partial
     * unique index (suppliers_company_document_unique) remains the
     * authoritative, race-safe backstop regardless of this check.
     */
    private function validateDocumentIsUnique(ValidatorContract $validator): void
    {
        $document = $this->input('document');
        if ($document === null || $document === '') {
            return;
        }

        if (Supplier::query()->where('document', $document)->exists()) {
            $validator->errors()->add('document', 'Já existe um fornecedor com este documento.');
        }
    }

    private function normalizeEmail(mixed $email): mixed
    {
        return is_string($email) ? Str::lower(trim($email)) : $email;
    }

    private function normalizeNullableString(mixed $value): mixed
    {
        if (! is_string($value)) {
            return $value;
        }

        $trimmed = trim($value);

        return $trimmed === '' ? null : $trimmed;
    }
}
