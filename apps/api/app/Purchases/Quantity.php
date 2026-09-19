<?php

namespace App\Purchases;

use App\ServiceOrders\Money as ServiceOrderMoney;

/**
 * SUPPLY-API-01D §17. A thin local wrapper around the exact same
 * decimal-string (`bcmath`, never float) implementation ServiceOrder/
 * Budget/Purchase Money already use — kept as a separate class purely so
 * every quantity calculation (ordered/received/remaining) reads with a
 * quantity-shaped contract instead of borrowing Money's semantics. All
 * quantities in this domain are scale 3, never scale 2.
 */
final class Quantity
{
    private const int SCALE = 3;

    public static function normalize(string $value): string
    {
        return ServiceOrderMoney::normalize($value, self::SCALE);
    }

    public static function add(string $a, string $b): string
    {
        return ServiceOrderMoney::add($a, $b, self::SCALE);
    }

    public static function subtract(string $a, string $b): string
    {
        return ServiceOrderMoney::subtract($a, $b, self::SCALE);
    }

    public static function compare(string $a, string $b): int
    {
        return ServiceOrderMoney::compare($a, $b, self::SCALE + 10);
    }
}
