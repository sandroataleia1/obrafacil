<?php

namespace App\Notifications\Support;

use RuntimeException;

/**
 * Centralized message text (§28) — no job/provider ever concatenates a
 * message string itself. Deliberately minimal this round: one renderer per
 * event type, no template editor, no template catalog. Each future domain
 * gets its own case here (or its own renderer class) when it's actually
 * implemented.
 */
class NotificationMessageRenderer
{
    /**
     * @param  array<string, mixed>  $payload
     */
    public function render(NotificationEventType $type, array $payload): string
    {
        return match ($type) {
            NotificationEventType::SystemTest => 'ObraFácil — mensagem de teste',
            default => throw new RuntimeException("No renderer registered for event type [{$type->value}]."),
        };
    }
}
