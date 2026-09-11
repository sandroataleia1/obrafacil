<?php

namespace Tests\Feature\ServiceOrders\Notifications;

use App\Models\Company;
use App\Models\Customer;
use App\Models\CustomerAddress;
use App\Models\NotificationEvent;
use App\Models\ServiceOrder;
use App\Models\User;
use App\Notifications\Support\NotificationDispatcher;
use App\Notifications\Support\NotificationEventType;
use App\Notifications\Support\NotificationMessageRenderer;
use App\Notifications\Support\QuietHoursService;
use App\ServiceOrders\ServiceOrderService;
use App\Support\CurrentCompanyContext;
use Carbon\Carbon;
use Carbon\CarbonInterface;
use Illuminate\Foundation\Testing\RefreshDatabase;
use RuntimeException;
use Tests\Feature\Notifications\Concerns\InteractsWithNotifications;
use Tests\TestCase;

/**
 * BACKEND-06A §21-33/§44-45. NR1-NR14 (reminder scanner) and RC1-RC7
 * (reconciliation) — driven through `php artisan notifications:service-orders`
 * exactly as it will run in production, never by calling the scanner's
 * internal methods directly.
 */
class ServiceOrderNotificationScannerTest extends TestCase
{
    use InteractsWithNotifications, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->bindFakeWhatsAppProvider();
    }

    private function runScanner(): void
    {
        $this->artisan('notifications:service-orders')->assertExitCode(0);
    }

    private function createOrder(Company $company, User $user, array $overrides = []): ServiceOrder
    {
        return $this->currentCompanyContext()->run($company, function () use ($user, $overrides) {
            $customer = Customer::factory()->create();
            $address = CustomerAddress::factory()->create(['customer_id' => $customer->id]);

            return app(ServiceOrderService::class)->create(array_merge([
                'customer_id' => $customer->id,
                'customer_address_id' => $address->id,
                'title' => 'O.S. de lembrete',
            ], $overrides), $user);
        });
    }

    private function eventCount(Company $company, NotificationEventType $type): int
    {
        return $this->currentCompanyContext()->run(
            $company,
            fn () => NotificationEvent::query()->where('type', $type->value)->count()
        );
    }

    private function eventExists(Company $company, string $deduplicationKey): bool
    {
        return $this->currentCompanyContext()->run(
            $company,
            fn () => NotificationEvent::query()->where('deduplication_key', $deduplicationKey)->exists()
        );
    }

    private function deleteEvent(Company $company, string $deduplicationKey): void
    {
        $this->currentCompanyContext()->run(
            $company,
            fn () => NotificationEvent::query()->where('deduplication_key', $deduplicationKey)->delete()
        );
    }

    // -----------------------------------------------------------------
    // NR1-NR14 — reminders
    // -----------------------------------------------------------------

    /** NR1: scheduled tomorrow (company-local) -> due_tomorrow. */
    public function test_nr1_tomorrow_emits_due_tomorrow(): void
    {
        [$company, $user] = $this->makeCompanyWithMember(companyAttributes: ['timezone' => 'America/Sao_Paulo']);
        $start = Carbon::now('America/Sao_Paulo')->addDay()->setTime(9, 0);
        $this->createOrder($company, $user, ['scheduled_start_at' => $start->toIso8601String()]);

        $this->runScanner();

        $this->assertSame(1, $this->eventCount($company, NotificationEventType::ServiceOrderDueTomorrow));
    }

    /** NR2: scheduled later today, still future -> due_today. */
    public function test_nr2_today_future_emits_due_today(): void
    {
        [$company, $user] = $this->makeCompanyWithMember(companyAttributes: ['timezone' => 'America/Sao_Paulo']);
        $start = Carbon::now('America/Sao_Paulo')->addHours(5);
        $this->createOrder($company, $user, ['scheduled_start_at' => $start->toIso8601String()]);

        $this->runScanner();

        $this->assertSame(1, $this->eventCount($company, NotificationEventType::ServiceOrderDueToday));
    }

    /** NR3: <= 2h in the future -> due_2_hours. */
    public function test_nr3_within_2_hours_emits_due_2_hours(): void
    {
        [$company, $user] = $this->makeCompanyWithMember(companyAttributes: ['timezone' => 'America/Sao_Paulo']);
        $start = Carbon::now('America/Sao_Paulo')->addHour();
        $this->createOrder($company, $user, ['scheduled_start_at' => $start->toIso8601String()]);

        $this->runScanner();

        $this->assertSame(1, $this->eventCount($company, NotificationEventType::ServiceOrderDue2Hours));
    }

    /** NR4: past + open -> overdue. */
    public function test_nr4_past_open_emits_overdue(): void
    {
        [$company, $user] = $this->makeCompanyWithMember(companyAttributes: ['timezone' => 'America/Sao_Paulo']);
        $start = Carbon::now('America/Sao_Paulo')->subHours(3);
        $this->createOrder($company, $user, ['scheduled_start_at' => $start->toIso8601String()]);

        $this->runScanner();

        $this->assertSame(1, $this->eventCount($company, NotificationEventType::ServiceOrderOverdue));
    }

    /** NR5: in_progress -> no reminder at all, even if technically overdue. */
    public function test_nr5_in_progress_emits_no_reminder(): void
    {
        [$company, $user] = $this->makeCompanyWithMember(companyAttributes: ['timezone' => 'America/Sao_Paulo']);
        $start = Carbon::now('America/Sao_Paulo')->subHours(3);
        $order = $this->createOrder($company, $user, ['scheduled_start_at' => $start->toIso8601String()]);
        $this->currentCompanyContext()->run($company, fn () => app(ServiceOrderService::class)->start($order));

        $this->runScanner();

        $this->assertSame(0, $this->eventCount($company, NotificationEventType::ServiceOrderOverdue));
        $this->assertSame(0, $this->eventCount($company, NotificationEventType::ServiceOrderDueToday));
    }

    /** NR6: completed -> no reminder. */
    public function test_nr6_completed_emits_no_reminder(): void
    {
        [$company, $user] = $this->makeCompanyWithMember(companyAttributes: ['timezone' => 'America/Sao_Paulo']);
        $start = Carbon::now('America/Sao_Paulo')->subHours(3);
        $order = $this->createOrder($company, $user, ['scheduled_start_at' => $start->toIso8601String()]);
        $this->currentCompanyContext()->run($company, fn () => app(ServiceOrderService::class)->complete($order));

        $this->runScanner();

        $this->assertSame(0, $this->eventCount($company, NotificationEventType::ServiceOrderOverdue));
    }

    /** NR7: cancelled -> no reminder. */
    public function test_nr7_cancelled_emits_no_reminder(): void
    {
        [$company, $user] = $this->makeCompanyWithMember(companyAttributes: ['timezone' => 'America/Sao_Paulo']);
        $start = Carbon::now('America/Sao_Paulo')->subHours(3);
        $order = $this->createOrder($company, $user, ['scheduled_start_at' => $start->toIso8601String()]);
        $this->currentCompanyContext()->run($company, fn () => app(ServiceOrderService::class)->cancel($order, 'x'));

        $this->runScanner();

        $this->assertSame(0, $this->eventCount($company, NotificationEventType::ServiceOrderOverdue));
    }

    /** NR8: running the scanner repeatedly never duplicates. */
    public function test_nr8_repeated_scan_no_duplicate(): void
    {
        [$company, $user] = $this->makeCompanyWithMember(companyAttributes: ['timezone' => 'America/Sao_Paulo']);
        $start = Carbon::now('America/Sao_Paulo')->addDay()->setTime(9, 0);
        $this->createOrder($company, $user, ['scheduled_start_at' => $start->toIso8601String()]);

        $this->runScanner();
        $this->runScanner();
        $this->runScanner();

        $this->assertSame(1, $this->eventCount($company, NotificationEventType::ServiceOrderDueTomorrow));
    }

    /** NR9: changing the schedule produces reminders for the new instant. */
    public function test_nr9_schedule_change_produces_reminders_for_new_instant(): void
    {
        [$company, $user] = $this->makeCompanyWithMember(companyAttributes: ['timezone' => 'America/Sao_Paulo']);
        $firstStart = Carbon::now('America/Sao_Paulo')->addDay()->setTime(9, 0);
        $order = $this->createOrder($company, $user, ['scheduled_start_at' => $firstStart->toIso8601String()]);
        $this->runScanner();
        $this->assertSame(1, $this->eventCount($company, NotificationEventType::ServiceOrderDueTomorrow));

        $secondStart = Carbon::now('America/Sao_Paulo')->addHour();
        $this->currentCompanyContext()->run($company, function () use ($order, $secondStart) {
            app(ServiceOrderService::class)->updateHeader($order, [
                'customer_id' => $order->customer_id,
                'customer_address_id' => $order->customer_address_id,
                'title' => $order->title,
                'scheduled_start_at' => $secondStart->toIso8601String(),
            ]);
        });

        $this->runScanner();

        $this->assertSame(1, $this->eventCount($company, NotificationEventType::ServiceOrderDue2Hours));
    }

    /** NR10: Company A's timezone is used for Company A's reminders. */
    public function test_nr10_company_a_timezone(): void
    {
        [$companyA, $userA] = $this->makeCompanyWithMember(companyAttributes: ['timezone' => 'America/Sao_Paulo']);
        // 02:30 UTC is 23:30 the PREVIOUS day in São Paulo (UTC-3) — i.e.
        // "today" in UTC can be "yesterday" locally; picking a schedule
        // that lands on tomorrow's LOCAL date proves the local date (not
        // the UTC date) is what's actually evaluated.
        $start = Carbon::now('America/Sao_Paulo')->addDay()->setTime(23, 30);
        $this->createOrder($companyA, $userA, ['scheduled_start_at' => $start->toIso8601String()]);

        $this->runScanner();

        $this->assertSame(1, $this->eventCount($companyA, NotificationEventType::ServiceOrderDueTomorrow));
    }

    /** NR11: Company B, a different timezone, computes its own reminders independently. */
    public function test_nr11_company_b_different_timezone(): void
    {
        [$companyB, $userB] = $this->makeCompanyWithMember(companyAttributes: ['timezone' => 'Asia/Tokyo']);
        $start = Carbon::now('Asia/Tokyo')->addDay()->setTime(9, 0);
        $this->createOrder($companyB, $userB, ['scheduled_start_at' => $start->toIso8601String()]);

        $this->runScanner();

        $this->assertSame(1, $this->eventCount($companyB, NotificationEventType::ServiceOrderDueTomorrow));
    }

    /** NR12: Company A never processes Company B's orders under its own context. */
    public function test_nr12_company_a_never_processes_company_b(): void
    {
        [$companyA, $userA] = $this->makeCompanyWithMember(companyAttributes: ['timezone' => 'America/Sao_Paulo']);
        [$companyB, $userB] = $this->makeCompanyWithMember(companyAttributes: ['timezone' => 'America/Sao_Paulo']);
        $start = Carbon::now('America/Sao_Paulo')->addDay()->setTime(9, 0);
        $orderB = $this->createOrder($companyB, $userB, ['scheduled_start_at' => $start->toIso8601String()]);

        $this->runScanner();

        $this->currentCompanyContext()->run($companyA, function () use ($orderB) {
            $this->assertNull(ServiceOrder::find($orderB->id));
            $this->assertSame(0, NotificationEvent::query()->where('entity_id', $orderB->id)->count());
        });
    }

    /** NR13: due_today and due_2_hours can coexist for the same order. */
    public function test_nr13_due_today_and_due_2_hours_coexist(): void
    {
        [$company, $user] = $this->makeCompanyWithMember(companyAttributes: ['timezone' => 'America/Sao_Paulo']);
        $start = Carbon::now('America/Sao_Paulo')->addMinutes(90);
        $order = $this->createOrder($company, $user, ['scheduled_start_at' => $start->toIso8601String()]);

        $this->runScanner();

        $this->assertTrue($this->eventExists($company, "service_order:{$order->id}:due_today:{$order->scheduled_start_at->toIso8601String()}"));
        $this->assertTrue($this->eventExists($company, "service_order:{$order->id}:due_2_hours:{$order->scheduled_start_at->toIso8601String()}"));
    }

    /** NR14: a past schedule never (newly) generates due_today, only overdue. */
    public function test_nr14_past_generates_only_overdue_not_due_today(): void
    {
        [$company, $user] = $this->makeCompanyWithMember(companyAttributes: ['timezone' => 'America/Sao_Paulo']);
        $start = Carbon::now('America/Sao_Paulo')->subHour();
        $order = $this->createOrder($company, $user, ['scheduled_start_at' => $start->toIso8601String()]);

        $this->runScanner();

        $this->assertFalse($this->eventExists($company, "service_order:{$order->id}:due_today:{$order->scheduled_start_at->toIso8601String()}"));
        $this->assertTrue($this->eventExists($company, "service_order:{$order->id}:overdue:{$order->scheduled_start_at->toIso8601String()}"));
    }

    // -----------------------------------------------------------------
    // RC1-RC7 — reconciliation
    // -----------------------------------------------------------------

    /** RC1: a missing created event is recovered. */
    public function test_rc1_missing_created_event_is_recovered(): void
    {
        [$company, $user] = $this->makeCompanyWithMember();
        $order = $this->createOrder($company, $user);
        $this->deleteEvent($company, "service_order:{$order->id}:created");
        $this->assertFalse($this->eventExists($company, "service_order:{$order->id}:created"));

        $this->runScanner();

        $this->assertTrue($this->eventExists($company, "service_order:{$order->id}:created"));
    }

    /** RC2: started_at present + event missing -> recovered. */
    public function test_rc2_missing_started_event_is_recovered(): void
    {
        [$company, $user] = $this->makeCompanyWithMember();
        $order = $this->createOrder($company, $user);
        $this->currentCompanyContext()->run($company, fn () => app(ServiceOrderService::class)->start($order));
        $this->deleteEvent($company, "service_order:{$order->id}:started");

        $this->runScanner();

        $this->assertTrue($this->eventExists($company, "service_order:{$order->id}:started"));
    }

    /** RC3: completed_at present -> recovered. */
    public function test_rc3_missing_completed_event_is_recovered(): void
    {
        [$company, $user] = $this->makeCompanyWithMember();
        $order = $this->createOrder($company, $user);
        $this->currentCompanyContext()->run($company, fn () => app(ServiceOrderService::class)->complete($order));
        $this->deleteEvent($company, "service_order:{$order->id}:completed");

        $this->runScanner();

        $this->assertTrue($this->eventExists($company, "service_order:{$order->id}:completed"));
    }

    /** RC4: cancelled_at present -> recovered, with the persisted reason. */
    public function test_rc4_missing_cancelled_event_is_recovered(): void
    {
        [$company, $user] = $this->makeCompanyWithMember();
        $order = $this->createOrder($company, $user);
        $this->currentCompanyContext()->run($company, fn () => app(ServiceOrderService::class)->cancel($order, 'Motivo persistido'));
        $this->deleteEvent($company, "service_order:{$order->id}:cancelled");

        $this->runScanner();

        $event = $this->currentCompanyContext()->run(
            $company,
            fn () => NotificationEvent::query()->where('deduplication_key', "service_order:{$order->id}:cancelled")->first()
        );
        $this->assertNotNull($event);
        $this->assertSame('Motivo persistido', $event->payload['cancellation_reason']);
    }

    /** RC5: the current schedule's scheduled event is recovered. */
    public function test_rc5_missing_scheduled_event_is_recovered(): void
    {
        [$company, $user] = $this->makeCompanyWithMember();
        $start = Carbon::now()->addDays(3);
        $order = $this->createOrder($company, $user, ['scheduled_start_at' => $start->toIso8601String()]);
        $this->deleteEvent($company, "service_order:{$order->id}:scheduled:{$order->scheduled_start_at->toIso8601String()}");

        $this->runScanner();

        $this->assertTrue($this->eventExists($company, "service_order:{$order->id}:scheduled:{$order->scheduled_start_at->toIso8601String()}"));
    }

    /** RC6: an event that already exists is left alone — no duplicate. */
    public function test_rc6_existing_event_is_a_no_op(): void
    {
        [$company, $user] = $this->makeCompanyWithMember();
        $order = $this->createOrder($company, $user);
        $this->assertSame(1, $this->eventCount($company, NotificationEventType::ServiceOrderCreated));

        $this->runScanner();

        $this->assertSame(1, $this->eventCount($company, NotificationEventType::ServiceOrderCreated));
    }

    /**
     * RC7: an immediate afterCommit callback failure never undoes the
     * business commit, and the scanner recovers the missing event later.
     * Simulated by temporarily swapping in a NotificationDispatcher that
     * always throws (standing in for a transient failure inside the real
     * one), exactly the situation ServiceOrderNotificationBridge's
     * try/catch + Log::error is built to survive.
     */
    public function test_rc7_immediate_failure_does_not_undo_business_and_scanner_recovers(): void
    {
        [$company, $user] = $this->makeCompanyWithMember();

        $this->app->bind(NotificationDispatcher::class, fn () => new class(app(CurrentCompanyContext::class), app(NotificationMessageRenderer::class), app(QuietHoursService::class)) extends NotificationDispatcher
        {
            public function dispatch(
                Company $company,
                NotificationEventType $type,
                ?string $entityType,
                ?string $entityId,
                array $payload,
                string $deduplicationKey,
                ?CarbonInterface $occurredAt = null,
            ): ?NotificationEvent {
                throw new RuntimeException('simulated notification dispatch failure');
            }
        });

        $order = $this->createOrder($company, $user);

        // The business commit survived even though notification dispatch
        // threw inside the afterCommit callback.
        $this->currentCompanyContext()->run($company, function () use ($order) {
            $this->assertNotNull(ServiceOrder::find($order->id));
        });
        $this->assertFalse($this->eventExists($company, "service_order:{$order->id}:created"));

        // Restore the real dispatcher and let the scanner recover it.
        $this->app->bind(NotificationDispatcher::class, NotificationDispatcher::class);
        $this->runScanner();

        $this->assertTrue($this->eventExists($company, "service_order:{$order->id}:created"));
    }
}
