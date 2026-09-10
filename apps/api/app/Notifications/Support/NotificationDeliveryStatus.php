<?php

namespace App\Notifications\Support;

/**
 * A PHP backed enum, not a DB enum (same rationale as NotificationEventType)
 * — the `notification_deliveries.status` column is a plain string.
 */
enum NotificationDeliveryStatus: string
{
    case Queued = 'queued';
    case Processing = 'processing';
    case Retrying = 'retrying';
    case Sent = 'sent';
    case Delivered = 'delivered';
    case Read = 'read';
    case Failed = 'failed';
    case Skipped = 'skipped';

    /**
     * Happy-path ordering (§16): queued -> processing -> sent -> delivered
     * -> read. Failed/Skipped/Retrying aren't part of this ladder — they're
     * handled explicitly in canTransitionTo().
     */
    private function rank(): int
    {
        return match ($this) {
            self::Queued => 0,
            self::Processing => 1,
            self::Sent => 2,
            self::Delivered => 3,
            self::Read => 4,
            self::Failed, self::Skipped, self::Retrying => -1,
        };
    }

    /**
     * True for states nothing should move on from spontaneously — a
     * provider webhook repeating the same terminal status must stay a
     * no-op, never an error, but it must never regress either
     * (e.g. read -> delivered).
     */
    public function isTerminal(): bool
    {
        return match ($this) {
            self::Read, self::Skipped => true,
            default => false,
        };
    }

    /**
     * Whether a delivery in this state may be atomically claimed by
     * SendWhatsAppNotificationJob and handed to the WhatsApp provider
     * (BACKEND-03A §3/§4).
     *
     * This is deliberately NOT the inverse of isTerminal() — the two answer
     * different questions. `sent` is not terminal (the webhook can still
     * move it on to `delivered`/`read`), but it is absolutely not sendable
     * again: the message already went out. Only a delivery that has never
     * successfully reached the provider (Queued) or that failed
     * recoverably and is waiting for its next attempt (Retrying) may be
     * claimed.
     */
    public function isSendable(): bool
    {
        return match ($this) {
            self::Queued, self::Retrying => true,
            default => false,
        };
    }

    /**
     * Whether moving from $this to $next is allowed.
     *
     * Rules (§16/§17, §33):
     *  - repeating the same status is always a no-op success (idempotent
     *    webhook redelivery never corrupts state);
     *  - Read and Skipped are final — nothing (including Failed) moves a
     *    delivery on from them;
     *  - Failed is reachable from any non-terminal state (a failure can
     *    happen at any point in the happy path) but only progresses
     *    forward again via an explicit reprocessing back to Queued — never
     *    spontaneously, and never straight to Processing;
     *  - Processing <-> Retrying is the recoverable-failure/backoff cycle:
     *    a recoverable provider error moves Processing -> Retrying, and the
     *    next attempt's atomic claim moves Retrying -> Processing. Retrying
     *    never jumps anywhere else (in particular never straight to Sent);
     *  - otherwise, only forward movement along the happy-path ranking is
     *    allowed — never backward (e.g. delivered -> sent, sent ->
     *    processing, delivered -> processing, read -> processing).
     */
    public function canTransitionTo(self $next): bool
    {
        if ($this === $next) {
            return true;
        }

        if ($this->isTerminal()) {
            return false;
        }

        if ($this === self::Failed) {
            return $next === self::Queued;
        }

        if ($next === self::Failed) {
            return true;
        }

        if ($this === self::Retrying) {
            return $next === self::Processing;
        }

        if ($this === self::Processing && $next === self::Retrying) {
            return true;
        }

        return $next->rank() > $this->rank();
    }
}
