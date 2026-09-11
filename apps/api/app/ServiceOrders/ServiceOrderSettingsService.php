<?php

namespace App\ServiceOrders;

use App\Models\ServiceOrderSetting;

/**
 * BACKEND-06 §31-35/§32. GET never writes a row for a company that hasn't
 * customized its default yet (§32) — the canonical default ("0.00") is
 * simply returned in memory. PUT upserts, tenant-safe (`company_id` is
 * never read from the request — it comes from CurrentCompanyContext via
 * BelongsToCompany, same as every other tenant-scoped create).
 */
class ServiceOrderSettingsService
{
    public const string DEFAULT_TRAVEL_FEE = '0.00';

    public function get(): ServiceOrderSetting
    {
        $existing = ServiceOrderSetting::query()->first();

        if ($existing !== null) {
            return $existing;
        }

        return new ServiceOrderSetting([
            'default_travel_fee' => self::DEFAULT_TRAVEL_FEE,
        ]);
    }

    public function getDefaultTravelFee(): string
    {
        return (string) $this->get()->default_travel_fee;
    }

    public function update(string $defaultTravelFee): ServiceOrderSetting
    {
        $normalized = Money::normalize($defaultTravelFee);
        $existing = ServiceOrderSetting::query()->first();

        if ($existing !== null) {
            $existing->default_travel_fee = $normalized;
            $existing->save();

            return $existing;
        }

        return ServiceOrderSetting::create([
            'default_travel_fee' => $normalized,
        ]);
    }
}
