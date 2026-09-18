<?php

namespace App\Purchases;

use App\ServiceOrders\Money as ServiceOrderMoney;

/**
 * SUPPLY-API-01C §12. A thin local wrapper delegating to the exact same
 * decimal-string (`bcmath`, never float) implementation ServiceOrder/
 * Budget already use — no separate/duplicated money math for Purchase.
 */
final class Money
{
    public static function normalize(string $value, int $decimals = 2): string
    {
        return ServiceOrderMoney::normalize($value, $decimals);
    }

    public static function add(string $a, string $b, int $decimals = 2): string
    {
        return ServiceOrderMoney::add($a, $b, $decimals);
    }

    public static function subtract(string $a, string $b, int $decimals = 2): string
    {
        return ServiceOrderMoney::subtract($a, $b, $decimals);
    }

    public static function multiply(string $a, string $b, int $scale = 10): string
    {
        return ServiceOrderMoney::multiply($a, $b, $scale);
    }

    public static function compare(string $a, string $b, int $scale = 10): int
    {
        return ServiceOrderMoney::compare($a, $b, $scale);
    }

    public static function round(string $value, int $decimals = 2): string
    {
        return ServiceOrderMoney::round($value, $decimals);
    }
}
