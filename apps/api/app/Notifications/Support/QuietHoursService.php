<?php

namespace App\Notifications\Support;

use App\Models\NotificationSetting;
use Carbon\Carbon;
use Carbon\CarbonInterface;

/**
 * A pure decision service (§23) — no queries, no side effects. Always
 * evaluated in the company's own timezone (§24), never the server's.
 */
class QuietHoursService
{
    public function canSendNow(NotificationSetting $settings, string $timezone, ?CarbonInterface $now = null): bool
    {
        if (! $settings->quiet_hours_enabled) {
            return true;
        }

        $local = $this->toLocal($timezone, $now);

        return ! $this->isWithinQuietWindow($local, (string) $settings->quiet_start, (string) $settings->quiet_end);
    }

    /**
     * The next instant (in the company's timezone) at which sending is
     * allowed again — the caller never discards a delivery just because
     * "now" is inside quiet hours (§23), it queues for this moment instead.
     */
    public function nextAllowedTime(NotificationSetting $settings, string $timezone, ?CarbonInterface $now = null): CarbonInterface
    {
        $local = $this->toLocal($timezone, $now);
        [$endHour, $endMinute] = $this->parseTime((string) $settings->quiet_end);

        $end = $local->copy()->setTime($endHour, $endMinute, 0);
        if ($end->lessThanOrEqualTo($local)) {
            $end->addDay();
        }

        return $end;
    }

    private function toLocal(string $timezone, ?CarbonInterface $now): Carbon
    {
        return ($now ?? Carbon::now($timezone))->copy()->setTimezone($timezone);
    }

    /**
     * Handles both same-day windows (e.g. 13:00 -> 14:00) and overnight
     * windows that cross midnight (e.g. 21:00 -> 07:00, the default).
     */
    private function isWithinQuietWindow(Carbon $local, string $start, string $end): bool
    {
        $nowMinutes = $local->hour * 60 + $local->minute;
        [$startHour, $startMinute] = $this->parseTime($start);
        [$endHour, $endMinute] = $this->parseTime($end);
        $startMinutes = $startHour * 60 + $startMinute;
        $endMinutes = $endHour * 60 + $endMinute;

        if ($startMinutes === $endMinutes) {
            return false;
        }

        if ($startMinutes < $endMinutes) {
            return $nowMinutes >= $startMinutes && $nowMinutes < $endMinutes;
        }

        return $nowMinutes >= $startMinutes || $nowMinutes < $endMinutes;
    }

    /**
     * @return array{0: int, 1: int}
     */
    private function parseTime(string $time): array
    {
        [$hour, $minute] = array_pad(explode(':', $time), 2, '0');

        return [(int) $hour, (int) $minute];
    }
}
