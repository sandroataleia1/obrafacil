<?php

namespace App\Http\Requests;

use App\Http\Requests\Concerns\AuthorizesCompanyOwnerOrAdmin;
use App\Rules\Cnpj;
use App\Rules\E164Phone;
use App\Support\BrazilianStates;
use App\Support\Document;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

/**
 * PUT /api/v1/company/profile — the Company itself IS the profile (§1: no
 * separate profile table), so this is a complete-snapshot update of its
 * header + institutional address fields (§7). `id`/`company_id`/timestamps
 * are always rejected outright (`prohibited`) rather than silently
 * ignored — the Company to update is exclusively the one resolved by
 * `resolve-current-company` (§5/§19), never taken from the payload.
 * `logo_path`/`logo_url` are likewise prohibited here — the logo has its
 * own dedicated upload/delete endpoints (§11-14).
 */
class UpdateCompanyProfileRequest extends FormRequest
{
    use AuthorizesCompanyOwnerOrAdmin;

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            // Hostile/foreign fields — never silently dropped.
            'id' => ['prohibited'],
            'company_id' => ['prohibited'],
            'logo_path' => ['prohibited'],
            'logo_url' => ['prohibited'],
            'created_at' => ['prohibited'],
            'updated_at' => ['prohibited'],

            'name' => ['required', 'string', 'max:255'],
            'legal_name' => ['nullable', 'string', 'max:255'],
            'trade_name' => ['nullable', 'string', 'max:255'],
            'document' => ['nullable', 'string', new Cnpj],

            'phone' => ['nullable', new E164Phone],
            'whatsapp' => ['nullable', new E164Phone],
            'email' => ['nullable', 'email', 'max:255'],

            'postal_code' => ['nullable', 'digits:8'],
            'street' => ['nullable', 'string', 'max:255'],
            'number' => ['nullable', 'string', 'max:50'],
            'complement' => ['nullable', 'string', 'max:255'],
            'neighborhood' => ['nullable', 'string', 'max:255'],
            'city' => ['nullable', 'string', 'max:255'],
            'state' => ['nullable', 'string', 'size:2', Rule::in(BrazilianStates::CODES)],
            'reference_point' => ['nullable', 'string', 'max:255'],

            'timezone' => ['required', 'string', 'timezone:all'],
        ];
    }

    protected function prepareForValidation(): void
    {
        $this->merge([
            'document' => Document::digitsOnly($this->input('document')),
            'email' => $this->normalizeEmail($this->input('email')),
            'state' => $this->normalizeState($this->input('state')),
            'postal_code' => Document::digitsOnly($this->input('postal_code')),
        ]);
    }

    private function normalizeEmail(mixed $email): mixed
    {
        return is_string($email) ? Str::lower(trim($email)) : $email;
    }

    private function normalizeState(mixed $state): mixed
    {
        return is_string($state) ? Str::upper(trim($state)) : $state;
    }
}
