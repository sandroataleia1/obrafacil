<?php

namespace App\Notifications\Support;

/**
 * Encapsulates whatever shape the provider's raw response actually has
 * (Gate BACKEND-03 §7) — nothing outside the provider adapter ever reads
 * a raw `response['key']['id']`-style path. If EVOLUTION-01 finds the real
 * VPS response differs from what's assumed here, only the adapter that
 * builds this DTO needs to change.
 */
final class WhatsAppSendResult
{
    public function __construct(
        public readonly bool $accepted,
        public readonly ?string $providerMessageId,
        public readonly ?string $rawStatus,
    ) {}
}
