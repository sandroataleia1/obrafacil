<?php

namespace App\Support;

/**
 * Canonical (digits-only) document handling — normalization, real
 * check-digit validation (§9: "não validar só comprimento"), and valid
 * test-value generation for factories (§60: "não usar CPF/CNPJ aleatórios
 * inválidos").
 */
final class Document
{
    public static function digitsOnly(?string $value): ?string
    {
        if ($value === null) {
            return null;
        }

        $digits = preg_replace('/\D+/', '', $value) ?? '';

        return $digits === '' ? null : $digits;
    }

    public static function isValidCpf(string $digits): bool
    {
        if (! preg_match('/^\d{11}$/', $digits) || preg_match('/^(\d)\1{10}$/', $digits)) {
            return false;
        }

        $base = array_map('intval', str_split(substr($digits, 0, 9)));
        $firstDigit = self::sequentialCheckDigit($base, 10);
        $secondDigit = self::sequentialCheckDigit([...$base, $firstDigit], 11);

        return $digits === implode('', $base).$firstDigit.$secondDigit;
    }

    public static function isValidCnpj(string $digits): bool
    {
        if (! preg_match('/^\d{14}$/', $digits) || preg_match('/^(\d)\1{13}$/', $digits)) {
            return false;
        }

        $base = array_map('intval', str_split(substr($digits, 0, 12)));
        $firstDigit = self::weightedCheckDigit($base, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
        $secondDigit = self::weightedCheckDigit([...$base, $firstDigit], [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);

        return $digits === implode('', $base).$firstDigit.$secondDigit;
    }

    /** A random, check-digit-valid CPF — for factories/tests only, never a real person's document. */
    public static function generateCpf(): string
    {
        $base = [];
        for ($i = 0; $i < 9; $i++) {
            $base[] = random_int(0, 9);
        }

        $firstDigit = self::sequentialCheckDigit($base, 10);
        $secondDigit = self::sequentialCheckDigit([...$base, $firstDigit], 11);

        return implode('', $base).$firstDigit.$secondDigit;
    }

    /** A random, check-digit-valid CNPJ — for factories/tests only, never a real company's document. */
    public static function generateCnpj(): string
    {
        $base = [];
        for ($i = 0; $i < 12; $i++) {
            $base[] = random_int(0, 9);
        }

        $firstDigit = self::weightedCheckDigit($base, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
        $secondDigit = self::weightedCheckDigit([...$base, $firstDigit], [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);

        return implode('', $base).$firstDigit.$secondDigit;
    }

    /**
     * @param  array<int, int>  $digits
     */
    private static function sequentialCheckDigit(array $digits, int $startWeight): int
    {
        $sum = 0;
        $weight = $startWeight;
        foreach ($digits as $digit) {
            $sum += $digit * $weight;
            $weight--;
        }

        $mod = $sum % 11;

        return $mod < 2 ? 0 : 11 - $mod;
    }

    /**
     * @param  array<int, int>  $digits
     * @param  array<int, int>  $weights
     */
    private static function weightedCheckDigit(array $digits, array $weights): int
    {
        $sum = 0;
        foreach ($digits as $i => $digit) {
            $sum += $digit * $weights[$i];
        }

        $mod = $sum % 11;

        return $mod < 2 ? 0 : 11 - $mod;
    }
}
