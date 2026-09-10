<?php

namespace App\Notifications\Settings;

/**
 * The full read model behind GET/PUT /api/v1/notifications/settings —
 * assembled by NotificationSettingsService from effective defaults, a
 * possibly-absent NotificationSetting row, and the user's configurable
 * preferences. Never an Eloquent model itself: GET must be able to produce
 * this without persisting anything (§5), and a bare settings row alone
 * doesn't carry `timezone`/`recipient_phone`/`can_enable_whatsapp`, which
 * come from Company/User, not notification_settings.
 */
final class NotificationSettingsSnapshot
{
    /**
     * @param  array<int, array{event_type: string, group: string, enabled: bool}>  $preferences
     */
    public function __construct(
        public readonly bool $whatsappEnabled,
        public readonly bool $quietHoursEnabled,
        public readonly string $quietStart,
        public readonly string $quietEnd,
        public readonly bool $dailySummaryEnabled,
        public readonly ?string $dailySummaryTime,
        public readonly bool $weeklySummaryEnabled,
        public readonly ?int $weeklySummaryDay,
        public readonly ?string $weeklySummaryTime,
        public readonly string $timezone,
        public readonly ?string $recipientPhone,
        public readonly bool $canEnableWhatsapp,
        public readonly array $preferences,
    ) {}
}
