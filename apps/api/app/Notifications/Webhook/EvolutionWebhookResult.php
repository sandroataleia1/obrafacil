<?php

namespace App\Notifications\Webhook;

use App\Notifications\Support\NotificationDeliveryStatus;

final class EvolutionWebhookResult
{
    public function __construct(
        public readonly ?string $providerMessageId,
        public readonly ?NotificationDeliveryStatus $status,
    ) {}

    public function isRecognized(): bool
    {
        return $this->providerMessageId !== null && $this->status !== null;
    }
}
