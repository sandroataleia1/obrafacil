<?php

namespace App\Http\Requests;

use App\Http\Requests\Concerns\ValidatesProjectRelations;
use App\Support\BrazilianStates;
use App\Support\Document;
use Illuminate\Contracts\Validation\Validator as ValidatorContract;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

/**
 * POST /api/v1/projects — PROJECT-API-01 §6/§35. `status` is always
 * server-authoritative `planning` (§6) — never accepted from the client.
 * `number`/`company_id`/every raw `address_*` column name are hostile
 * fields — the client only ever speaks the nested `address` shape (§21).
 */
class StoreProjectRequest extends FormRequest
{
    use ValidatesProjectRelations;

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
            'number' => ['prohibited'],
            'status' => ['prohibited'],
            'created_at' => ['prohibited'],
            'updated_at' => ['prohibited'],
            'address_postal_code' => ['prohibited'],
            'address_street' => ['prohibited'],
            'address_number' => ['prohibited'],
            'address_complement' => ['prohibited'],
            'address_neighborhood' => ['prohibited'],
            'address_city' => ['prohibited'],
            'address_state' => ['prohibited'],
            'address_reference_point' => ['prohibited'],

            'name' => ['required', 'string', 'max:255'],
            'reference' => ['nullable', 'string', 'max:255'],

            'customer_id' => ['required', 'string'],
            'customer_address_id' => ['nullable', 'string'],

            'address' => ['nullable', 'array'],
            'address.postal_code' => ['nullable', 'digits:8'],
            'address.street' => ['nullable', 'string', 'max:255'],
            'address.number' => ['nullable', 'string', 'max:50'],
            'address.complement' => ['nullable', 'string', 'max:255'],
            'address.neighborhood' => ['nullable', 'string', 'max:255'],
            'address.city' => ['nullable', 'string', 'max:255'],
            'address.state' => ['nullable', 'string', 'size:2', Rule::in(BrazilianStates::CODES)],
            'address.reference_point' => ['nullable', 'string', 'max:255'],

            'expected_start_date' => ['nullable', 'date_format:Y-m-d'],
            'expected_end_date' => ['nullable', 'date_format:Y-m-d'],

            'source_budget_id' => ['nullable', 'string'],
        ];
    }

    protected function prepareForValidation(): void
    {
        $address = $this->input('address');
        if (is_array($address)) {
            $this->merge(['address' => $this->normalizeAddress($address)]);
        }
    }

    public function withValidator(ValidatorContract $validator): void
    {
        $validator->after(function (ValidatorContract $validator) {
            $this->validateCustomer($validator);

            $customerId = $this->input('customer_id');
            $effectiveCustomerId = is_string($customerId) && $customerId !== '' ? $customerId : null;

            $this->validateCustomerAddress($validator, $effectiveCustomerId);
            $this->validateSourceBudget($validator, $effectiveCustomerId);
        });
    }

    /**
     * @param  array<string, mixed>  $address
     * @return array<string, mixed>
     */
    private function normalizeAddress(array $address): array
    {
        if (array_key_exists('postal_code', $address)) {
            $address['postal_code'] = Document::digitsOnly($address['postal_code']);
        }
        if (array_key_exists('state', $address) && is_string($address['state'])) {
            $address['state'] = Str::upper(trim($address['state']));
        }

        return $address;
    }
}
