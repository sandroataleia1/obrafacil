<?php

namespace App\Notifications\Providers;

use App\Notifications\Contracts\WhatsAppProvider;
use App\Notifications\Exceptions\WhatsAppClientException;
use App\Notifications\Exceptions\WhatsAppConnectionException;
use App\Notifications\Exceptions\WhatsAppInvalidResponseException;
use App\Notifications\Exceptions\WhatsAppServerException;
use App\Notifications\Exceptions\WhatsAppTimeoutException;
use App\Notifications\Support\WhatsAppSendResult;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;

/**
 * Evolution API adapter (Gate BACKEND-03 §6). Talks to whatever
 * EVOLUTION_API_URL/EVOLUTION_INSTANCE are configured to — never the VPS
 * during this round's tests (see EvolutionApiProviderTest, all Http::fake()).
 *
 * The response shape assumed here (`key.id`, `status`) is a reasonable
 * guess at the Evolution API family's `POST /message/sendText/{instance}`
 * contract, NOT verified against the actual installed VPS version — that
 * audit is EVOLUTION-01's job. If the real shape differs, only this class
 * needs to change; WhatsAppSendResult's contract to the rest of the app
 * stays the same.
 *
 * BACKEND-03A §11 — timeout ambiguity, documented and NOT solved here: a
 * WhatsAppTimeoutException means this client never saw a response, not
 * that the provider never accepted the message. Evolution may have already
 * queued/sent it before the socket timed out on our end. Retrying that
 * delivery (our recoverable-error retry policy does exactly this) can
 * therefore produce a genuine duplicate WhatsApp message on the recipient's
 * phone. `notification_deliveries.idempotency_key` does NOT protect against
 * this — it only deduplicates *our own* database/queue writes, and has no
 * effect once a request has actually left this process for Evolution.
 * Closing this gap requires the real provider to support some form of
 * client-supplied message id / idempotency key on the send endpoint, which
 * has not been verified for the installed VPS version. Until EVOLUTION-01
 * audits that, this risk is accepted and documented, not silently assumed
 * away.
 */
class EvolutionApiProvider implements WhatsAppProvider
{
    public function __construct(
        private readonly string $baseUrl,
        private readonly string $apiKey,
        private readonly string $instance,
        private readonly int $timeoutSeconds,
    ) {}

    public function sendText(string $recipient, string $message): WhatsAppSendResult
    {
        $number = $this->toProviderNumber($recipient);

        try {
            $response = Http::withHeaders(['apikey' => $this->apiKey])
                ->timeout($this->timeoutSeconds)
                ->post(
                    rtrim($this->baseUrl, '/')."/message/sendText/{$this->instance}",
                    ['number' => $number, 'text' => $message]
                );
        } catch (ConnectionException $e) {
            // Laravel's HTTP client throws the same exception class for a
            // refused/unreachable connection AND for a client-side timeout
            // — the underlying message is the only signal that
            // distinguishes them.
            if (Str::contains(strtolower($e->getMessage()), ['timed out', 'timeout'])) {
                throw new WhatsAppTimeoutException('WhatsApp provider request timed out.', previous: $e);
            }

            throw new WhatsAppConnectionException('Failed to connect to WhatsApp provider.', previous: $e);
        }

        if ($response->serverError()) {
            throw new WhatsAppServerException(
                "WhatsApp provider returned a server error (status {$response->status()}).",
                $response->status()
            );
        }

        if ($response->clientError()) {
            throw new WhatsAppClientException(
                "WhatsApp provider rejected the request (status {$response->status()}).",
                $response->status()
            );
        }

        $data = $response->json();

        if (! is_array($data)) {
            throw new WhatsAppInvalidResponseException('WhatsApp provider returned a non-JSON response.');
        }

        $providerMessageId = data_get($data, 'key.id');
        $rawStatus = data_get($data, 'status') ?? data_get($data, 'key.status');

        return new WhatsAppSendResult(
            accepted: true,
            providerMessageId: is_string($providerMessageId) ? $providerMessageId : null,
            rawStatus: is_string($rawStatus) ? $rawStatus : null,
        );
    }

    /**
     * The app's canonical storage format is always E.164 (`+5511999999999`)
     * — that value in `users.phone` is never touched. This conversion
     * exists only because the Evolution family's `number` field is
     * conventionally digits-only, no leading `+`.
     */
    private function toProviderNumber(string $e164Recipient): string
    {
        return ltrim($e164Recipient, '+');
    }
}
