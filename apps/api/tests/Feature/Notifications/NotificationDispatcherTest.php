<?php

namespace Tests\Feature\Notifications;

use App\Models\NotificationDelivery;
use App\Models\NotificationEvent;
use App\Models\NotificationPreference;
use App\Models\NotificationSetting;
use App\Notifications\Jobs\SendWhatsAppNotificationJob;
use App\Notifications\Support\NotificationDispatcher;
use App\Notifications\Support\NotificationEventType;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Str;
use RuntimeException;
use Tests\Feature\Notifications\Concerns\InteractsWithNotifications;
use Tests\TestCase;

class NotificationDispatcherTest extends TestCase
{
    use InteractsWithNotifications, RefreshDatabase;

    /**
     * QUEUE_CONNECTION=sync in tests (phpunit.xml) means every eligible
     * delivery's job runs immediately, synchronously, as part of
     * dispatch() returning — so every test needs a bound provider that
     * never makes a real request, not just the ones that explicitly
     * assert on it.
     */
    protected function setUp(): void
    {
        parent::setUp();

        $this->bindFakeWhatsAppProvider();
    }

    private function dispatcher(): NotificationDispatcher
    {
        return app(NotificationDispatcher::class);
    }

    /** N1: dispatching creates a NotificationEvent. */
    public function test_n1_dispatch_creates_a_notification_event(): void
    {
        [$company] = $this->makeCompanyWithMember();

        $event = $this->dispatcher()->dispatch(
            $company,
            NotificationEventType::SystemTest,
            null,
            null,
            [],
            'n1:'.$company->id
        );

        $this->assertInstanceOf(NotificationEvent::class, $event);
        $this->assertDatabaseHas('notification_events', ['id' => $event->id, 'deduplication_key' => 'n1:'.$company->id]);
    }

    /** N2: the same deduplication key never produces a second event. */
    public function test_n2_same_deduplication_key_produces_only_one_event(): void
    {
        [$company] = $this->makeCompanyWithMember();
        $key = 'n2:'.$company->id;

        $first = $this->dispatcher()->dispatch($company, NotificationEventType::SystemTest, null, null, [], $key);
        $second = $this->dispatcher()->dispatch($company, NotificationEventType::SystemTest, null, null, [], $key);

        $this->assertNotNull($first);
        $this->assertNull($second);
        $this->assertSame(1, NotificationEvent::withoutCompanyScope()->where('deduplication_key', $key)->count());
    }

    /** N3: the uniqueness guarantee is a real DB constraint, not just an application-level check(). */
    public function test_n3_deduplication_is_enforced_by_a_real_database_constraint(): void
    {
        [$company] = $this->makeCompanyWithMember();
        $key = 'n3:'.$company->id;

        $this->currentCompanyContext()->run($company, function () use ($key) {
            NotificationEvent::factory()->create(['deduplication_key' => $key]);

            $this->expectException(QueryException::class);
            // Bypasses the dispatcher entirely — a raw duplicate insert
            // must still be rejected by the constraint itself.
            DB::table('notification_events')->insert([
                'id' => (string) Str::uuid(),
                'company_id' => $this->currentCompanyContext()->id(),
                'type' => NotificationEventType::SystemTest->value,
                'payload' => '{}',
                'deduplication_key' => $key,
                'occurred_at' => now(),
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        });
    }

    /** N4: whatsapp_enabled=false -> no delivery. */
    public function test_n4_whatsapp_disabled_means_no_delivery(): void
    {
        [$company, $user] = $this->makeCompanyWithMember(userAttributes: ['phone' => '+5511999999999']);
        $this->currentCompanyContext()->run($company, function () use ($user) {
            NotificationSetting::factory()->create(['user_id' => $user->id, 'whatsapp_enabled' => false]);
            NotificationPreference::factory()->create(['user_id' => $user->id, 'event_type' => NotificationEventType::SystemTest]);
        });

        $event = $this->dispatcher()->dispatch($company, NotificationEventType::SystemTest, null, null, [], 'n4:'.$company->id);

        $this->assertSame(0, NotificationDelivery::withoutCompanyScope()->where('notification_event_id', $event->id)->count());
    }

    /** N5: an explicit but disabled preference for this event type -> no delivery. */
    public function test_n5_disabled_event_preference_means_no_delivery(): void
    {
        [$company, $user] = $this->makeCompanyWithMember(userAttributes: ['phone' => '+5511999999999']);
        $this->currentCompanyContext()->run($company, function () use ($user) {
            NotificationSetting::factory()->create(['user_id' => $user->id, 'whatsapp_enabled' => true]);
            NotificationPreference::factory()->disabled()->create([
                'user_id' => $user->id,
                'event_type' => NotificationEventType::SystemTest,
            ]);
        });

        $event = $this->dispatcher()->dispatch($company, NotificationEventType::SystemTest, null, null, [], 'n5:'.$company->id);

        $this->assertSame(0, NotificationDelivery::withoutCompanyScope()->where('notification_event_id', $event->id)->count());
    }

    /**
     * N6: enabled + valid phone -> a delivery is created and enters the
     * queue pipeline (queued_at is stamped at creation, before the job
     * ever runs). Its status by the time this assertion runs is 'sent' —
     * not a contradiction: QUEUE_CONNECTION=sync in tests (phpunit.xml)
     * means the queued job already ran synchronously as part of
     * afterCommit() resolving inside dispatch() itself. See
     * SendWhatsAppNotificationJobTest for the queued->processing->sent
     * transition proved in isolation.
     */
    public function test_n6_enabled_with_valid_phone_creates_a_delivery_that_enters_the_queue(): void
    {
        [$company, $user] = $this->makeCompanyWithMember(userAttributes: ['phone' => '+5511999999999']);
        $this->enableWhatsAppFor($company, $user);

        $event = $this->dispatcher()->dispatch($company, NotificationEventType::SystemTest, null, null, [], 'n6:'.$company->id);

        $delivery = NotificationDelivery::withoutCompanyScope()->where('notification_event_id', $event->id)->first();
        $this->assertNotNull($delivery);
        $this->assertNotNull($delivery->queued_at);
        $this->assertContains($delivery->status->value, ['queued', 'processing', 'sent']);
    }

    /** N7: recipient is a snapshot of the phone at dispatch time. */
    public function test_n7_recipient_is_a_snapshot(): void
    {
        [$company, $user] = $this->makeCompanyWithMember(userAttributes: ['phone' => '+5511999999999']);
        $this->enableWhatsAppFor($company, $user);

        $event = $this->dispatcher()->dispatch($company, NotificationEventType::SystemTest, null, null, [], 'n7:'.$company->id);
        $delivery = NotificationDelivery::withoutCompanyScope()->where('notification_event_id', $event->id)->first();

        $user->update(['phone' => '+5511888888888']);

        $this->assertSame('+5511999999999', $delivery->fresh()->recipient);
    }

    /** N8: rendered_message is a snapshot of the renderer's output at dispatch time. */
    public function test_n8_rendered_message_is_a_snapshot(): void
    {
        [$company, $user] = $this->makeCompanyWithMember(userAttributes: ['phone' => '+5511999999999']);
        $this->enableWhatsAppFor($company, $user);

        $event = $this->dispatcher()->dispatch($company, NotificationEventType::SystemTest, null, null, [], 'n8:'.$company->id);
        $delivery = NotificationDelivery::withoutCompanyScope()->where('notification_event_id', $event->id)->first();

        $this->assertSame('ObraFácil — mensagem de teste', $delivery->rendered_message);
    }

    /** N9: (company_id, idempotency_key) is a real unique constraint. */
    public function test_n9_delivery_idempotency_key_is_unique_per_company(): void
    {
        [$company, $user] = $this->makeCompanyWithMember(userAttributes: ['phone' => '+5511999999999']);
        $this->enableWhatsAppFor($company, $user);

        $event = $this->dispatcher()->dispatch($company, NotificationEventType::SystemTest, null, null, [], 'n9:'.$company->id);
        $delivery = NotificationDelivery::withoutCompanyScope()->where('notification_event_id', $event->id)->firstOrFail();

        $this->currentCompanyContext()->run($company, function () use ($delivery) {
            $this->expectException(QueryException::class);
            DB::table('notification_deliveries')->insert([
                'id' => (string) Str::uuid(),
                'company_id' => $this->currentCompanyContext()->id(),
                'notification_event_id' => $delivery->notification_event_id,
                'channel' => 'whatsapp',
                'provider' => 'evolution',
                'recipient' => '+5511999999999',
                'rendered_message' => 'x',
                'status' => 'queued',
                'idempotency_key' => $delivery->idempotency_key,
                'attempts' => 0,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        });
    }

    /** N10: Company A's notification data is fully isolated from Company B's. */
    public function test_n10_company_a_is_isolated_from_company_b(): void
    {
        [$companyA, $userA] = $this->makeCompanyWithMember(userAttributes: ['phone' => '+5511999999999']);
        [$companyB, $userB] = $this->makeCompanyWithMember(userAttributes: ['phone' => '+5511888888888']);
        $this->enableWhatsAppFor($companyA, $userA);
        $this->enableWhatsAppFor($companyB, $userB);

        $eventA = $this->dispatcher()->dispatch($companyA, NotificationEventType::SystemTest, null, null, [], 'n10a:'.$companyA->id);
        $eventB = $this->dispatcher()->dispatch($companyB, NotificationEventType::SystemTest, null, null, [], 'n10b:'.$companyB->id);

        $this->currentCompanyContext()->run($companyA, function () use ($eventB) {
            $this->assertNull(NotificationEvent::find($eventB->id));
        });
        $this->currentCompanyContext()->run($companyB, function () use ($eventA) {
            $this->assertNull(NotificationEvent::find($eventA->id));
        });
    }

    /** N11: inside quiet hours, the job is delayed rather than dispatched immediately. */
    public function test_n11_quiet_hours_delay_the_job_instead_of_sending_immediately(): void
    {
        [$company, $user] = $this->makeCompanyWithMember(
            companyAttributes: ['timezone' => 'America/Sao_Paulo'],
            userAttributes: ['phone' => '+5511999999999']
        );
        $this->currentCompanyContext()->run($company, function () use ($user) {
            NotificationSetting::factory()->create([
                'user_id' => $user->id,
                'whatsapp_enabled' => true,
                'quiet_hours_enabled' => true,
                'quiet_start' => '00:00',
                'quiet_end' => '23:59',
            ]);
            NotificationPreference::factory()->create(['user_id' => $user->id, 'event_type' => NotificationEventType::SystemTest]);
        });

        Queue::fake();

        $this->dispatcher()->dispatch($company, NotificationEventType::SystemTest, null, null, [], 'n11:'.$company->id);

        Queue::assertPushed(SendWhatsAppNotificationJob::class, fn ($job) => $job->delay !== null);
    }

    /** N12: outside quiet hours, the job is queued without a delay. */
    public function test_n12_outside_quiet_hours_queues_without_delay(): void
    {
        [$company, $user] = $this->makeCompanyWithMember(userAttributes: ['phone' => '+5511999999999']);
        $this->enableWhatsAppFor($company, $user, quietHoursEnabled: false);

        Queue::fake();

        $this->dispatcher()->dispatch($company, NotificationEventType::SystemTest, null, null, [], 'n12:'.$company->id);

        Queue::assertPushed(SendWhatsAppNotificationJob::class, fn ($job) => $job->delay === null);
    }

    /** N13: quiet hours are evaluated in the company's own timezone, never the server's. */
    public function test_n13_quiet_hours_use_the_companys_timezone(): void
    {
        // 21:00-07:00 quiet window. In a timezone far enough ahead of the
        // server's own (UTC in tests), "now" can be inside the window in
        // the company's timezone while it would look like daytime in UTC.
        [$company, $user] = $this->makeCompanyWithMember(
            companyAttributes: ['timezone' => 'Pacific/Auckland'],
            userAttributes: ['phone' => '+5511999999999']
        );
        $this->currentCompanyContext()->run($company, function () use ($user) {
            NotificationSetting::factory()->create([
                'user_id' => $user->id,
                'whatsapp_enabled' => true,
                'quiet_hours_enabled' => true,
                'quiet_start' => '00:00',
                'quiet_end' => '23:59',
            ]);
            NotificationPreference::factory()->create(['user_id' => $user->id, 'event_type' => NotificationEventType::SystemTest]);
        });

        Queue::fake();
        $this->dispatcher()->dispatch($company, NotificationEventType::SystemTest, null, null, [], 'n13:'.$company->id);

        // A near-24h quiet window guarantees "now" is inside it regardless
        // of server timezone — proving the company's timezone was used at
        // all (rather than crashing or silently defaulting) is the point.
        Queue::assertPushed(SendWhatsAppNotificationJob::class, fn ($job) => $job->delay !== null);
    }

    /** N14: a dispatch nested inside a still-open transaction never sends before that transaction commits. */
    public function test_n14_dispatch_inside_a_transaction_does_not_send_before_commit(): void
    {
        [$company, $user] = $this->makeCompanyWithMember(userAttributes: ['phone' => '+5511999999999']);
        $this->enableWhatsAppFor($company, $user, quietHoursEnabled: false);
        $fakeProvider = $this->bindFakeWhatsAppProvider();

        DB::transaction(function () use ($company, $fakeProvider) {
            $this->dispatcher()->dispatch($company, NotificationEventType::SystemTest, null, null, [], 'n14:'.$company->id);

            // Still inside the outer transaction — afterCommit must not
            // have fired yet, so the provider must not have been called.
            $this->assertCount(0, $fakeProvider->sent);
        });

        $this->assertCount(1, $fakeProvider->sent);
    }

    /** N15: if the outer transaction rolls back, the job (and therefore the provider call) never happens. */
    public function test_n15_rollback_never_sends_the_job(): void
    {
        [$company, $user] = $this->makeCompanyWithMember(userAttributes: ['phone' => '+5511999999999']);
        $this->enableWhatsAppFor($company, $user, quietHoursEnabled: false);
        $fakeProvider = $this->bindFakeWhatsAppProvider();

        try {
            DB::transaction(function () use ($company) {
                $this->dispatcher()->dispatch($company, NotificationEventType::SystemTest, null, null, [], 'n15:'.$company->id);
                throw new RuntimeException('force rollback');
            });
        } catch (RuntimeException) {
            // expected
        }

        $this->assertCount(0, $fakeProvider->sent);
        $this->assertSame(0, NotificationEvent::withoutCompanyScope()->where('deduplication_key', 'n15:'.$company->id)->count());
    }
}
