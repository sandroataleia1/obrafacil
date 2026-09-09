<?php

namespace App\Rules;

use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

/**
 * Matches the same canonical format enforced by the `users_phone_e164_check`
 * database constraint. Reserved for a future write endpoint (registration /
 * profile update) — not wired to any route yet this round.
 */
class E164Phone implements ValidationRule
{
    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if (! is_string($value) || ! preg_match('/^\+[1-9][0-9]{6,14}$/', $value)) {
            $fail('The :attribute must be a valid phone number in E.164 format (e.g. +5511999999999).');
        }
    }
}
