<?php

namespace App\Notifications\Settings;

use App\Models\Company;
use App\Models\NotificationPreference;
use App\Models\NotificationSetting;
use App\Models\User;
use App\Notifications\Support\NotificationChannel;
use App\Notifications\Support\NotificationEventType;
use App\Notifications\Support\NotificationSettingsDefaults;
use App\Rules\E164Phone;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;

/**
 * The single place that assembles and persists notification settings +
 * preferences (NOTIFICATIONS-API-01 §32 — "controller fino"). Two entry
 * points:
 *
 *  - effective(): read-only, side-effect-free (§5) — used by GET. Never
 *    creates a NotificationSetting/NotificationPreference row just to
 *    answer a read.
 *  - save(): the only way notification_settings/notification_preferences
 *    rows are written from this API — one real upsert per call (§21), both
 *    tables inside one transaction (§20).
 */
class NotificationSettingsService
{
    /**
     * @return array<int, NotificationEventType>
     */
    public function configurableEventTypes(): array
    {
        return array_values(array_filter(
            NotificationEventType::cases(),
            fn (NotificationEventType $type) => $type->isUserConfigurable(),
        ));
    }

    public function effective(Company $company, User $user): NotificationSettingsSnapshot
    {
        $setting = NotificationSetting::query()->where('user_id', $user->id)->first();
        $preferenceMap = $this->currentPreferenceMap($user);

        return $this->buildSnapshot($company, $user, $setting, $preferenceMap);
    }

    /**
     * @param  array<string, mixed>  $validated  NotificationSettingsRequest::validated() shape.
     */
    public function save(Company $company, User $user, array $validated): NotificationSettingsSnapshot
    {
        return DB::transaction(function () use ($company, $user, $validated) {
            $attributes = $this->normalizeSettingAttributes($validated);
            $now = now();

            NotificationSetting::upsert([[
                'id' => (string) Str::uuid(),
                'company_id' => $company->id,
                'user_id' => $user->id,
                'whatsapp_enabled' => $attributes['whatsapp_enabled'],
                'quiet_hours_enabled' => $attributes['quiet_hours_enabled'],
                'quiet_start' => $attributes['quiet_start'],
                'quiet_end' => $attributes['quiet_end'],
                'daily_summary_enabled' => $attributes['daily_summary_enabled'],
                'daily_summary_time' => $attributes['daily_summary_time'],
                'weekly_summary_enabled' => $attributes['weekly_summary_enabled'],
                'weekly_summary_day' => $attributes['weekly_summary_day'],
                'weekly_summary_time' => $attributes['weekly_summary_time'],
                'created_at' => $now,
                'updated_at' => $now,
            ]], uniqueBy: ['company_id', 'user_id'], update: [
                'whatsapp_enabled', 'quiet_hours_enabled', 'quiet_start', 'quiet_end',
                'daily_summary_enabled', 'daily_summary_time',
                'weekly_summary_enabled', 'weekly_summary_day', 'weekly_summary_time',
                'updated_at',
            ]);

            // NOTIFICATIONS-API-01A: a PUT is a complete snapshot (§19 of
            // the original gate) — every user-configurable event type gets
            // a row every time, not just the ones the client happened to
            // include. Building rows only from $validated['preferences']
            // left a previously-true, now-omitted preference untouched
            // (still true) instead of reverting it to false, which is the
            // documented contract for an omitted configurable event.
            $submittedMap = collect($validated['preferences'] ?? [])
                ->mapWithKeys(fn (array $preference) => [$preference['event_type'] => (bool) $preference['enabled']])
                ->all();

            $preferenceRows = array_map(fn (NotificationEventType $type) => [
                'id' => (string) Str::uuid(),
                'company_id' => $company->id,
                'user_id' => $user->id,
                'event_type' => $type->value,
                'channel' => NotificationChannel::WhatsApp->value,
                // Omitted = false — never preserves a stale true from a
                // previous PUT (§2/§5/§7). configurableEventTypes() (not
                // NotificationEventType::cases()) stays the only source of
                // which event types ever get a generic row — system.test
                // and the two summary.* types never do (§6).
                'enabled' => $submittedMap[$type->value] ?? false,
                'created_at' => $now,
                'updated_at' => $now,
            ], $this->configurableEventTypes());

            NotificationPreference::upsert(
                $preferenceRows,
                uniqueBy: ['company_id', 'user_id', 'event_type', 'channel'],
                update: ['enabled', 'updated_at'],
            );

            $setting = NotificationSetting::query()->where('user_id', $user->id)->first();
            $preferenceMap = $this->currentPreferenceMap($user);

            return $this->buildSnapshot($company, $user, $setting, $preferenceMap);
        });
    }

    /**
     * @return array<string, bool> keyed by event_type value
     */
    private function currentPreferenceMap(User $user): array
    {
        return NotificationPreference::query()
            ->where('user_id', $user->id)
            ->where('channel', NotificationChannel::WhatsApp)
            ->get()
            ->mapWithKeys(fn (NotificationPreference $preference) => [$preference->event_type->value => $preference->enabled])
            ->all();
    }

    /**
     * @param  array<string, bool>  $preferenceMap
     */
    private function buildSnapshot(Company $company, User $user, ?NotificationSetting $setting, array $preferenceMap): NotificationSettingsSnapshot
    {
        $phone = $user->phone;
        $canEnableWhatsapp = $this->isValidE164($phone);

        $preferences = array_map(fn (NotificationEventType $type) => [
            'event_type' => $type->value,
            'group' => $type->group(),
            // §22: an event type absent from notification_preferences is
            // never treated as "enabled by default" — it renders as false,
            // same semantics NotificationDispatcher already relies on.
            'enabled' => $preferenceMap[$type->value] ?? false,
        ], $this->configurableEventTypes());

        return new NotificationSettingsSnapshot(
            whatsappEnabled: $setting?->whatsapp_enabled ?? NotificationSettingsDefaults::WHATSAPP_ENABLED,
            quietHoursEnabled: $setting?->quiet_hours_enabled ?? NotificationSettingsDefaults::QUIET_HOURS_ENABLED,
            quietStart: $this->formatTime($setting?->quiet_start) ?? NotificationSettingsDefaults::QUIET_START,
            quietEnd: $this->formatTime($setting?->quiet_end) ?? NotificationSettingsDefaults::QUIET_END,
            dailySummaryEnabled: $setting?->daily_summary_enabled ?? NotificationSettingsDefaults::DAILY_SUMMARY_ENABLED,
            dailySummaryTime: $this->formatTime($setting?->daily_summary_time) ?? NotificationSettingsDefaults::DAILY_SUMMARY_TIME,
            weeklySummaryEnabled: $setting?->weekly_summary_enabled ?? NotificationSettingsDefaults::WEEKLY_SUMMARY_ENABLED,
            weeklySummaryDay: $setting?->weekly_summary_day ?? NotificationSettingsDefaults::WEEKLY_SUMMARY_DAY,
            weeklySummaryTime: $this->formatTime($setting?->weekly_summary_time) ?? NotificationSettingsDefaults::WEEKLY_SUMMARY_TIME,
            timezone: $company->timezone,
            recipientPhone: $phone,
            canEnableWhatsapp: $canEnableWhatsapp,
            preferences: $preferences,
        );
    }

    /**
     * §8/§9: a disabled summary always persists as null timing fields,
     * regardless of what the client sent — there is never a stored
     * "enabled=false but time=08:00" inconsistency to reason about later.
     *
     * @param  array<string, mixed>  $validated
     * @return array<string, mixed>
     */
    private function normalizeSettingAttributes(array $validated): array
    {
        $dailyEnabled = (bool) $validated['daily_summary_enabled'];
        $weeklyEnabled = (bool) $validated['weekly_summary_enabled'];

        return [
            'whatsapp_enabled' => (bool) $validated['whatsapp_enabled'],
            'quiet_hours_enabled' => (bool) $validated['quiet_hours_enabled'],
            'quiet_start' => $validated['quiet_start'] ?? NotificationSettingsDefaults::QUIET_START,
            'quiet_end' => $validated['quiet_end'] ?? NotificationSettingsDefaults::QUIET_END,
            'daily_summary_enabled' => $dailyEnabled,
            'daily_summary_time' => $dailyEnabled ? $validated['daily_summary_time'] : null,
            'weekly_summary_enabled' => $weeklyEnabled,
            'weekly_summary_day' => $weeklyEnabled ? $validated['weekly_summary_day'] : null,
            'weekly_summary_time' => $weeklyEnabled ? $validated['weekly_summary_time'] : null,
        ];
    }

    private function formatTime(?string $value): ?string
    {
        if ($value === null) {
            return null;
        }

        // Postgres `time` columns come back as "HH:MM:SS" — the API
        // contract's H:i form drops the seconds.
        return substr($value, 0, 5);
    }

    private function isValidE164(?string $phone): bool
    {
        if ($phone === null) {
            return false;
        }

        $validator = Validator::make(['phone' => $phone], ['phone' => [new E164Phone]]);

        return $validator->passes();
    }
}
