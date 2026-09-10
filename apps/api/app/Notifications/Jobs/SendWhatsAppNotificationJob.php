<?php

namespace App\Notifications\Jobs;

use App\Models\Company;
use App\Models\NotificationDelivery;
use App\Notifications\Contracts\WhatsAppProvider;
use App\Notifications\Exceptions\WhatsAppClientException;
use App\Notifications\Exceptions\WhatsAppProviderException;
use App\Notifications\Support\NotificationDeliveryStatus;
use App\Support\CurrentCompanyContext;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldBeUnique;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Throwable;

/**
 * Never dispatched synchronously with the business operation that caused it
 * (§10) — always ShouldQueue, always ->afterCommit() from the dispatcher, so
 * a WhatsApp failure can never affect whether the main operation is
 * considered complete.
 *
 * Jobs have no HTTP session, so CurrentCompanyContext is never implicitly
 * available (§3) — this job establishes it explicitly via
 * CurrentCompanyContext::run(), which also guarantees it's cleared again
 * when the job finishes, success or failure.
 *
 * BACKEND-03A: the provider may only ever be called after this job wins an
 * atomic claim on the delivery (§4/§8) — a `SELECT ... FOR UPDATE` +
 * status check + transition, all inside one DB transaction, so PostgreSQL
 * itself is the authority that decides whether this execution is allowed
 * to send, not an in-memory status check racing another worker.
 * ShouldBeUnique is a supplementary guard against a delivery being
 * enqueued twice in the first place (§12) — it is not relied on as the
 * only barrier; the claim below is what actually prevents a duplicate
 * WhatsApp send even if two identical jobs are somehow both dequeued.
 */
class SendWhatsAppNotificationJob implements ShouldBeUnique, ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 5;

    /**
     * §12: 1min, 5min, 15min, 1h between attempts — then queue's normal
     * "tries exhausted" handling calls failed() below. Not infinite.
     */
    public array $backoff = [60, 300, 900, 3600];

    /**
     * Covers the entire retry window (§12's backoff schedule tops out at
     * 3600s) — long enough that a genuine duplicate dispatch for the same
     * delivery while it's still in flight is rejected, short enough that a
     * stale lock can never permanently block legitimate future reprocessing
     * (failed -> queued -> redispatch) of the same delivery id.
     */
    public int $uniqueFor = 3600;

    public function __construct(
        public readonly string $companyId,
        public readonly string $deliveryId,
    ) {}

    public function uniqueId(): string
    {
        return $this->deliveryId;
    }

    public function handle(WhatsAppProvider $provider, CurrentCompanyContext $context): void
    {
        $company = Company::find($this->companyId);
        if ($company === null) {
            return;
        }

        $context->run($company, function () use ($provider): void {
            $delivery = $this->claimDelivery();
            if ($delivery === null) {
                // Nothing to do: the delivery doesn't exist, doesn't belong
                // to $this->companyId (fail-closed, §22 — CompanyScope makes
                // "gone" and "someone else's" indistinguishable from here,
                // which is exactly the point), or is not in a sendable
                // state (already sent/delivered/read/failed/skipped, or
                // lost the race to another worker). Zero provider calls.
                return;
            }

            try {
                $result = $provider->sendText($delivery->recipient, $delivery->rendered_message);
            } catch (WhatsAppClientException $e) {
                // 4xx — not recoverable by retrying the same payload
                // (§12). Fail immediately instead of consuming the
                // backoff schedule uselessly.
                $delivery->last_error = $this->sanitizeError($e);
                $delivery->save();
                $this->fail($e);

                return;
            } catch (WhatsAppProviderException $e) {
                // Recoverable (connection/timeout/5xx) — record the error
                // and move the delivery to Retrying so it can be claimed
                // again once the queue's backoff releases this job for
                // another attempt (§10/§17). It must not stay "Processing"
                // while no attempt is actually in flight.
                $delivery->transitionTo(NotificationDeliveryStatus::Retrying, [
                    'last_error' => $this->sanitizeError($e),
                ]);

                throw $e;
            }

            $delivery->transitionTo(NotificationDeliveryStatus::Sent, [
                'provider_message_id' => $result->providerMessageId,
            ]);
        });
    }

    /**
     * The atomic claim (§4/§8/§18): locks the delivery row for the
     * duration of this transaction so a concurrent execution for the same
     * delivery blocks until this one commits (or rolls back), then sees
     * the post-claim status and correctly finds nothing left to claim.
     * `attempts` is only persisted when the claim actually succeeds (§9)
     * — a lost race or an already-settled delivery leaves it untouched.
     */
    private function claimDelivery(): ?NotificationDelivery
    {
        return DB::transaction(function (): ?NotificationDelivery {
            $delivery = NotificationDelivery::whereKey($this->deliveryId)->lockForUpdate()->first();

            if ($delivery === null || ! $delivery->status->isSendable()) {
                return null;
            }

            $delivery->attempts++;
            $claimed = $delivery->transitionTo(NotificationDeliveryStatus::Processing);

            return $claimed ? $delivery : null;
        });
    }

    /**
     * Called once retries are exhausted (or after $this->fail() above) —
     * the final, terminal outcome.
     */
    public function failed(?Throwable $exception): void
    {
        $company = Company::find($this->companyId);
        if ($company === null) {
            return;
        }

        app(CurrentCompanyContext::class)->run($company, function () use ($exception): void {
            $delivery = NotificationDelivery::find($this->deliveryId);
            $delivery?->transitionTo(NotificationDeliveryStatus::Failed, [
                'last_error' => $exception !== null ? $this->sanitizeError($exception) : $delivery->last_error,
            ]);
        });
    }

    /**
     * §9/§36: the provider's exception messages are already built without
     * ever interpolating the API key or raw headers — this just keeps the
     * stored value bounded.
     */
    private function sanitizeError(Throwable $e): string
    {
        return Str::limit($e->getMessage(), 500, '');
    }
}
