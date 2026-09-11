<?php

namespace App\Http\Requests;

use App\Enums\CatalogItemType;
use App\Models\CatalogItem;
use Illuminate\Contracts\Validation\Validator as ValidatorContract;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

/**
 * PUT /api/v1/catalog-items/{catalogItem} — §25. `id`/`company_id` can
 * never change.
 */
class UpdateCatalogItemRequest extends FormRequest
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

            'type' => ['required', Rule::enum(CatalogItemType::class)],
            'code' => ['nullable', 'string', 'max:255'],
            'name' => ['required', 'string', 'max:255'],
            'category' => ['nullable', 'string', 'max:255'],
            'unit' => ['required', 'string', 'max:50'],
            'description' => ['nullable', 'string'],
            'cost_price' => ['nullable', 'numeric', 'min:0'],
            'sale_price' => ['nullable', 'numeric', 'min:0'],
            'active' => ['sometimes', 'boolean'],
        ];
    }

    protected function prepareForValidation(): void
    {
        $this->merge([
            'code' => $this->normalizeNullableString($this->input('code')),
            'category' => $this->normalizeNullableString($this->input('category')),
            'description' => $this->normalizeNullableString($this->input('description')),
            'cost_price' => $this->normalizePrice($this->input('cost_price')),
            'sale_price' => $this->normalizePrice($this->input('sale_price')),
        ]);
    }

    public function withValidator(ValidatorContract $validator): void
    {
        $validator->after(function (ValidatorContract $validator) {
            $this->validateCodeIsUnique($validator);
        });
    }

    private function validateCodeIsUnique(ValidatorContract $validator): void
    {
        $code = $this->input('code');
        if ($code === null) {
            return;
        }

        $exists = CatalogItem::query()
            ->whereRaw('LOWER(code) = ?', [Str::lower($code)])
            ->where('id', '!=', $this->route('catalogItem'))
            ->exists();

        if ($exists) {
            $validator->errors()->add('code', 'Já existe um item de catálogo com este código.');
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

    private function normalizePrice(mixed $value): mixed
    {
        return $value === '' ? null : $value;
    }
}
