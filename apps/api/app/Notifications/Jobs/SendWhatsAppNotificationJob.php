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
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
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
 */
class SendWhatsAppNotificationJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 5;

    /**
     * §12: 1min, 5min, 15min, 1h between attempts — then queue's normal
     * "tries exhausted" handling calls failed() below. Not infinite.
     */
    public array $backoff = [60, 300, 900, 3600];

    public function __construct(
        public readonly string $companyId,
        public readonly string $deliveryId,
    ) {}

    public function handle(WhatsAppProvider $provider, CurrentCompanyContext $context): void
    {
        $company = Company::find($this->companyId);
        if ($company === null) {
            return;
        }

        $context->run($company, function () use ($provider): void {
            $delivery = NotificationDelivery::find($this->deliveryId);
            if ($delivery === null) {
                // Either genuinely gone, or (fail-closed, §3) it belongs to
                // a different company than $this->companyId claims — the
                // CompanyScope global scope makes those indistinguishable
                // from here, which is exactly the point.
                return;
            }

            if ($delivery->status->isTerminal()) {
                return;
            }

            $delivery->increment('attempts');
            $delivery->transitionTo(NotificationDeliveryStatus::Processing);

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
                $delivery->last_error = $this->sanitizeError($e);
                $delivery->save();

                throw $e;
            }

            $delivery->transitionTo(NotificationDeliveryStatus::Sent, [
                'provider_message_id' => $result->providerMessageId,
            ]);
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
