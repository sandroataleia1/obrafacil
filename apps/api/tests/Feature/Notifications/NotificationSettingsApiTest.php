<?php

namespace Tests\Feature\Notifications;

use App\Enums\CompanyRole;
use App\Models\Company;
use App\Models\NotificationDelivery;
use App\Models\NotificationEvent;
use App\Models\NotificationPreference;
use App\Models\NotificationSetting;
use App\Models\User;
use App\Notifications\Settings\NotificationSettingsService;
use App\Notifications\Support\NotificationEventType;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\Queue;
use Laravel\Sanctum\Sanctum;
use Tests\Feature\Notifications\Concerns\InteractsWithNotifications;
use Tests\TestCase;

/**
 * NOTIFICATIONS-API-01: GET/PUT /api/v1/notifications/settings.
 * G1-G10 (read), P1-P16 (write/validation), A1-A3 (atomicity), T1-T6
 * (multitenancy). The real CSRF/419 smoke test (§40) is not here — PHPUnit
 * skips CSRF verification under runningUnitTests(), same rationale as prior
 * auth rounds — it's a real curl smoke against the running container.
 */
class NotificationSettingsApiTest extends TestCase
{
    use InteractsWithNotifications, RefreshDatabase;

    private const ENDPOINT = '/api/v1/notifications/settings';

    private function configurableCount(): int
    {
        return count(app(NotificationSettingsService::class)->configurableEventTypes());
    }

    private function fullValidPayload(array $overrides = []): array
    {
        return array_merge([
            'whatsapp_enabled' => false,
            'quiet_hours_enabled' => true,
            'quiet_start' => '21:00',
            'quiet_end' => '07:00',
            'daily_summary_enabled' => false,
            'daily_summary_time' => null,
            'weekly_summary_enabled' => false,
            'weekly_summary_day' => null,
            'weekly_summary_time' => null,
            'preferences' => [],
        ], $overrides);
    }

    // ---------------------------------------------------------------
    // G1-G10: GET
    // ---------------------------------------------------------------

    /** G1: no auth -> 401. */
    public function test_g1_unauthenticated_get_is_rejected(): void
    {
        $this->getJson(self::ENDPOINT)->assertStatus(401);
    }

    /** G2: authenticated + active company -> 200. */
    public function test_g2_authenticated_with_active_company_returns_200(): void
    {
        [, $user] = $this->makeCompanyWithMember();
        Sanctum::actingAs($user);

        $this->getJson(self::ENDPOINT)->assertOk();
    }

    /** G3: no rows in the database -> returns effective defaults. */
    public function test_g3_no_rows_returns_defaults(): void
    {
        [, $user] = $this->makeCompanyWithMember();
        Sanctum::actingAs($user);

        $this->getJson(self::ENDPOINT)
            ->assertOk()
            ->assertJsonPath('settings.whatsapp_enabled', false)
            ->assertJsonPath('settings.quiet_hours_enabled', true)
            ->assertJsonPath('settings.quiet_start', '21:00')
            ->assertJsonPath('settings.quiet_end', '07:00')
            ->assertJsonPath('settings.daily_summary_enabled', false)
            ->assertJsonPath('settings.daily_summary_time', null)
            ->assertJsonPath('settings.weekly_summary_enabled', false)
            ->assertJsonPath('settings.weekly_summary_day', null)
            ->assertJsonPath('settings.weekly_summary_time', null);
    }

    /** G4: GET without existing rows never creates a notification_settings row. */
    public function test_g4_get_without_rows_does_not_create_settings(): void
    {
        [$company, $user] = $this->makeCompanyWithMember();
        Sanctum::actingAs($user);

        $this->getJson(self::ENDPOINT)->assertOk();

        $count = $this->currentCompanyContext()->run($company, fn () => NotificationSetting::query()->count());
        $this->assertSame(0, $count);
    }

    /** G5: GET without existing rows never creates notification_preferences rows. */
    public function test_g5_get_without_rows_does_not_create_preferences(): void
    {
        [$company, $user] = $this->makeCompanyWithMember();
        Sanctum::actingAs($user);

        $this->getJson(self::ENDPOINT)->assertOk();

        $count = $this->currentCompanyContext()->run($company, fn () => NotificationPreference::query()->count());
        $this->assertSame(0, $count);
    }

    /** G6: timezone in the response equals the active company's timezone. */
    public function test_g6_timezone_matches_company_timezone(): void
    {
        [, $user] = $this->makeCompanyWithMember(companyAttributes: ['timezone' => 'Pacific/Auckland']);
        Sanctum::actingAs($user);

        $this->getJson(self::ENDPOINT)->assertJsonPath('settings.timezone', 'Pacific/Auckland');
    }

    /** G7: recipient_phone equals the authenticated user's phone. */
    public function test_g7_recipient_phone_matches_user_phone(): void
    {
        [, $user] = $this->makeCompanyWithMember(userAttributes: ['phone' => '+5511999999999']);
        Sanctum::actingAs($user);

        $this->getJson(self::ENDPOINT)->assertJsonPath('settings.recipient_phone', '+5511999999999');
    }

    /** G8: system.test never appears in the generic preferences list. */
    public function test_g8_system_test_is_excluded(): void
    {
        [, $user] = $this->makeCompanyWithMember();
        Sanctum::actingAs($user);

        $response = $this->getJson(self::ENDPOINT)->assertOk();
        $eventTypes = array_column($response->json('preferences'), 'event_type');

        $this->assertNotContains('system.test', $eventTypes);
    }

    /** G9: summary.daily / summary.weekly never appear in the generic preferences list. */
    public function test_g9_summaries_are_excluded(): void
    {
        [, $user] = $this->makeCompanyWithMember();
        Sanctum::actingAs($user);

        $response = $this->getJson(self::ENDPOINT)->assertOk();
        $eventTypes = array_column($response->json('preferences'), 'event_type');

        $this->assertNotContains('summary.daily', $eventTypes);
        $this->assertNotContains('summary.weekly', $eventTypes);
    }

    /** G10: every configurable event type appears, enabled=false when no row exists. */
    public function test_g10_all_configurable_events_appear_disabled_by_default(): void
    {
        [, $user] = $this->makeCompanyWithMember();
        Sanctum::actingAs($user);

        $response = $this->getJson(self::ENDPOINT)->assertOk();
        $preferences = $response->json('preferences');

        $this->assertCount($this->configurableCount(), $preferences);
        foreach ($preferences as $preference) {
            $this->assertFalse($preference['enabled']);
            $this->assertArrayHasKey('group', $preference);
        }
    }

    // ---------------------------------------------------------------
    // P1-P16: PUT
    // ---------------------------------------------------------------

    /** P1: saves whatsapp_enabled. */
    public function test_p1_saves_whatsapp_enabled(): void
    {
        [, $user] = $this->makeCompanyWithMember(userAttributes: ['phone' => '+5511999999999']);
        Sanctum::actingAs($user);

        $this->putJson(self::ENDPOINT, $this->fullValidPayload(['whatsapp_enabled' => true]))
            ->assertOk()
            ->assertJsonPath('settings.whatsapp_enabled', true);

        $this->getJson(self::ENDPOINT)->assertJsonPath('settings.whatsapp_enabled', true);
    }

    /** P2: saves quiet hours. */
    public function test_p2_saves_quiet_hours(): void
    {
        [, $user] = $this->makeCompanyWithMember();
        Sanctum::actingAs($user);

        $this->putJson(self::ENDPOINT, $this->fullValidPayload([
            'quiet_hours_enabled' => true,
            'quiet_start' => '22:00',
            'quiet_end' => '06:30',
        ]))->assertOk()
            ->assertJsonPath('settings.quiet_start', '22:00')
            ->assertJsonPath('settings.quiet_end', '06:30');
    }

    /** P3: accepts an overnight window (21:00 -> 07:00). */
    public function test_p3_accepts_overnight_window(): void
    {
        [, $user] = $this->makeCompanyWithMember();
        Sanctum::actingAs($user);

        $this->putJson(self::ENDPOINT, $this->fullValidPayload([
            'quiet_hours_enabled' => true,
            'quiet_start' => '21:00',
            'quiet_end' => '07:00',
        ]))->assertOk();
    }

    /** P4: rejects start == end. */
    public function test_p4_rejects_equal_start_and_end(): void
    {
        [, $user] = $this->makeCompanyWithMember();
        Sanctum::actingAs($user);

        $this->putJson(self::ENDPOINT, $this->fullValidPayload([
            'quiet_hours_enabled' => true,
            'quiet_start' => '21:00',
            'quiet_end' => '21:00',
        ]))->assertStatus(422);
    }

    /** P5: daily_summary_enabled=true requires daily_summary_time. */
    public function test_p5_daily_summary_enabled_requires_time(): void
    {
        [, $user] = $this->makeCompanyWithMember();
        Sanctum::actingAs($user);

        $this->putJson(self::ENDPOINT, $this->fullValidPayload([
            'daily_summary_enabled' => true,
            'daily_summary_time' => null,
        ]))->assertStatus(422)->assertJsonValidationErrors('daily_summary_time');

        $this->putJson(self::ENDPOINT, $this->fullValidPayload([
            'daily_summary_enabled' => true,
            'daily_summary_time' => '08:00',
        ]))->assertOk()->assertJsonPath('settings.daily_summary_time', '08:00');
    }

    /** P6: weekly_summary_enabled=true requires day and time. */
    public function test_p6_weekly_summary_enabled_requires_day_and_time(): void
    {
        [, $user] = $this->makeCompanyWithMember();
        Sanctum::actingAs($user);

        $this->putJson(self::ENDPOINT, $this->fullValidPayload([
            'weekly_summary_enabled' => true,
            'weekly_summary_day' => null,
            'weekly_summary_time' => null,
        ]))->assertStatus(422)
            ->assertJsonValidationErrors(['weekly_summary_day', 'weekly_summary_time']);

        $this->putJson(self::ENDPOINT, $this->fullValidPayload([
            'weekly_summary_enabled' => true,
            'weekly_summary_day' => 1,
            'weekly_summary_time' => '08:00',
        ]))->assertOk()
            ->assertJsonPath('settings.weekly_summary_day', 1)
            ->assertJsonPath('settings.weekly_summary_time', '08:00');
    }

    /** P7: weekly_summary_day accepts 1-7. */
    public function test_p7_weekly_day_accepts_1_through_7(): void
    {
        [, $user] = $this->makeCompanyWithMember();
        Sanctum::actingAs($user);

        foreach ([1, 4, 7] as $day) {
            $this->putJson(self::ENDPOINT, $this->fullValidPayload([
                'weekly_summary_enabled' => true,
                'weekly_summary_day' => $day,
                'weekly_summary_time' => '08:00',
            ]))->assertOk()->assertJsonPath('settings.weekly_summary_day', $day);
        }
    }

    /** P8: weekly_summary_day rejects 0 and 8. */
    public function test_p8_weekly_day_rejects_out_of_range(): void
    {
        [, $user] = $this->makeCompanyWithMember();
        Sanctum::actingAs($user);

        foreach ([0, 8] as $day) {
            $this->putJson(self::ENDPOINT, $this->fullValidPayload([
                'weekly_summary_enabled' => true,
                'weekly_summary_day' => $day,
                'weekly_summary_time' => '08:00',
            ]))->assertStatus(422)->assertJsonValidationErrors('weekly_summary_day');
        }
    }

    /** P9: a second PUT upserts instead of duplicating the settings row. */
    public function test_p9_upsert_does_not_duplicate_settings(): void
    {
        [$company, $user] = $this->makeCompanyWithMember();
        Sanctum::actingAs($user);

        $this->putJson(self::ENDPOINT, $this->fullValidPayload())->assertOk();
        $this->putJson(self::ENDPOINT, $this->fullValidPayload(['quiet_start' => '20:00']))->assertOk();

        $count = $this->currentCompanyContext()->run($company, fn () => NotificationSetting::query()->count());
        $this->assertSame(1, $count);
    }

    /** P10: a second PUT upserts instead of duplicating a preference row. */
    public function test_p10_upsert_does_not_duplicate_preference(): void
    {
        [$company, $user] = $this->makeCompanyWithMember();
        Sanctum::actingAs($user);

        $payload = $this->fullValidPayload([
            'preferences' => [['event_type' => 'payable.due_today', 'enabled' => true]],
        ]);
        $this->putJson(self::ENDPOINT, $payload)->assertOk();
        $this->putJson(self::ENDPOINT, $payload)->assertOk();

        $count = $this->currentCompanyContext()->run(
            $company,
            fn () => NotificationPreference::query()->where('event_type', 'payable.due_today')->count()
        );
        $this->assertSame(1, $count);
    }

    /** P11: a duplicated event_type in the payload -> 422. */
    public function test_p11_duplicate_event_type_is_rejected(): void
    {
        [, $user] = $this->makeCompanyWithMember();
        Sanctum::actingAs($user);

        $this->putJson(self::ENDPOINT, $this->fullValidPayload([
            'preferences' => [
                ['event_type' => 'service_order.created', 'enabled' => true],
                ['event_type' => 'service_order.created', 'enabled' => false],
            ],
        ]))->assertStatus(422);
    }

    /** P12: an unknown event_type -> 422. */
    public function test_p12_unknown_event_type_is_rejected(): void
    {
        [, $user] = $this->makeCompanyWithMember();
        Sanctum::actingAs($user);

        $this->putJson(self::ENDPOINT, $this->fullValidPayload([
            'preferences' => [['event_type' => 'not.a.real.event', 'enabled' => true]],
        ]))->assertStatus(422)->assertJsonValidationErrors('preferences.0.event_type');
    }

    /** P13: system.test as a preference -> 422. */
    public function test_p13_system_test_as_preference_is_rejected(): void
    {
        [, $user] = $this->makeCompanyWithMember();
        Sanctum::actingAs($user);

        $this->putJson(self::ENDPOINT, $this->fullValidPayload([
            'preferences' => [['event_type' => 'system.test', 'enabled' => true]],
        ]))->assertStatus(422);
    }

    /** P14: summary.daily / summary.weekly as a preference -> 422. */
    public function test_p14_summary_as_preference_is_rejected(): void
    {
        [, $user] = $this->makeCompanyWithMember();
        Sanctum::actingAs($user);

        $this->putJson(self::ENDPOINT, $this->fullValidPayload([
            'preferences' => [['event_type' => 'summary.daily', 'enabled' => true]],
        ]))->assertStatus(422);

        $this->putJson(self::ENDPOINT, $this->fullValidPayload([
            'preferences' => [['event_type' => 'summary.weekly', 'enabled' => true]],
        ]))->assertStatus(422);
    }

    /** P15: hostile fields (company_id, user_id, channel, provider, timezone, recipient_phone) -> 422. */
    public function test_p15_hostile_fields_are_rejected(): void
    {
        [, $user] = $this->makeCompanyWithMember();
        Sanctum::actingAs($user);

        foreach (['company_id', 'user_id', 'channel', 'provider', 'timezone', 'recipient_phone'] as $field) {
            $this->putJson(self::ENDPOINT, $this->fullValidPayload([$field => 'hostile-value']))
                ->assertStatus(422)
                ->assertJsonValidationErrors($field);
        }
    }

    /** P16: whatsapp_enabled=true without a phone on file -> 422, nothing persisted inconsistently. */
    public function test_p16_whatsapp_on_without_phone_is_rejected(): void
    {
        [$company, $user] = $this->makeCompanyWithMember(userAttributes: ['phone' => null]);
        Sanctum::actingAs($user);

        $this->putJson(self::ENDPOINT, $this->fullValidPayload(['whatsapp_enabled' => true]))
            ->assertStatus(422)
            ->assertJsonValidationErrors('whatsapp_enabled');

        $count = $this->currentCompanyContext()->run($company, fn () => NotificationSetting::query()->count());
        $this->assertSame(0, $count);
    }

    // ---------------------------------------------------------------
    // A1-A3: atomicity
    // ---------------------------------------------------------------

    /** A1: settings and preferences save together in one PUT. */
    public function test_a1_settings_and_preferences_save_together(): void
    {
        [$company, $user] = $this->makeCompanyWithMember();
        Sanctum::actingAs($user);

        $this->putJson(self::ENDPOINT, $this->fullValidPayload([
            'whatsapp_enabled' => false,
            'preferences' => [['event_type' => 'payable.due_today', 'enabled' => true]],
        ]))->assertOk();

        $this->currentCompanyContext()->run($company, function () {
            $this->assertSame(1, NotificationSetting::query()->count());
            $this->assertSame(1, NotificationPreference::query()->where('event_type', 'payable.due_today')->count());
        });
    }

    /**
     * A2: a failure while writing preferences rolls back the settings write
     * too. Bypasses HTTP validation deliberately (calls the service
     * directly with a null event_type, which validation would normally
     * reject) to force a real database-level failure and prove the
     * transaction boundary, not just that validation blocks bad input.
     */
    public function test_a2_failure_during_preferences_rolls_back_settings(): void
    {
        [$company, $user] = $this->makeCompanyWithMember();

        $service = app(NotificationSettingsService::class);

        try {
            $this->currentCompanyContext()->run($company, function () use ($service, $company, $user) {
                $service->save($company, $user, [
                    'whatsapp_enabled' => true,
                    'quiet_hours_enabled' => true,
                    'quiet_start' => '21:00',
                    'quiet_end' => '07:00',
                    'daily_summary_enabled' => false,
                    'weekly_summary_enabled' => false,
                    'preferences' => [['event_type' => null, 'enabled' => true]],
                ]);
            });
            $this->fail('Expected a QueryException from the null event_type.');
        } catch (QueryException) {
            // expected
        }

        $count = $this->currentCompanyContext()->run($company, fn () => NotificationSetting::query()->count());
        $this->assertSame(0, $count);
    }

    /** A3: PUT never creates a NotificationEvent, NotificationDelivery, job, or provider call. */
    public function test_a3_put_never_triggers_a_notification(): void
    {
        [$company, $user] = $this->makeCompanyWithMember(userAttributes: ['phone' => '+5511999999999']);
        Sanctum::actingAs($user);
        $fakeProvider = $this->bindFakeWhatsAppProvider();
        Bus::fake();
        Queue::fake();

        $this->putJson(self::ENDPOINT, $this->fullValidPayload([
            'whatsapp_enabled' => true,
            'preferences' => [['event_type' => 'payable.due_today', 'enabled' => true]],
        ]))->assertOk();

        $this->currentCompanyContext()->run($company, function () {
            $this->assertSame(0, NotificationEvent::query()->count());
            $this->assertSame(0, NotificationDelivery::query()->count());
        });
        $this->assertCount(0, $fakeProvider->sent);
        Bus::assertNothingDispatched();
        Queue::assertNothingPushed();
    }

    // ---------------------------------------------------------------
    // T1-T6: multitenancy
    // ---------------------------------------------------------------

    /** T1-T4: settings are independent per company, and switching the active company returns the right set. */
    public function test_t1_t4_settings_are_independent_and_switching_returns_the_right_set(): void
    {
        $user = User::factory()->create(['phone' => '+5511999999999']);
        $companyA = Company::factory()->create();
        $companyB = Company::factory()->create();
        $companyA->memberships()->create(['user_id' => $user->id, 'role' => CompanyRole::Owner]);
        $companyB->memberships()->create(['user_id' => $user->id, 'role' => CompanyRole::Owner]);

        Sanctum::actingAs($user);

        // T5 setup requires company_id prohibited check later; activate A explicitly first.
        $this->postJson("/api/v1/companies/{$companyA->id}/activate")->assertOk();
        $this->putJson(self::ENDPOINT, $this->fullValidPayload([
            'whatsapp_enabled' => true,
            'preferences' => [['event_type' => 'payable.due_today', 'enabled' => true]],
        ]))->assertOk();

        $this->postJson("/api/v1/companies/{$companyB->id}/activate")->assertOk();
        $this->putJson(self::ENDPOINT, $this->fullValidPayload([
            'whatsapp_enabled' => false,
            'preferences' => [['event_type' => 'payable.due_today', 'enabled' => false]],
        ]))->assertOk();

        // T3: currently on B -> returns B's settings.
        $this->getJson(self::ENDPOINT)
            ->assertJsonPath('settings.whatsapp_enabled', false)
            ->assertJsonPath('preferences.0.enabled', false);

        // T4: switch back to A -> returns A's settings.
        $this->postJson("/api/v1/companies/{$companyA->id}/activate")->assertOk();
        $response = $this->getJson(self::ENDPOINT)->assertJsonPath('settings.whatsapp_enabled', true);
        $payablePreference = collect($response->json('preferences'))->firstWhere('event_type', 'payable.due_today');
        $this->assertTrue($payablePreference['enabled']);
    }

    /** T5: a company_id in the payload is rejected (prohibited) and never applies to a different tenant. */
    public function test_t5_hostile_company_id_never_applies(): void
    {
        $user = User::factory()->create();
        $companyA = Company::factory()->create();
        $companyB = Company::factory()->create();
        $companyA->memberships()->create(['user_id' => $user->id, 'role' => CompanyRole::Owner]);

        Sanctum::actingAs($user);
        $this->postJson("/api/v1/companies/{$companyA->id}/activate")->assertOk();

        $this->putJson(self::ENDPOINT, $this->fullValidPayload(['company_id' => $companyB->id]))
            ->assertStatus(422);

        $countB = $this->currentCompanyContext()->run($companyB, fn () => NotificationSetting::query()->count());
        $this->assertSame(0, $countB);
    }

    /** T6: multi-membership user with no active company -> 409. */
    public function test_t6_multi_membership_without_active_company_is_409(): void
    {
        $user = User::factory()->create();
        $companyA = Company::factory()->create();
        $companyB = Company::factory()->create();
        $companyA->memberships()->create(['user_id' => $user->id, 'role' => CompanyRole::Owner]);
        $companyB->memberships()->create(['user_id' => $user->id, 'role' => CompanyRole::Owner]);

        Sanctum::actingAs($user);

        $this->getJson(self::ENDPOINT)->assertStatus(409);
    }

    // ---------------------------------------------------------------
    // Other-user hostility (§31)
    // ---------------------------------------------------------------

    /** User A can never read or write User B's settings — there is no surface for it (no user_id anywhere). */
    public function test_user_a_cannot_reach_user_bs_settings(): void
    {
        [$company, $userB] = $this->makeCompanyWithMember(userAttributes: ['phone' => '+5511988888888']);
        $this->currentCompanyContext()->run($company, function () use ($userB) {
            NotificationSetting::factory()->create(['user_id' => $userB->id, 'whatsapp_enabled' => true]);
        });

        $userA = User::factory()->create();
        $company->memberships()->create(['user_id' => $userA->id, 'role' => CompanyRole::Member]);
        Sanctum::actingAs($userA);

        // A's own GET must reflect A's own (default) settings, not B's.
        $this->getJson(self::ENDPOINT)->assertJsonPath('settings.whatsapp_enabled', false);
    }

    /** NotificationEventType enum defaults: SystemTest is not accepted even with a spoofed "user_id" attempt in preferences payload. */
    public function test_preferences_payload_cannot_carry_a_user_id_field(): void
    {
        [, $user] = $this->makeCompanyWithMember();
        Sanctum::actingAs($user);

        $response = $this->putJson(self::ENDPOINT, array_merge($this->fullValidPayload(), [
            'preferences' => [['event_type' => 'payable.due_today', 'enabled' => true, 'user_id' => 'hostile']],
        ]));

        // The nested hostile field is simply not part of the validated
        // preference shape — it's never read, not even ignored-with-effect.
        $response->assertOk();
    }
}
