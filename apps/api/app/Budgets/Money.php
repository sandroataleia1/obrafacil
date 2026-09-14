<?php

namespace App\Budgets;

use App\ServiceOrders\Money as ServiceOrderMoney;

/**
 * BUDGET-API-01. Every monetary/decimal operation in the Budgets domain
 * delegates to `App\ServiceOrders\Money` — the exact-decimal-string
 * bcmath implementation (round-half-up, never a PHP float) is never
 * duplicated. This thin wrapper exists only so Budgets code depends on
 * `App\Budgets\Money`, not directly on a ServiceOrders-namespaced class,
 * keeping the two domains decoupled even though they share one
 * implementation.
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

    public static function divide(string $a, string $b, int $scale = 10): string
    {
        return bcdiv($a, $b, $scale);
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
