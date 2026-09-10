<?php

namespace Tests\Unit\Notifications;

use App\Models\NotificationSetting;
use App\Notifications\Support\QuietHoursService;
use Carbon\Carbon;
use PHPUnit\Framework\TestCase;

class QuietHoursServiceTest extends TestCase
{
    private function settings(string $start, string $end, bool $enabled = true): NotificationSetting
    {
        return new NotificationSetting([
            'quiet_hours_enabled' => $enabled,
            'quiet_start' => $start,
            'quiet_end' => $end,
        ]);
    }

    public function test_disabled_quiet_hours_always_allow_sending(): void
    {
        $service = new QuietHoursService;
        $settings = $this->settings('21:00', '07:00', enabled: false);

        $this->assertTrue($service->canSendNow($settings, 'America/Sao_Paulo', Carbon::parse('2026-01-01 23:00:00', 'America/Sao_Paulo')));
    }

    public function test_overnight_window_blocks_late_night(): void
    {
        $service = new QuietHoursService;
        $settings = $this->settings('21:00', '07:00');

        $this->assertFalse($service->canSendNow($settings, 'America/Sao_Paulo', Carbon::parse('2026-01-01 23:30:00', 'America/Sao_Paulo')));
    }

    public function test_overnight_window_blocks_early_morning(): void
    {
        $service = new QuietHoursService;
        $settings = $this->settings('21:00', '07:00');

        $this->assertFalse($service->canSendNow($settings, 'America/Sao_Paulo', Carbon::parse('2026-01-01 05:00:00', 'America/Sao_Paulo')));
    }

    public function test_overnight_window_allows_daytime(): void
    {
        $service = new QuietHoursService;
        $settings = $this->settings('21:00', '07:00');

        $this->assertTrue($service->canSendNow($settings, 'America/Sao_Paulo', Carbon::parse('2026-01-01 14:00:00', 'America/Sao_Paulo')));
    }

    public function test_same_day_window_blocks_only_inside_it(): void
    {
        $service = new QuietHoursService;
        $settings = $this->settings('13:00', '14:00');

        $this->assertFalse($service->canSendNow($settings, 'America/Sao_Paulo', Carbon::parse('2026-01-01 13:30:00', 'America/Sao_Paulo')));
        $this->assertTrue($service->canSendNow($settings, 'America/Sao_Paulo', Carbon::parse('2026-01-01 15:00:00', 'America/Sao_Paulo')));
    }

    public function test_next_allowed_time_is_todays_end_when_still_ahead(): void
    {
        $service = new QuietHoursService;
        $settings = $this->settings('21:00', '07:00');
        $now = Carbon::parse('2026-01-01 23:30:00', 'America/Sao_Paulo');

        $next = $service->nextAllowedTime($settings, 'America/Sao_Paulo', $now);

        $this->assertSame('2026-01-02 07:00:00', $next->format('Y-m-d H:i:s'));
    }

    public function test_next_allowed_time_rolls_to_the_following_day_when_already_past_end(): void
    {
        $service = new QuietHoursService;
        $settings = $this->settings('21:00', '07:00');
        $now = Carbon::parse('2026-01-01 05:00:00', 'America/Sao_Paulo');

        $next = $service->nextAllowedTime($settings, 'America/Sao_Paulo', $now);

        $this->assertSame('2026-01-01 07:00:00', $next->format('Y-m-d H:i:s'));
    }
}
