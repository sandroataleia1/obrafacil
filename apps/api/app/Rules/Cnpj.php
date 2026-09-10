<?php

namespace App\Rules;

use App\Support\Document;
use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

/**
 * Expects an already-normalized (digits-only) value — normalization
 * happens in the Form Request's prepareForValidation(), never here (§8).
 */
class Cnpj implements ValidationRule
{
    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if (! is_string($value) || ! Document::isValidCnpj($value)) {
            $fail('The :attribute must be a valid CNPJ.');
        }
    }
}
