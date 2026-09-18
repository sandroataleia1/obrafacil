<?php

namespace App\Purchases;

/**
 * SUPPLY-API-01C §12/§61. The single place every PurchaseOrder money
 * formula is computed — never persisted, never duplicated inline.
 *
 * Canonical formulas:
 *   line_total  = round(quantity × unit_price, 2)
 *   order total = SUM(line_total)   — summed AFTER each line is already
 *                                     rounded, never round(SUM(...)) (§61).
 */
final class PurchaseOrderCalculator
{
    public static function lineTotal(string $quantity, string $unitPrice): string
    {
        return Money::round(Money::multiply($quantity, $unitPrice), 2);
    }

    /**
     * @param  iterable<string>  $lineTotals
     */
    public static function total(iterable $lineTotals): string
    {
        $sum = '0.00';
        foreach ($lineTotals as $lineTotal) {
            $sum = Money::add($sum, (string) $lineTotal);
        }

        return $sum;
    }
}
