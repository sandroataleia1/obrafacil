<?php

namespace App\ServiceOrders\Notifications;

use App\Models\Company;
use App\Models\ServiceOrder;
use App\Notifications\Support\NotificationDispatcher;
use App\Notifications\Support\NotificationEventType;
use App\Support\CurrentCompanyContext;
use Carbon\CarbonInterface;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * BACKEND-06A §2-6. The ONLY thing ServiceOrderService is allowed to know
 * about notifications — it calls `created()`/`scheduled()`/`started()`/
 * `completed()`/`cancelled()` and stops caring. This class never talks to
 * `EvolutionApiProvider`/`SendWhatsAppNotificationJob` directly (§2) — it
 * only ever calls `NotificationDispatcher::dispatch()`, and only from
 * inside a `DB::afterCommit()` callback (§3/§4), so a slow/failing
 * notification pipeline can never be on the critical path of a
 * ServiceOrder mutation, and a rolled-back ServiceOrder transaction can
 * never produce a notification (`DB::afterCommit()` callbacks registered
 * during a transaction that rolls back are simply discarded by Laravel —
 * they never run at all, see ServiceOrderNotificationBridgeTest for the
 * explicit proof).
 *
 * §5: a failure inside the afterCommit callback (e.g. the dispatcher
 * itself throwing) is caught and logged here — by the time this callback
 * runs, the ServiceOrder is already durably committed, so nothing can
 * turn that success back into an HTTP error. The periodic scanner
 * (App\Console\Commands\ServiceOrderNotificationScanner) is what gives a
 * failed attempt here a second chance later, keyed by the exact same
 * deterministic deduplication key.
 */
class ServiceOrderNotificationBridge
{
    public function __construct(
        private readonly NotificationDispatcher $dispatcher,
        private readonly ServiceOrderNotificationPayloadBuilder $payloadBuilder,
        private readonly CurrentCompanyContext $context,
    ) {}

    public function created(ServiceOrder $order): void
    {
        $this->queue($order, NotificationEventType::ServiceOrderCreated, ServiceOrderNotificationDedupKey::created($order->id), $order->created_at);
    }

    /**
     * §8: a no-op when `scheduled_start_at` is null — callers (both
     * ServiceOrderService and the reconciliation scanner) are expected to
     * call this unconditionally after create/update; the null-guard lives
     * here once instead of being duplicated at every call site.
     */
    public function scheduled(ServiceOrder $order): void
    {
        if ($order->scheduled_start_at === null) {
            return;
        }

        $occurrence = $order->scheduled_start_at->toIso8601String();
        $this->queue(
            $order,
            NotificationEventType::ServiceOrderScheduled,
            ServiceOrderNotificationDedupKey::scheduled($order->id, $occurrence)
        );
    }

    public function started(ServiceOrder $order): void
    {
        $this->queue($order, NotificationEventType::ServiceOrderStarted, ServiceOrderNotificationDedupKey::started($order->id), $order->started_at);
    }

    public function completed(ServiceOrder $order): void
    {
        $this->queue($order, NotificationEventType::ServiceOrderCompleted, ServiceOrderNotificationDedupKey::completed($order->id), $order->completed_at);
    }

    public function cancelled(ServiceOrder $order): void
    {
        $this->queue($order, NotificationEventType::ServiceOrderCancelled, ServiceOrderNotificationDedupKey::cancelled($order->id), $order->cancelled_at);
    }

    /**
     * §21-27: the 4 time-based reminder events — dispatched only by
     * App\Console\Commands\ServiceOrderNotificationScanner, never by
     * ServiceOrderService (nothing about editing/transitioning an O.S.
     * triggers these; they're purely a function of the current time vs.
     * `scheduled_start_at`). Centralized here anyway so every one of the
     * 9 ServiceOrder event types is built/dispatched through exactly one
     * code path, never duplicated between the scanner and anything else.
     */
    public function dueTomorrow(ServiceOrder $order): void
    {
        if ($order->scheduled_start_at === null) {
            return;
        }

        $occurrence = $order->scheduled_start_at->toIso8601String();
        $this->queue(
            $order,
            NotificationEventType::ServiceOrderDueTomorrow,
            ServiceOrderNotificationDedupKey::dueTomorrow($order->id, $occurrence)
        );
    }

    public function dueToday(ServiceOrder $order): void
    {
        if ($order->scheduled_start_at === null) {
            return;
        }

        $occurrence = $order->scheduled_start_at->toIso8601String();
        $this->queue(
            $order,
            NotificationEventType::ServiceOrderDueToday,
            ServiceOrderNotificationDedupKey::dueToday($order->id, $occurrence)
        );
    }

    public function due2Hours(ServiceOrder $order): void
    {
        if ($order->scheduled_start_at === null) {
            return;
        }

        $occurrence = $order->scheduled_start_at->toIso8601String();
        $this->queue(
            $order,
            NotificationEventType::ServiceOrderDue2Hours,
            ServiceOrderNotificationDedupKey::due2Hours($order->id, $occurrence)
        );
    }

    public function overdue(ServiceOrder $order): void
    {
        if ($order->scheduled_start_at === null) {
            return;
        }

        $occurrence = $order->scheduled_start_at->toIso8601String();
        $this->queue(
            $order,
            NotificationEventType::ServiceOrderOverdue,
            ServiceOrderNotificationDedupKey::overdue($order->id, $occurrence)
        );
    }

    /**
     * Builds the payload NOW (while CurrentCompanyContext is still the
     * live request/command context and `$order` is still the
     * freshly-mutated in-memory instance), but only actually calls the
     * dispatcher inside a `DB::afterCommit()` callback — the callback
     * re-resolves Company by id independently, since the context that
     * built the payload may no longer be active by the time the
     * transaction actually commits and this callback runs.
     */
    private function queue(ServiceOrder $order, NotificationEventType $type, string $dedupKey, ?CarbonInterface $occurredAt = null): void
    {
        $companyId = $order->company_id;
        $orderId = $order->id;
        $timezone = $this->context->has() ? $this->context->get()->timezone : 'America/Sao_Paulo';
        $payload = $this->payloadBuilder->build($order, $timezone);

        DB::afterCommit(function () use ($companyId, $orderId, $type, $payload, $dedupKey, $occurredAt) {
            try {
                $company = Company::query()->findOrFail($companyId);

                $this->dispatcher->dispatch(
                    $company,
                    $type,
                    'service_order',
                    $orderId,
                    $payload,
                    $dedupKey,
                    $occurredAt,
                );
            } catch (Throwable $e) {
                // §5: the ServiceOrder is already committed by the time
                // this runs — never let a notification failure look like
                // the business operation itself failed. The scanner's
                // reconciliation pass (§28-33) retries this later, using
                // the exact same deduplication key.
                Log::error('service_order notification dispatch failed', [
                    'service_order_id' => $orderId,
                    'company_id' => $companyId,
                    'event_type' => $type->value,
                    'deduplication_key' => $dedupKey,
                    'exception' => $e::class,
                    'message' => $e->getMessage(),
                ]);
            }
        });
    }
}
