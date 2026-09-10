<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use App\Notifications\Support\NotificationChannel;
use App\Notifications\Support\NotificationDeliveryStatus;
use Database\Factories\NotificationDeliveryFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable([
    'notification_event_id', 'user_id', 'channel', 'provider', 'recipient', 'rendered_message',
    'status', 'provider_message_id', 'idempotency_key', 'attempts', 'last_error',
    'queued_at', 'sent_at', 'delivered_at', 'read_at', 'failed_at',
])]
class NotificationDelivery extends Model
{
    /** @use HasFactory<NotificationDeliveryFactory> */
    use BelongsToCompany, HasFactory, HasUuids;

    protected function casts(): array
    {
        return [
            'channel' => NotificationChannel::class,
            'status' => NotificationDeliveryStatus::class,
            'attempts' => 'integer',
            'queued_at' => 'datetime',
            'sent_at' => 'datetime',
            'delivered_at' => 'datetime',
            'read_at' => 'datetime',
            'failed_at' => 'datetime',
        ];
    }

    public function event(): BelongsTo
    {
        return $this->belongsTo(NotificationEvent::class, 'notification_event_id');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * The only way a delivery's status should ever change (§16/§33) —
     * enforces NotificationDeliveryStatus::canTransitionTo() and stamps the
     * matching *_at column exactly once (a repeated webhook for the same
     * status must never overwrite an already-recorded timestamp).
     *
     * @param  array<string, mixed>  $attributes  Extra columns to set atomically with the transition (e.g. provider_message_id, last_error).
     * @return bool Whether the transition was applied.
     */
    public function transitionTo(NotificationDeliveryStatus $next, array $attributes = []): bool
    {
        if (! $this->status->canTransitionTo($next)) {
            return false;
        }

        $this->fill($attributes);
        $this->status = $next;

        $timestampColumn = match ($next) {
            NotificationDeliveryStatus::Sent => 'sent_at',
            NotificationDeliveryStatus::Delivered => 'delivered_at',
            NotificationDeliveryStatus::Read => 'read_at',
            NotificationDeliveryStatus::Failed => 'failed_at',
            default => null,
        };

        if ($timestampColumn !== null && $this->{$timestampColumn} === null) {
            $this->{$timestampColumn} = now();
        }

        $this->save();

        return true;
    }
}
