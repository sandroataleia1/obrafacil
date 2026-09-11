<?php

namespace App\Console\Commands;

use App\Enums\ServiceOrderStatus;
use App\Models\Company;
use App\Models\NotificationEvent;
use App\Models\ServiceOrder;
use App\ServiceOrders\Notifications\ServiceOrderNotificationBridge;
use App\ServiceOrders\Notifications\ServiceOrderNotificationDedupKey;
use App\Support\CurrentCompanyContext;
use Carbon\Carbon;
use Illuminate\Console\Command;

/**
 * BACKEND-06A §21-33. Two responsibilities in one periodic pass, both
 * driven entirely by persisted data + the deterministic deduplication
 * keys in ServiceOrderNotificationDedupKey — running this command any
 * number of times, concurrently or not, never produces more than one
 * NotificationEvent per real occurrence (§27/§37 — the real safety net is
 * `notification_events`' `(company_id, deduplication_key)` unique
 * constraint, this command only has to be consistent, not itself atomic):
 *
 * 1. Time-based reminders (due_tomorrow/due_today/due_2_hours/overdue) —
 *    §22: only ever for `status=open` ServiceOrders. Once an O.S. is
 *    in_progress/completed/cancelled it's no longer "about to start", so
 *    none of these four apply anymore.
 * 2. Reconciliation (§28-33) — recovers any lifecycle NotificationEvent
 *    (created/scheduled/started/completed/cancelled) that a
 *    ServiceOrderNotificationBridge afterCommit callback failed to
 *    produce (§5: a business commit must never be undone by a
 *    notification failure) — based purely on persisted timestamp columns
 *    (`created_at`/`started_at`/`completed_at`/`cancelled_at`) and the
 *    *current* `scheduled_start_at`, never a reconstructed history.
 *
 * §35: no HTTP session exists in a console command — every ServiceOrder
 * query is wrapped in `CurrentCompanyContext::run($company, ...)` per
 * Company, exactly once per iteration, never
 * `ServiceOrder::withoutCompanyScope()`. §36: chunks by id, never loads
 * every ServiceOrder in the system into memory at once.
 */
class ServiceOrderNotificationScanner extends Command
{
    protected $signature = 'notifications:service-orders';

    protected $description = 'Emit ServiceOrder reminder/reconciliation notifications for every Company (BACKEND-06A).';

    private const int CHUNK_SIZE = 200;

    public function handle(CurrentCompanyContext $context, ServiceOrderNotificationBridge $bridge): int
    {
        $now = Carbon::now();

        Company::query()->chunkById(self::CHUNK_SIZE, function ($companies) use ($context, $bridge, $now) {
            foreach ($companies as $company) {
                $context->run($company, function () use ($company, $bridge, $now) {
                    $this->emitReminders($company, $bridge, $now);
                    $this->reconcile($bridge);
                });
            }
        });

        return self::SUCCESS;
    }

    /**
     * §22-27. A single bounded query per company — `scheduled_start_at`
     * is unbounded on the past side (an O.S. can be overdue by any
     * amount) but bounded above by "tomorrow's local end of day", since
     * nothing further in the future needs a reminder yet.
     */
    private function emitReminders(Company $company, ServiceOrderNotificationBridge $bridge, Carbon $now): void
    {
        $timezone = $company->timezone;
        $localNow = $now->clone()->setTimezone($timezone);
        $localTodayDate = $localNow->toDateString();
        $localTomorrowDate = $localNow->clone()->addDay()->toDateString();
        // BACKEND-06A: a Carbon instance still carrying a non-UTC
        // timezone gets naively string-formatted (no offset) by the
        // query grammar when bound into a where() clause — same failure
        // mode as ServiceOrderService::normalizeSchedule()'s docblock
        // explains for storage. Converting to UTC here, right before use
        // as a query bound, is what keeps this comparison correct for
        // every company timezone.
        $tomorrowEnd = $localNow->clone()->addDay()->endOfDay()->utc();
        $twoHoursFromNow = $now->clone()->addHours(2);

        ServiceOrder::query()
            ->where('status', ServiceOrderStatus::Open->value)
            ->whereNotNull('scheduled_start_at')
            ->where('scheduled_start_at', '<=', $tomorrowEnd)
            ->chunkById(self::CHUNK_SIZE, function ($orders) use ($bridge, $now, $timezone, $localTodayDate, $localTomorrowDate, $twoHoursFromNow) {
                foreach ($orders as $order) {
                    $scheduled = $order->scheduled_start_at;
                    $localDate = $scheduled->clone()->setTimezone($timezone)->toDateString();

                    if ($localDate === $localTomorrowDate) {
                        $bridge->dueTomorrow($order);
                    }

                    if ($localDate === $localTodayDate && $scheduled->gt($now)) {
                        $bridge->dueToday($order);
                    }

                    if ($scheduled->gt($now) && $scheduled->lte($twoHoursFromNow)) {
                        $bridge->due2Hours($order);
                    }

                    if ($scheduled->lt($now)) {
                        $bridge->overdue($order);
                    }
                }
            });
    }

    /**
     * §28-33. Every ServiceOrder in the company, regardless of status —
     * a completed/cancelled O.S. still deserves its historical
     * created/started/completed/cancelled events. A cheap existence
     * check against `notification_events` (indexed by the same
     * `deduplication_key` the dispatcher itself relies on) is done
     * BEFORE calling the bridge, so an already-reconciled O.S. costs one
     * SELECT per lifecycle event instead of a wasted transaction/insert
     * attempt on every single scan.
     */
    private function reconcile(ServiceOrderNotificationBridge $bridge): void
    {
        ServiceOrder::query()->chunkById(self::CHUNK_SIZE, function ($orders) use ($bridge) {
            foreach ($orders as $order) {
                if (! $this->eventExists(ServiceOrderNotificationDedupKey::created($order->id))) {
                    $bridge->created($order);
                }

                if ($order->scheduled_start_at !== null) {
                    $key = ServiceOrderNotificationDedupKey::scheduled($order->id, $order->scheduled_start_at->toIso8601String());
                    if (! $this->eventExists($key)) {
                        $bridge->scheduled($order);
                    }
                }

                if ($order->started_at !== null && ! $this->eventExists(ServiceOrderNotificationDedupKey::started($order->id))) {
                    $bridge->started($order);
                }

                if ($order->completed_at !== null && ! $this->eventExists(ServiceOrderNotificationDedupKey::completed($order->id))) {
                    $bridge->completed($order);
                }

                if ($order->cancelled_at !== null && ! $this->eventExists(ServiceOrderNotificationDedupKey::cancelled($order->id))) {
                    $bridge->cancelled($order);
                }
            }
        });
    }

    private function eventExists(string $deduplicationKey): bool
    {
        return NotificationEvent::query()->where('deduplication_key', $deduplicationKey)->exists();
    }
}
