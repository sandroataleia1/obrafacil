<?php

namespace App\Notifications\Support;

use App\Models\Company;
use App\Models\NotificationDelivery;
use App\Models\NotificationEvent;
use App\Models\NotificationPreference;
use App\Models\NotificationSetting;
use App\Models\User;
use App\Notifications\Jobs\SendWhatsAppNotificationJob;
use App\Support\CurrentCompanyContext;
use Carbon\CarbonInterface;
use Illuminate\Database\QueryException;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * The one place allowed to turn a domain event into a queued WhatsApp
 * delivery (§2, §26). No domain code ever calls Evolution/WhatsAppProvider
 * directly — it calls dispatch() and stops caring.
 *
 * Establishes CurrentCompanyContext itself (via ::run()) rather than
 * trusting the caller to have done so — a scheduler/job calling this has no
 * HTTP session to inherit context from (§3), so making that safe by
 * construction here means every future caller gets it right automatically.
 */
class NotificationDispatcher
{
    public function __construct(
        private readonly CurrentCompanyContext $context,
        private readonly NotificationMessageRenderer $renderer,
        private readonly QuietHoursService $quietHours,
    ) {}

    /**
     * @param  array<string, mixed>  $payload  Never a secret — see NotificationEvent's docblock.
     * @return NotificationEvent|null null when (company, $deduplicationKey) already has an event —
     *                                nothing else happens in that case, this call is a safe no-op.
     */
    public function dispatch(
        Company $company,
        NotificationEventType $type,
        ?string $entityType,
        ?string $entityId,
        array $payload,
        string $deduplicationKey,
        ?CarbonInterface $occurredAt = null,
    ): ?NotificationEvent {
        return $this->context->run($company, function () use ($company, $type, $entityType, $entityId, $payload, $deduplicationKey, $occurredAt) {
            return DB::transaction(function () use ($company, $type, $entityType, $entityId, $payload, $deduplicationKey, $occurredAt) {
                $event = $this->createEventOrNull($type, $entityType, $entityId, $payload, $deduplicationKey, $occurredAt);

                if ($event === null) {
                    return null;
                }

                foreach ($this->eligibleRecipients($company, $type) as $user) {
                    $this->createDeliveryAndQueue($company, $event, $user, $type, $payload);
                }

                return $event;
            });
        });
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    private function createEventOrNull(
        NotificationEventType $type,
        ?string $entityType,
        ?string $entityId,
        array $payload,
        string $deduplicationKey,
        ?CarbonInterface $occurredAt,
    ): ?NotificationEvent {
        try {
            // A nested DB::transaction() here (we're always called from
            // inside dispatch()'s own transaction) becomes a real SAVEPOINT
            // under Postgres — on the unique-violation catch below, only
            // this savepoint rolls back. Without it, the failed INSERT
            // would poison the *entire* outer transaction (Postgres aborts
            // the whole transaction on any statement error until a
            // rollback), breaking every query after this method returns.
            return DB::transaction(function () use ($type, $entityType, $entityId, $payload, $deduplicationKey, $occurredAt) {
                return NotificationEvent::create([
                    'type' => $type,
                    'entity_type' => $entityType,
                    'entity_id' => $entityId,
                    'payload' => $payload,
                    'deduplication_key' => $deduplicationKey,
                    'occurred_at' => $occurredAt ?? now(),
                ]);
            });
        } catch (QueryException $e) {
            if ($this->isUniqueViolation($e)) {
                return null;
            }

            throw $e;
        }
    }

    /**
     * A company member is eligible only with BOTH an explicit opt-in
     * (NotificationSetting.whatsapp_enabled) AND an explicit, enabled
     * preference row for this exact event type + channel (§19/§20/§27 —
     * "sem preferência = sem envio": a missing preference row is never
     * treated as "enabled by default").
     *
     * @return Collection<int, User>
     */
    private function eligibleRecipients(Company $company, NotificationEventType $type): Collection
    {
        return $company->users()->get()->filter(function (User $user) use ($type) {
            if ($user->phone === null) {
                return false;
            }

            $setting = NotificationSetting::query()->where('user_id', $user->id)->first();
            if ($setting === null || ! $setting->whatsapp_enabled) {
                return false;
            }

            $preference = NotificationPreference::query()
                ->where('user_id', $user->id)
                ->where('event_type', $type->value)
                ->where('channel', NotificationChannel::WhatsApp->value)
                ->first();

            return $preference !== null && $preference->enabled;
        })->values();
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    private function createDeliveryAndQueue(
        Company $company,
        NotificationEvent $event,
        User $user,
        NotificationEventType $type,
        array $payload,
    ): NotificationDelivery {
        $message = $this->renderer->render($type, $payload);

        // Deterministic from (event, user, channel) — a genuine duplicate
        // attempt (e.g. a bug re-running this method for the same event)
        // hits the (company_id, idempotency_key) unique constraint instead
        // of silently double-queueing a send.
        $idempotencyKey = "{$event->id}:{$user->id}:".NotificationChannel::WhatsApp->value;

        $delivery = NotificationDelivery::create([
            'notification_event_id' => $event->id,
            'user_id' => $user->id,
            'channel' => NotificationChannel::WhatsApp,
            'provider' => 'evolution',
            // Snapshots — see NotificationDelivery migration docblock.
            'recipient' => $user->phone,
            'rendered_message' => $message,
            'status' => NotificationDeliveryStatus::Queued,
            'idempotency_key' => $idempotencyKey,
            'queued_at' => now(),
        ]);

        $sendAt = $this->resolveSendTime($company, $user);

        $pending = SendWhatsAppNotificationJob::dispatch($company->id, $delivery->id)->afterCommit();
        if ($sendAt !== null) {
            $pending->delay($sendAt);
        }

        return $delivery;
    }

    /**
     * null means "send as soon as the job runs" — a non-null value means
     * quiet hours are active right now, and the job should wait until they
     * end rather than being dropped (§23).
     */
    private function resolveSendTime(Company $company, User $user): ?CarbonInterface
    {
        $setting = NotificationSetting::query()->where('user_id', $user->id)->first();
        if ($setting === null) {
            return null;
        }

        if ($this->quietHours->canSendNow($setting, $company->timezone)) {
            return null;
        }

        return $this->quietHours->nextAllowedTime($setting, $company->timezone);
    }

    private function isUniqueViolation(QueryException $e): bool
    {
        return $e->getCode() === '23505' || str_contains($e->getMessage(), 'notification_events_company_id_deduplication_key_unique');
    }
}
