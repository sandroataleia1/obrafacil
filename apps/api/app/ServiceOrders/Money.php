<?php

namespace App\ServiceOrders;

/**
 * BACKEND-06 §26. Exact decimal-string money math — never PHP float. The
 * `bcmath` extension is enabled in the API container
 * (infrastructure/docker/api/Dockerfile) specifically for this class.
 *
 * Every public method takes and returns decimal strings ("18.50", "0.00",
 * never a `float`/`int`), so a value can flow from an Eloquent
 * `decimal:2`/`decimal:3` cast (itself already a string) through any
 * number of arithmetic operations and back into a column without ever
 * touching floating-point representation.
 */
final class Money
{
    /**
     * Normalizes a decimal string to exactly `$decimals` places —
     * "80" -> "80.00", "18.5" -> "18.50". `bcadd(...,0,$decimals)`
     * truncates/pads to the given scale without any rounding ambiguity,
     * since the added operand is exactly `0`.
     */
    public static function normalize(string $value, int $decimals = 2): string
    {
        return bcadd($value, '0', $decimals);
    }

    public static function add(string $a, string $b, int $decimals = 2): string
    {
        return bcadd($a, $b, $decimals);
    }

    public static function subtract(string $a, string $b, int $decimals = 2): string
    {
        return bcsub($a, $b, $decimals);
    }

    /**
     * Multiplies at a high intermediate scale (never rounded here) — the
     * caller decides when/whether to round the result via `round()`.
     */
    public static function multiply(string $a, string $b, int $scale = 10): string
    {
        return bcmul($a, $b, $scale);
    }

    /**
     * -1 / 0 / 1, exactly like `<=>`, compared at a high internal scale so
     * two representations of the same value ("5" vs "5.00") always compare
     * equal.
     */
    public static function compare(string $a, string $b, int $scale = 10): int
    {
        return bccomp($a, $b, $scale);
    }

    /**
     * §25: canonical rounding rule for this whole domain — round-HALF-UP
     * (away from zero on the exact half), computed purely in decimal
     * string arithmetic. `bcadd`/`bcsub`/`bcmul`/`bcdiv` all TRUNCATE
     * (never round) to the requested scale, so half-up rounding is
     * implemented explicitly: add half a unit in the last kept decimal
     * place, then truncate to that scale. E.g. round("2.345", 2):
     * 2.345 + 0.005 = 2.350, truncated to 2 places = "2.35". This is the
     * one and only rounding rule used anywhere in the ServiceOrder money
     * pipeline (gross line, line_total, subtotal, total).
     */
    public static function round(string $value, int $decimals = 2): string
    {
        $isNegative = bccomp($value, '0', $decimals + 10) < 0;
        $abs = $isNegative ? bcmul($value, '-1', $decimals + 10) : $value;

        $half = bcdiv('5', bcpow('10', (string) ($decimals + 1)), $decimals + 10);
        $rounded = bcadd($abs, $half, $decimals);

        if ($isNegative && bccomp($rounded, '0', $decimals) !== 0) {
            return "-{$rounded}";
        }

        return $rounded;
    }
}
