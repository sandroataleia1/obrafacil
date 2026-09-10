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
