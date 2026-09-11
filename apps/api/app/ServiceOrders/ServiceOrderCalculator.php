<?php

namespace App\ServiceOrders;

/**
 * BACKEND-06 §25/§27. The single place every ServiceOrder money formula
 * is computed — never duplicated inline in a Service/Controller.
 *
 * Canonical formulas (§25/§27):
 *   gross_line = quantity × unit_price                    (rounded to 2dp)
 *   line_total = gross_line - line_discount
 *   subtotal   = SUM(line_total)
 *   total      = subtotal - order_discount + travel_fee
 */
final class ServiceOrderCalculator
{
    public static function grossLine(string $quantity, string $unitPrice): string
    {
        return Money::round(Money::multiply($quantity, $unitPrice), 2);
    }

    public static function lineTotal(string $quantity, string $unitPrice, string $lineDiscount): string
    {
        $gross = self::grossLine($quantity, $unitPrice);

        return Money::subtract($gross, $lineDiscount);
    }

    /**
     * @param  iterable<string>  $lineTotals
     */
    public static function subtotal(iterable $lineTotals): string
    {
        $sum = '0.00';
        foreach ($lineTotals as $lineTotal) {
            $sum = Money::add($sum, (string) $lineTotal);
        }

        return $sum;
    }

    public static function total(string $subtotal, string $orderDiscount, string $travelFee): string
    {
        return Money::add(Money::subtract($subtotal, $orderDiscount), $travelFee);
    }
}
