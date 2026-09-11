<?php

namespace App\Notifications\Support;

use Carbon\Carbon;
use RuntimeException;

/**
 * Centralized message text (§28) — no job/provider ever concatenates a
 * message string itself. Deliberately minimal this round: one renderer per
 * event type, no template editor, no template catalog. Each future domain
 * gets its own case here (or its own renderer class) when it's actually
 * implemented.
 *
 * BACKEND-06A §16/§17: this class has zero DB/Eloquent/Company dependency
 * on purpose — every ServiceOrder message below formats its human-readable,
 * timezone-aware date/time strictly from `$payload['scheduled_start_at']`
 * (a raw ISO 8601 instant) + `$payload['company_timezone']` (a plain
 * timezone string), never from the server's own timezone. The payload is
 * built once, centrally, by
 * App\ServiceOrders\Notifications\ServiceOrderNotificationPayloadBuilder.
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

            NotificationEventType::ServiceOrderCreated => sprintf(
                'ObraFácil — %s criada: %s · Cliente: %s.',
                $payload['number'],
                $payload['title'],
                $payload['customer_name'],
            ),

            NotificationEventType::ServiceOrderScheduled => sprintf(
                'ObraFácil — %s agendada para %s · Cliente: %s.',
                $payload['number'],
                $this->formatLocalDateTime($payload),
                $payload['customer_name'],
            ),

            NotificationEventType::ServiceOrderDueTomorrow => sprintf(
                'ObraFácil — %s está agendada para amanhã às %s.',
                $payload['number'],
                $this->formatLocalTime($payload),
            ),

            NotificationEventType::ServiceOrderDueToday => sprintf(
                'ObraFácil — %s está agendada para hoje às %s.',
                $payload['number'],
                $this->formatLocalTime($payload),
            ),

            NotificationEventType::ServiceOrderDue2Hours => sprintf(
                'ObraFácil — %s começa em até 2 horas, às %s.',
                $payload['number'],
                $this->formatLocalTime($payload),
            ),

            NotificationEventType::ServiceOrderOverdue => sprintf(
                'ObraFácil — %s ainda não foi iniciada e está atrasada desde %s.',
                $payload['number'],
                $this->formatLocalTime($payload),
            ),

            NotificationEventType::ServiceOrderStarted => sprintf(
                'ObraFácil — %s foi iniciada.',
                $payload['number'],
            ),

            NotificationEventType::ServiceOrderCompleted => sprintf(
                'ObraFácil — %s foi concluída.',
                $payload['number'],
            ),

            NotificationEventType::ServiceOrderCancelled => sprintf(
                'ObraFácil — %s foi cancelada. Motivo: %s.',
                $payload['number'],
                $payload['cancellation_reason'] ?? 'não informado',
            ),

            default => throw new RuntimeException("No renderer registered for event type [{$type->value}]."),
        };
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    private function formatLocalDateTime(array $payload): string
    {
        return $this->localScheduledStart($payload)->format('d/m/Y \à\s H:i');
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    private function formatLocalTime(array $payload): string
    {
        return $this->localScheduledStart($payload)->format('H:i');
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    private function localScheduledStart(array $payload): Carbon
    {
        $iso = $payload['scheduled_start_at'] ?? null;
        if ($iso === null) {
            throw new RuntimeException('Cannot format a schedule-dependent ServiceOrder message without scheduled_start_at in the payload.');
        }

        $timezone = $payload['company_timezone'] ?? 'America/Sao_Paulo';

        return Carbon::parse($iso)->setTimezone($timezone);
    }
}
