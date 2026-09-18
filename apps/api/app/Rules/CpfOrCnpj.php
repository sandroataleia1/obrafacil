<?php

namespace App\Rules;

use App\Support\Document;
use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

/**
 * SUPPLY-API-01A §16-17/ADR-017 #6. Supplier has no `kind` field (unlike
 * Customer) — the expected document type is dispatched purely by digit
 * count: 11 digits → CPF, 14 digits → CNPJ, any other length → invalid.
 * Expects an already-normalized (digits-only) value — normalization
 * happens in the Form Request's `prepareForValidation()`, never here,
 * same convention as `Cpf`/`Cnpj`. Reuses `Document::isValidCpf()`/
 * `isValidCnpj()` verbatim — no duplicate checksum logic.
 */
class CpfOrCnpj implements ValidationRule
{
    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if (! is_string($value)) {
            $fail('Informe um CPF ou CNPJ válido.');

            return;
        }

        $valid = match (strlen($value)) {
            11 => Document::isValidCpf($value),
            14 => Document::isValidCnpj($value),
            default => false,
        };

        if (! $valid) {
            $fail('Informe um CPF ou CNPJ válido.');
        }
    }
}
