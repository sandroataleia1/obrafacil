<?php

namespace App\Http\Requests;

use App\Enums\ProjectStatus;
use App\Http\Requests\Concerns\ValidatesProjectRelations;
use App\Models\Project;
use App\Support\BrazilianStates;
use App\Support\Document;
use Illuminate\Contracts\Validation\Validator as ValidatorContract;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

/**
 * PUT /api/v1/projects/{project} — PROJECT-API-01 §7/§12/§36-38. Partial
 * update (`sometimes`) — this is a live operational record, not a
 * full-replace-only PUT like ServiceOrder's. `status` may change to any
 * enum value here (§7 — no formal state machine in v1). `source_budget_id`
 * is prohibited (§12 — immutable after creation, origin only). `updated_at`
 * is REQUIRED as the optimistic-concurrency precondition (§37) — it must
 * be exactly the value the client last read from ProjectResource.
 */
class UpdateProjectRequest extends FormRequest
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
            'created_at' => ['prohibited'],
            'source_budget_id' => ['prohibited'],
            'address_postal_code' => ['prohibited'],
            'address_street' => ['prohibited'],
            'address_number' => ['prohibited'],
            'address_complement' => ['prohibited'],
            'address_neighborhood' => ['prohibited'],
            'address_city' => ['prohibited'],
            'address_state' => ['prohibited'],
            'address_reference_point' => ['prohibited'],

            'updated_at' => ['required', 'date'],

            'name' => ['sometimes', 'required', 'string', 'max:255'],
            'reference' => ['sometimes', 'nullable', 'string', 'max:255'],
            'status' => ['sometimes', Rule::enum(ProjectStatus::class)],

            'customer_id' => ['sometimes', 'required', 'string'],
            'customer_address_id' => ['sometimes', 'nullable', 'string'],

            'address' => ['sometimes', 'nullable', 'array'],
            'address.postal_code' => ['nullable', 'digits:8'],
            'address.street' => ['nullable', 'string', 'max:255'],
            'address.number' => ['nullable', 'string', 'max:50'],
            'address.complement' => ['nullable', 'string', 'max:255'],
            'address.neighborhood' => ['nullable', 'string', 'max:255'],
            'address.city' => ['nullable', 'string', 'max:255'],
            'address.state' => ['nullable', 'string', 'size:2', Rule::in(BrazilianStates::CODES)],
            'address.reference_point' => ['nullable', 'string', 'max:255'],

            'expected_start_date' => ['sometimes', 'nullable', 'date_format:Y-m-d'],
            'expected_end_date' => ['sometimes', 'nullable', 'date_format:Y-m-d'],
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
            $this->validateCustomerAddress($validator, $this->effectiveCustomerId());
        });
    }

    /**
     * §22/§30: customer_address_id must belong to whichever customer_id
     * this request ends up targeting — the new one if being changed,
     * otherwise the Project's current one.
     */
    private function effectiveCustomerId(): ?string
    {
        $customerId = $this->input('customer_id');
        if (is_string($customerId) && $customerId !== '') {
            return $customerId;
        }

        $projectId = $this->route('project');

        return is_string($projectId) ? Project::query()->find($projectId)?->customer_id : null;
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
