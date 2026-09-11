<?php

namespace Tests\Feature\ServiceOrders\Notifications;

use App\Models\CatalogItem;
use App\Models\Company;
use App\Models\Customer;
use App\Models\CustomerAddress;
use App\Models\NotificationEvent;
use App\Models\ServiceOrder;
use App\Models\ServiceOrderItem;
use App\Models\User;
use App\Notifications\Support\NotificationEventType;
use App\ServiceOrders\Exceptions\ServiceOrderStatusConflictException;
use App\ServiceOrders\ServiceOrderItemService;
use App\ServiceOrders\ServiceOrderService;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Tests\Feature\Notifications\Concerns\InteractsWithNotifications;
use Tests\TestCase;

/**
 * BACKEND-06A §41-43. NC1-NC8 (created), NS1-NS8 (scheduled), NST1-NST10
 * (status transitions) — ServiceOrderService's afterCommit notification
 * hooks, driven through the real Service (never a raw dispatcher call),
 * proving the wiring itself, not just NotificationDispatcher in isolation
 * (already covered by NotificationDispatcherTest).
 */
class ServiceOrderNotificationBridgeTest extends TestCase
{
    use InteractsWithNotifications, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        // QUEUE_CONNECTION=sync (phpunit.xml) — every eligible delivery's
        // job runs synchronously as part of afterCommit resolving, so
        // every test needs a bound provider that never makes a real call.
        $this->bindFakeWhatsAppProvider();
    }

    private function createOpenOrder(Company $company, User $user, array $overrides = []): ServiceOrder
    {
        return $this->currentCompanyContext()->run($company, function () use ($user, $overrides) {
            $customer = Customer::factory()->create();
            $address = CustomerAddress::factory()->create(['customer_id' => $customer->id]);

            return app(ServiceOrderService::class)->create(array_merge([
                'customer_id' => $customer->id,
                'customer_address_id' => $address->id,
                'title' => 'Manutenção elétrica',
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

    private function eventFor(Company $company, string $dedupKey): ?NotificationEvent
    {
        return $this->currentCompanyContext()->run(
            $company,
            fn () => NotificationEvent::query()->where('deduplication_key', $dedupKey)->first()
        );
    }

    // -----------------------------------------------------------------
    // NC1-NC8 — created
    // -----------------------------------------------------------------

    /** NC1: create commitado -> created event. */
    public function test_nc1_create_commits_to_a_created_event(): void
    {
        [$company, $user] = $this->makeCompanyWithMember();
        $order = $this->createOpenOrder($company, $user);

        $this->assertSame(1, $this->eventCount($company, NotificationEventType::ServiceOrderCreated));
        $this->assertNotNull($this->eventFor($company, "service_order:{$order->id}:created"));
    }

    /** NC2: the dedup key is exactly service_order:{id}:created. */
    public function test_nc2_dedup_key_is_correct(): void
    {
        [$company, $user] = $this->makeCompanyWithMember();
        $order = $this->createOpenOrder($company, $user);

        $event = $this->eventFor($company, "service_order:{$order->id}:created");
        $this->assertNotNull($event);
    }

    /** NC3: the event's entity points at the ServiceOrder. */
    public function test_nc3_entity_points_at_service_order(): void
    {
        [$company, $user] = $this->makeCompanyWithMember();
        $order = $this->createOpenOrder($company, $user);

        $event = $this->eventFor($company, "service_order:{$order->id}:created");
        $this->assertSame('service_order', $event->entity_type);
        $this->assertSame($order->id, $event->entity_id);
    }

    /** NC4: the payload snapshot is correct and excludes personal data (§14). */
    public function test_nc4_payload_snapshot_is_correct(): void
    {
        [$company, $user] = $this->makeCompanyWithMember(companyAttributes: ['timezone' => 'America/Sao_Paulo']);
        $order = $this->createOpenOrder($company, $user, ['title' => 'Troca de disjuntor']);

        $event = $this->eventFor($company, "service_order:{$order->id}:created");

        $this->assertSame($order->id, $event->payload['service_order_id']);
        $this->assertSame('OS-000001', $event->payload['number']);
        $this->assertSame('Troca de disjuntor', $event->payload['title']);
        $this->assertSame('open', $event->payload['status']);
        $this->assertSame($order->customer_name, $event->payload['customer_name']);
        $this->assertSame('America/Sao_Paulo', $event->payload['company_timezone']);
        $this->assertSame('0.00', $event->payload['subtotal']);
        $this->assertSame('0.00', $event->payload['total']);

        $this->assertArrayNotHasKey('customer_document', $event->payload);
        $this->assertArrayNotHasKey('customer_phone', $event->payload);
        $this->assertArrayNotHasKey('contact_phone', $event->payload);
        $this->assertArrayNotHasKey('contact_whatsapp', $event->payload);
    }

    /** NC5: no opt-in -> zero delivery (event still exists). */
    public function test_nc5_no_opt_in_means_zero_delivery(): void
    {
        [$company, $user] = $this->makeCompanyWithMember();
        $order = $this->createOpenOrder($company, $user);

        $event = $this->eventFor($company, "service_order:{$order->id}:created");
        $deliveries = $this->currentCompanyContext()->run($company, fn () => $event->deliveries()->count());

        $this->assertSame(0, $deliveries);
    }

    /** NC6: opt-in + preference -> a delivery is created and sent via the fake provider. */
    public function test_nc6_opt_in_and_preference_creates_delivery(): void
    {
        [$company, $user] = $this->makeCompanyWithMember(userAttributes: ['phone' => '+5511999999999']);
        $this->enableWhatsAppFor($company, $user, NotificationEventType::ServiceOrderCreated);

        $order = $this->createOpenOrder($company, $user);

        $event = $this->eventFor($company, "service_order:{$order->id}:created");
        $deliveries = $this->currentCompanyContext()->run($company, fn () => $event->deliveries()->count());

        $this->assertSame(1, $deliveries);
    }

    /** NC7: a rolled-back create produces zero event and zero delivery. */
    public function test_nc7_rollback_produces_zero_event(): void
    {
        [$company, $user] = $this->makeCompanyWithMember(userAttributes: ['phone' => '+5511999999999']);
        $this->enableWhatsAppFor($company, $user, NotificationEventType::ServiceOrderCreated);
        $fakeProvider = $this->bindFakeWhatsAppProvider();

        $this->currentCompanyContext()->run($company, function () use ($user) {
            $customer = Customer::factory()->create();
            $address = CustomerAddress::factory()->create(['customer_id' => $customer->id]);
            $inactiveCatalogItem = CatalogItem::factory()->create(['active' => false]);

            try {
                app(ServiceOrderService::class)->create([
                    'customer_id' => $customer->id,
                    'customer_address_id' => $address->id,
                    'title' => 'Deve falhar e reverter tudo',
                    'items' => [['catalog_item_id' => $inactiveCatalogItem->id, 'quantity' => '1.000']],
                ], $user);
                $this->fail('Expected a ValidationException from the inactive catalog item.');
            } catch (ValidationException) {
                // expected — the whole create() transaction rolls back.
            }
        });

        $this->assertSame(0, $this->eventCount($company, NotificationEventType::ServiceOrderCreated));
        $this->assertCount(0, $fakeProvider->sent);
    }

    /** NC8: no real provider is ever invoked — only the bound fake. */
    public function test_nc8_no_real_provider_is_called(): void
    {
        [$company, $user] = $this->makeCompanyWithMember(userAttributes: ['phone' => '+5511999999999']);
        $this->enableWhatsAppFor($company, $user, NotificationEventType::ServiceOrderCreated);
        $fakeProvider = $this->bindFakeWhatsAppProvider();

        $this->createOpenOrder($company, $user);

        $this->assertCount(1, $fakeProvider->sent);
    }

    // -----------------------------------------------------------------
    // NS1-NS8 — scheduled
    // -----------------------------------------------------------------

    /** NS1: create with a schedule -> a scheduled event. */
    public function test_ns1_create_with_schedule_emits_scheduled_event(): void
    {
        [$company, $user] = $this->makeCompanyWithMember();
        $start = Carbon::now()->addDays(3);
        $order = $this->createOpenOrder($company, $user, ['scheduled_start_at' => $start->toIso8601String()]);

        $this->assertSame(1, $this->eventCount($company, NotificationEventType::ServiceOrderScheduled));
        $this->assertNotNull($this->eventFor($company, "service_order:{$order->id}:scheduled:{$order->scheduled_start_at->toIso8601String()}"));
    }

    /** NS2: create without a schedule -> no scheduled event. */
    public function test_ns2_create_without_schedule_emits_nothing(): void
    {
        [$company, $user] = $this->makeCompanyWithMember();
        $this->createOpenOrder($company, $user);

        $this->assertSame(0, $this->eventCount($company, NotificationEventType::ServiceOrderScheduled));
    }

    /** NS3: PUT that changes scheduled_start_at -> a new scheduled event. */
    public function test_ns3_put_changing_schedule_emits_new_scheduled_event(): void
    {
        [$company, $user] = $this->makeCompanyWithMember();
        $original = Carbon::now()->addDays(2);
        $order = $this->createOpenOrder($company, $user, ['scheduled_start_at' => $original->toIso8601String()]);

        $newStart = Carbon::now()->addDays(5);
        $this->currentCompanyContext()->run($company, function () use ($order, $newStart) {
            app(ServiceOrderService::class)->updateHeader($order, [
                'customer_id' => $order->customer_id,
                'customer_address_id' => $order->customer_address_id,
                'title' => $order->title,
                'scheduled_start_at' => $newStart->toIso8601String(),
            ]);
        });

        $this->assertSame(2, $this->eventCount($company, NotificationEventType::ServiceOrderScheduled));
    }

    /** NS4: PUT that resubmits the exact same scheduled_start_at -> zero new event. */
    public function test_ns4_put_keeping_same_schedule_emits_nothing_new(): void
    {
        [$company, $user] = $this->makeCompanyWithMember();
        $start = Carbon::now()->addDays(2);
        $order = $this->createOpenOrder($company, $user, ['scheduled_start_at' => $start->toIso8601String()]);

        $this->currentCompanyContext()->run($company, function () use ($order) {
            app(ServiceOrderService::class)->updateHeader($order, [
                'customer_id' => $order->customer_id,
                'customer_address_id' => $order->customer_address_id,
                'title' => 'Título mudou mas o horário não',
                'scheduled_start_at' => $order->scheduled_start_at->toIso8601String(),
            ]);
        });

        $this->assertSame(1, $this->eventCount($company, NotificationEventType::ServiceOrderScheduled));
    }

    /** NS5: PUT that removes the schedule -> no "unscheduled" event is invented. */
    public function test_ns5_put_removing_schedule_invents_nothing(): void
    {
        [$company, $user] = $this->makeCompanyWithMember();
        $start = Carbon::now()->addDays(2);
        $order = $this->createOpenOrder($company, $user, ['scheduled_start_at' => $start->toIso8601String()]);

        $this->currentCompanyContext()->run($company, function () use ($order) {
            app(ServiceOrderService::class)->updateHeader($order, [
                'customer_id' => $order->customer_id,
                'customer_address_id' => $order->customer_address_id,
                'title' => $order->title,
                'scheduled_start_at' => null,
            ]);
        });

        // Still just the one from creation — none added by the removal.
        $this->assertSame(1, $this->eventCount($company, NotificationEventType::ServiceOrderScheduled));
    }

    /** NS6: the payload's company_timezone matches the Company's actual timezone. */
    public function test_ns6_payload_timezone_is_correct(): void
    {
        [$company, $user] = $this->makeCompanyWithMember(companyAttributes: ['timezone' => 'America/Manaus']);
        $start = Carbon::now()->addDay();
        $order = $this->createOpenOrder($company, $user, ['scheduled_start_at' => $start->toIso8601String()]);

        $event = $this->eventFor($company, "service_order:{$order->id}:scheduled:{$order->scheduled_start_at->toIso8601String()}");
        $this->assertSame('America/Manaus', $event->payload['company_timezone']);
    }

    /** NS7: dedup is per-occurrence — moving back to a previously-notified instant does not duplicate. */
    public function test_ns7_dedup_per_occurrence(): void
    {
        [$company, $user] = $this->makeCompanyWithMember();
        $x = Carbon::now()->addDays(2);
        $y = Carbon::now()->addDays(5);
        $order = $this->createOpenOrder($company, $user, ['scheduled_start_at' => $x->toIso8601String()]);

        $this->currentCompanyContext()->run($company, function () use ($order, $x, $y) {
            app(ServiceOrderService::class)->updateHeader($order->fresh(), [
                'customer_id' => $order->customer_id,
                'customer_address_id' => $order->customer_address_id,
                'title' => $order->title,
                'scheduled_start_at' => $y->toIso8601String(),
            ]);
            app(ServiceOrderService::class)->updateHeader($order->fresh(), [
                'customer_id' => $order->customer_id,
                'customer_address_id' => $order->customer_address_id,
                'title' => $order->title,
                'scheduled_start_at' => $x->toIso8601String(),
            ]);
        });

        // X (create), Y (first change), back to X (already notified once
        // at that exact instant) — dedup suppresses the repeat, by policy.
        $this->assertSame(2, $this->eventCount($company, NotificationEventType::ServiceOrderScheduled));
    }

    /** NS8: a rolled-back update produces zero event for the attempted change. */
    public function test_ns8_rollback_update_emits_nothing(): void
    {
        [$company, $user] = $this->makeCompanyWithMember();
        $order = $this->createOpenOrder($company, $user);
        $newStart = Carbon::now()->addDays(5);

        $this->currentCompanyContext()->run($company, function () use ($order, $newStart) {
            try {
                app(ServiceOrderService::class)->updateHeader($order, [
                    'customer_id' => $order->customer_id,
                    'customer_address_id' => (string) Str::uuid(), // nonexistent -> fails
                    'title' => $order->title,
                    'scheduled_start_at' => $newStart->toIso8601String(),
                ]);
                $this->fail('Expected a ModelNotFoundException for the bogus address.');
            } catch (ModelNotFoundException) {
                // expected
            }
        });

        $this->assertSame(0, $this->eventCount($company, NotificationEventType::ServiceOrderScheduled));
    }

    // -----------------------------------------------------------------
    // NST1-NST10 — status transitions
    // -----------------------------------------------------------------

    /** NST1: start -> started event. */
    public function test_nst1_start_emits_started_event(): void
    {
        [$company, $user] = $this->makeCompanyWithMember();
        $order = $this->createOpenOrder($company, $user);

        $this->currentCompanyContext()->run($company, fn () => app(ServiceOrderService::class)->start($order));

        $this->assertSame(1, $this->eventCount($company, NotificationEventType::ServiceOrderStarted));
    }

    /** NST2: a 409 repeat start never duplicates the event. */
    public function test_nst2_repeat_start_409_no_duplicate(): void
    {
        [$company, $user] = $this->makeCompanyWithMember();
        $order = $this->createOpenOrder($company, $user);

        $this->currentCompanyContext()->run($company, function () use ($order) {
            app(ServiceOrderService::class)->start($order);
            try {
                app(ServiceOrderService::class)->start($order);
                $this->fail('Expected ServiceOrderStatusConflictException.');
            } catch (ServiceOrderStatusConflictException) {
                // expected
            }
        });

        $this->assertSame(1, $this->eventCount($company, NotificationEventType::ServiceOrderStarted));
    }

    /** NST3: open -> completed emits completed. */
    public function test_nst3_open_to_completed_emits_completed(): void
    {
        [$company, $user] = $this->makeCompanyWithMember();
        $order = $this->createOpenOrder($company, $user);

        $this->currentCompanyContext()->run($company, fn () => app(ServiceOrderService::class)->complete($order));

        $this->assertSame(1, $this->eventCount($company, NotificationEventType::ServiceOrderCompleted));
    }

    /** NST4: in_progress -> completed emits completed. */
    public function test_nst4_in_progress_to_completed_emits_completed(): void
    {
        [$company, $user] = $this->makeCompanyWithMember();
        $order = $this->createOpenOrder($company, $user);

        $this->currentCompanyContext()->run($company, function () use ($order) {
            app(ServiceOrderService::class)->start($order);
            app(ServiceOrderService::class)->complete($order);
        });

        $this->assertSame(1, $this->eventCount($company, NotificationEventType::ServiceOrderCompleted));
    }

    /** NST5: a repeated complete never duplicates the event. */
    public function test_nst5_repeat_complete_no_duplicate(): void
    {
        [$company, $user] = $this->makeCompanyWithMember();
        $order = $this->createOpenOrder($company, $user);

        $this->currentCompanyContext()->run($company, function () use ($order) {
            app(ServiceOrderService::class)->complete($order);
            try {
                app(ServiceOrderService::class)->complete($order);
                $this->fail('Expected ServiceOrderStatusConflictException.');
            } catch (ServiceOrderStatusConflictException) {
                // expected
            }
        });

        $this->assertSame(1, $this->eventCount($company, NotificationEventType::ServiceOrderCompleted));
    }

    /** NST6: cancel -> cancelled event. */
    public function test_nst6_cancel_emits_cancelled_event(): void
    {
        [$company, $user] = $this->makeCompanyWithMember();
        $order = $this->createOpenOrder($company, $user);

        $this->currentCompanyContext()->run($company, fn () => app(ServiceOrderService::class)->cancel($order, 'Cliente desistiu'));

        $this->assertSame(1, $this->eventCount($company, NotificationEventType::ServiceOrderCancelled));
    }

    /** NST7: cancellation_reason travels in the payload and the rendered message. */
    public function test_nst7_reason_in_payload_and_message(): void
    {
        [$company, $user] = $this->makeCompanyWithMember(userAttributes: ['phone' => '+5511999999999']);
        $this->enableWhatsAppFor($company, $user, NotificationEventType::ServiceOrderCancelled);
        $order = $this->createOpenOrder($company, $user);

        $this->currentCompanyContext()->run($company, fn () => app(ServiceOrderService::class)->cancel($order, 'Cliente cancelou o atendimento'));

        $event = $this->eventFor($company, "service_order:{$order->id}:cancelled");
        $this->assertSame('Cliente cancelou o atendimento', $event->payload['cancellation_reason']);

        $delivery = $this->currentCompanyContext()->run($company, fn () => $event->deliveries()->first());
        $this->assertStringContainsString('Cliente cancelou o atendimento', $delivery->rendered_message);
    }

    /** NST8: a repeated cancel never duplicates the event. */
    public function test_nst8_repeat_cancel_no_duplicate(): void
    {
        [$company, $user] = $this->makeCompanyWithMember();
        $order = $this->createOpenOrder($company, $user);

        $this->currentCompanyContext()->run($company, function () use ($order) {
            app(ServiceOrderService::class)->cancel($order, 'Motivo 1');
            try {
                app(ServiceOrderService::class)->cancel($order, 'Motivo 2');
                $this->fail('Expected ServiceOrderStatusConflictException.');
            } catch (ServiceOrderStatusConflictException) {
                // expected
            }
        });

        $this->assertSame(1, $this->eventCount($company, NotificationEventType::ServiceOrderCancelled));
    }

    /** NST9: complete vs cancel — only the winning transition's event ever exists. */
    public function test_nst9_only_the_winning_transition_emits_an_event(): void
    {
        [$company, $user] = $this->makeCompanyWithMember();
        $order = $this->createOpenOrder($company, $user);

        $this->currentCompanyContext()->run($company, function () use ($order) {
            app(ServiceOrderService::class)->complete($order);
            try {
                app(ServiceOrderService::class)->cancel($order, 'Tarde demais');
                $this->fail('Expected ServiceOrderStatusConflictException.');
            } catch (ServiceOrderStatusConflictException) {
                // expected
            }
        });

        $this->assertSame(1, $this->eventCount($company, NotificationEventType::ServiceOrderCompleted));
        $this->assertSame(0, $this->eventCount($company, NotificationEventType::ServiceOrderCancelled));
    }

    /**
     * NST10: the notification bridge does not break the row-lock/
     * concurrency discipline established in BACKEND-06B — proved by the
     * full real-PostgreSQL-concurrency suite (ServiceOrderConcurrencyTest,
     * CC1-CC12) continuing to pass unmodified with the bridge wired into
     * every ServiceOrderService method it touches. Re-asserted here as a
     * single functional smoke check that status actions still behave
     * correctly end to end when notifications are fully wired.
     */
    public function test_nst10_status_actions_still_work_correctly_with_notifications_wired(): void
    {
        [$company, $user] = $this->makeCompanyWithMember();
        $order = $this->createOpenOrder($company, $user);

        $this->currentCompanyContext()->run($company, function () use ($order) {
            $started = app(ServiceOrderService::class)->start($order);
            $this->assertSame('in_progress', $started->status->value);
            $this->assertNotNull($started->started_at);

            $completed = app(ServiceOrderService::class)->complete($started);
            $this->assertSame('completed', $completed->status->value);
        });
    }

    /**
     * §12: item add/update/delete never emits its own notification event,
     * and neither does changing travel_fee/order_discount/notes/
     * description via the header PUT — only a real scheduled_start_at
     * change does (already covered by NS3). Total event count after all
     * of this stays at exactly 1 (the original `created`).
     */
    public function test_item_crud_and_non_schedule_header_changes_emit_no_event(): void
    {
        [$company, $user] = $this->makeCompanyWithMember();
        $order = $this->createOpenOrder($company, $user);
        $catalogItem = $this->currentCompanyContext()->run($company, fn () => CatalogItem::factory()->create(['sale_price' => '50.00']));

        $itemId = $this->currentCompanyContext()->run($company, function () use ($order, $catalogItem) {
            $item = app(ServiceOrderItemService::class)->addItem($order, [
                'catalog_item_id' => $catalogItem->id,
                'quantity' => '1.000',
            ]);

            app(ServiceOrderItemService::class)->updateItem($order, $item, ['quantity' => '2.000']);

            app(ServiceOrderService::class)->updateHeader($order, [
                'customer_id' => $order->customer_id,
                'customer_address_id' => $order->customer_address_id,
                'title' => $order->title,
                'description' => 'Descrição nova',
                'travel_fee' => '99.00',
                'order_discount' => '0.00',
                'notes' => 'Observação nova',
            ]);

            return $item->id;
        });

        $this->currentCompanyContext()->run($company, function () use ($itemId, $order) {
            $item = ServiceOrderItem::query()->findOrFail($itemId);
            app(ServiceOrderItemService::class)->deleteItem($order, $item);
        });

        $totalEvents = $this->currentCompanyContext()->run($company, fn () => NotificationEvent::query()->count());
        $this->assertSame(1, $totalEvents);
    }
}
