<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use App\Notifications\Support\NotificationEventType;
use Database\Factories\NotificationEventFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * `payload` is internal bookkeeping, never a place for secrets (§29) — no
 * password, session cookie, API key, or token ever belongs in it.
 */
#[Fillable(['type', 'entity_type', 'entity_id', 'payload', 'deduplication_key', 'occurred_at'])]
class NotificationEvent extends Model
{
    /** @use HasFactory<NotificationEventFactory> */
    use BelongsToCompany, HasFactory, HasUuids;

    protected function casts(): array
    {
        return [
            'type' => NotificationEventType::class,
            'payload' => 'array',
            'occurred_at' => 'datetime',
        ];
    }

    public function deliveries(): HasMany
    {
        return $this->hasMany(NotificationDelivery::class);
    }
}
