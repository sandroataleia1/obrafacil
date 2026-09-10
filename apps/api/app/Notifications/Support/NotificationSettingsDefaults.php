<?php

namespace App\Notifications\Support;

/**
 * The single source of truth for the effective settings a user sees when
 * they have no notification_settings row yet (NOTIFICATIONS-API-01 §5/§6)
 * — mirrors the DB column defaults in the notification_settings migrations,
 * but as PHP values so nothing (GET's default assembly, PUT's
 * normalization, tests) has to duplicate these literals independently.
 */
final class NotificationSettingsDefaults
{
    public const bool WHATSAPP_ENABLED = false;

    public const bool QUIET_HOURS_ENABLED = true;

    public const string QUIET_START = '21:00';

    public const string QUIET_END = '07:00';

    public const bool DAILY_SUMMARY_ENABLED = false;

    public const ?string DAILY_SUMMARY_TIME = null;

    public const bool WEEKLY_SUMMARY_ENABLED = false;

    public const ?int WEEKLY_SUMMARY_DAY = null;

    public const ?string WEEKLY_SUMMARY_TIME = null;
}
