<?php

namespace App\Http\Requests;

use App\Enums\MaterialUnitCode;
use Illuminate\Contracts\Validation\Validator as ValidatorContract;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * PUT /api/v1/materials/{material} — SUPPLY-API-01A §13. `id`/`company_id`
 * can never change. No optimistic concurrency in this gate — CatalogItem,
 * the closest precedent, doesn't use it either (§13).
 */
class UpdateMaterialRequest extends FormRequest
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
            'unit_code' => ['required', Rule::enum(MaterialUnitCode::class)],
            'unit_custom_label' => ['nullable', 'string', 'max:255'],
            'notes' => ['nullable', 'string'],
            'active' => ['sometimes', 'boolean'],
        ];
    }

    protected function prepareForValidation(): void
    {
        $this->merge([
            'name' => $this->normalizeNullableString($this->input('name')),
            'unit_custom_label' => $this->normalizeNullableString($this->input('unit_custom_label')),
            'notes' => $this->normalizeNullableString($this->input('notes')),
        ]);
    }

    public function withValidator(ValidatorContract $validator): void
    {
        $validator->after(function (ValidatorContract $validator) {
            $this->validateUnitCustomLabel($validator);
        });
    }

    private function validateUnitCustomLabel(ValidatorContract $validator): void
    {
        $unitCode = $this->input('unit_code');
        $customLabel = $this->input('unit_custom_label');

        if ($unitCode === MaterialUnitCode::Other->value) {
            if ($customLabel === null) {
                $validator->errors()->add('unit_custom_label', 'Informe a unidade personalizada quando a unidade for "Outro".');
            }

            return;
        }

        if ($customLabel !== null) {
            $validator->errors()->add('unit_custom_label', 'A unidade personalizada só pode ser informada quando a unidade for "Outro".');
        }
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
