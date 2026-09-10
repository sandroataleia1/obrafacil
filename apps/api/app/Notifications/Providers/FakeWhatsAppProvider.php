<?php

namespace App\Notifications\Providers;

use App\Notifications\Contracts\WhatsAppProvider;
use App\Notifications\Exceptions\WhatsAppProviderException;
use App\Notifications\Support\WhatsAppSendResult;
use App\Support\CurrentCompanyContext;

/**
 * For engine/job tests that care about orchestration (dedupe, preferences,
 * quiet hours, status transitions, retry policy) rather than the Evolution
 * HTTP contract itself — that's EvolutionApiProviderTest's job, always via
 * Http::fake() (Gate BACKEND-03 §38/§44). Records every call so tests can
 * assert on recipient/message without any real or fake HTTP request.
 */
class FakeWhatsAppProvider implements WhatsAppProvider
{
    /** @var array<int, array{recipient: string, message: string}> */
    public array $sent = [];

    /**
     * The active company id (or null) at the moment of each call — lets
     * job tests (J7) prove CurrentCompanyContext was actually established
     * before the provider was ever reached.
     *
     * @var array<int, string|null>
     */
    public array $contextCompanyIdsAtCallTime = [];

    private ?WhatsAppProviderException $nextException = null;

    private ?WhatsAppSendResult $nextResult = null;

    public function sendText(string $recipient, string $message): WhatsAppSendResult
    {
        $this->sent[] = ['recipient' => $recipient, 'message' => $message];
        $context = app(CurrentCompanyContext::class);
        $this->contextCompanyIdsAtCallTime[] = $context->has() ? $context->id() : null;

        if ($this->nextException !== null) {
            $exception = $this->nextException;
            $this->nextException = null;
            throw $exception;
        }

        $result = $this->nextResult ?? new WhatsAppSendResult(
            accepted: true,
            providerMessageId: 'fake-message-id',
            rawStatus: 'PENDING'
        );
        $this->nextResult = null;

        return $result;
    }

    public function willThrow(WhatsAppProviderException $exception): void
    {
        $this->nextException = $exception;
    }

    public function willReturn(WhatsAppSendResult $result): void
    {
        $this->nextResult = $result;
    }
}
