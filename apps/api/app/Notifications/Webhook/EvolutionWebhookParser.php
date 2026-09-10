<?php

namespace App\Notifications\Webhook;

use App\Notifications\Support\NotificationDeliveryStatus;

/**
 * Translates an Evolution API webhook callback into (provider message id,
 * internal status) — no controller/job ever reads a raw
 * `payload['data']['key']['id']`-style path itself (§32).
 *
 * The field paths and status vocabulary below (SERVER_ACK/DELIVERY_ACK/READ,
 * conceptually from SEND_MESSAGE/MESSAGES_UPDATE events) are a reasonable
 * guess at the Evolution/Baileys-family webhook shape, NOT verified against
 * the actual installed VPS version — only this class needs to change once
 * EVOLUTION-01 audits the real payload.
 */
class EvolutionWebhookParser
{
    /**
     * @param  array<string, mixed>  $payload
     */
    public function parse(array $payload): EvolutionWebhookResult
    {
        $providerMessageId = data_get($payload, 'data.key.id') ?? data_get($payload, 'data.keyId');
        $rawStatus = data_get($payload, 'data.status') ?? data_get($payload, 'data.update.status');

        return new EvolutionWebhookResult(
            providerMessageId: is_string($providerMessageId) && $providerMessageId !== '' ? $providerMessageId : null,
            status: is_string($rawStatus) ? $this->mapStatus($rawStatus) : null,
        );
    }

    private function mapStatus(string $rawStatus): ?NotificationDeliveryStatus
    {
        return match (strtoupper($rawStatus)) {
            'PENDING', 'SERVER_ACK' => NotificationDeliveryStatus::Sent,
            'DELIVERY_ACK' => NotificationDeliveryStatus::Delivered,
            'READ' => NotificationDeliveryStatus::Read,
            default => null,
        };
    }
}
