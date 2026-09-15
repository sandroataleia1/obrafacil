<?php

namespace App\Budgets\Proposal;

/**
 * PROPOSAL-DOC-01A §31-32: string-safe display formatters for the PDF —
 * NEVER routes a persisted decimal string through `(float)`/`(int)` as a
 * source of truth. Quantity/money values are always already-authoritative
 * decimal strings from the database; these methods only reformat their
 * textual representation for human display.
 */
final class ProposalFormatter
{
    /**
     * "1.000" -> "1", "1.500" -> "1,5", "0.250" -> "0,25". Trims trailing
     * zeros (and a then-trailing decimal point) from the fractional part,
     * then swaps the decimal separator for the BR comma — never via
     * float parsing/rounding.
     */
    public static function quantity(string $decimalString): string
    {
        $value = trim($decimalString);
        $negative = str_starts_with($value, '-');
        if ($negative) {
            $value = substr($value, 1);
        }

        if (str_contains($value, '.')) {
            $value = rtrim($value, '0');
            $value = rtrim($value, '.');
        }

        if ($value === '') {
            $value = '0';
        }

        return ($negative ? '-' : '').str_replace('.', ',', $value);
    }

    /**
     * "1234.56" -> "R$ 1.234,56". "-20.00" -> "-R$ 20,00" (a negative
     * money string is preserved as-is — callers decide whether a
     * negative value is even reachable in the context they're rendering;
     * this formatter never silently clamps to zero).
     */
    public static function money(string $decimalString): string
    {
        $value = trim($decimalString);
        $negative = str_starts_with($value, '-');
        if ($negative) {
            $value = substr($value, 1);
        }

        [$integerPart, $decimalPart] = array_pad(explode('.', $value, 2), 2, '00');
        $decimalPart = str_pad(substr($decimalPart, 0, 2), 2, '0');

        $integerPart = ltrim($integerPart, '0');
        if ($integerPart === '') {
            $integerPart = '0';
        }

        $withThousands = strrev(implode('.', str_split(strrev($integerPart), 3)));

        return ($negative ? '-' : '').'R$ '.$withThousands.','.$decimalPart;
    }

    /**
     * "12345678000190" -> "12.345.678/0001-90". Returns null unchanged
     * for anything not exactly 14 digits (never guesses a malformed
     * document into a wrong mask).
     */
    public static function cnpj(?string $digitsOnly): ?string
    {
        if ($digitsOnly === null || ! preg_match('/^\d{14}$/', $digitsOnly)) {
            return $digitsOnly;
        }

        return sprintf(
            '%s.%s.%s/%s-%s',
            substr($digitsOnly, 0, 2),
            substr($digitsOnly, 2, 3),
            substr($digitsOnly, 5, 3),
            substr($digitsOnly, 8, 4),
            substr($digitsOnly, 12, 2),
        );
    }

    /**
     * "+5511987654321" -> "(11) 98765-4321". Falls back to the raw value
     * for anything not in the expected `+55` + 10/11-digit shape.
     */
    public static function phone(?string $e164): ?string
    {
        if ($e164 === null) {
            return null;
        }

        $digits = str_starts_with($e164, '+55') ? substr($e164, 3) : preg_replace('/\D/', '', $e164);

        if ($digits === null || ! preg_match('/^\d{10,11}$/', $digits)) {
            return $e164;
        }

        $ddd = substr($digits, 0, 2);
        $rest = substr($digits, 2);

        return strlen($rest) === 9
            ? sprintf('(%s) %s-%s', $ddd, substr($rest, 0, 5), substr($rest, 5))
            : sprintf('(%s) %s-%s', $ddd, substr($rest, 0, 4), substr($rest, 4));
    }

    /** "01001000" -> "01001-000". Returns null unchanged for anything not exactly 8 digits. */
    public static function cep(?string $digitsOnly): ?string
    {
        if ($digitsOnly === null || ! preg_match('/^\d{8}$/', $digitsOnly)) {
            return $digitsOnly;
        }

        return substr($digitsOnly, 0, 5).'-'.substr($digitsOnly, 5);
    }
}
