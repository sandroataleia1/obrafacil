<?php

namespace App\Budgets;

/**
 * BUDGET-API-01. The single place every Budget money formula is computed
 * — never duplicated inline in a Service/Controller.
 *
 * Canonical formulas (mirrors ServiceOrderCalculator's
 * grossLine()/lineTotal() exactly):
 *   gross_sale      = round(quantity × unit_price, 2)
 *   line_total      = gross_sale - line_discount
 *   line_cost_total  = quantity × unit_cost            (rounded to 2dp, or
 *                      NULL when unit_cost is NULL)
 *   subtotal         = SUM(line_total)
 *   cost_subtotal    = SUM(line_cost_total), or NULL the instant ANY item
 *                      has a NULL line_cost_total (never silently 0)
 *   margin_amount    = subtotal - cost_subtotal, or NULL when
 *                      cost_subtotal is NULL — CAN be negative (selling
 *                      below cost is valid), never clamped
 *   margin_percentage = margin_amount / cost_subtotal × 100, or NULL
 *                      when margin_amount (equivalently cost_subtotal)
 *                      is NULL, or when cost_subtotal is zero —
 *                      100% derived, never accepted as input anywhere
 *   total            = subtotal - discount_amount
 */
final class BudgetCalculator
{
    public static function grossSale(string $quantity, string $unitPrice): string
    {
        return Money::round(Money::multiply($quantity, $unitPrice), 2);
    }

    public static function lineTotal(string $quantity, string $unitPrice, string $lineDiscount): string
    {
        $grossSale = self::grossSale($quantity, $unitPrice);

        return Money::subtract($grossSale, $lineDiscount);
    }

    public static function lineCostTotal(string $quantity, ?string $unitCost): ?string
    {
        if ($unitCost === null) {
            return null;
        }

        return Money::round(Money::multiply($quantity, $unitCost), 2);
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

    /**
     * @param  iterable<string|null>  $lineCostTotals
     */
    public static function costSubtotal(iterable $lineCostTotals): ?string
    {
        $sum = '0.00';
        foreach ($lineCostTotals as $lineCostTotal) {
            if ($lineCostTotal === null) {
                return null;
            }
            $sum = Money::add($sum, (string) $lineCostTotal);
        }

        return $sum;
    }

    public static function marginAmount(string $subtotal, ?string $costSubtotal): ?string
    {
        if ($costSubtotal === null) {
            return null;
        }

        return Money::subtract($subtotal, $costSubtotal);
    }

    public static function marginPercentage(?string $marginAmount, ?string $costSubtotal): ?string
    {
        if ($marginAmount === null || $costSubtotal === null || Money::compare($costSubtotal, '0.00') === 0) {
            return null;
        }

        return Money::round(Money::multiply(Money::divide($marginAmount, $costSubtotal), '100'), 4);
    }

    public static function total(string $subtotal, string $discountAmount): string
    {
        return Money::subtract($subtotal, $discountAmount);
    }
}
