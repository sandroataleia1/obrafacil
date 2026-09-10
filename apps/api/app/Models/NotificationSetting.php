<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Database\Factories\NotificationSettingFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable([
    'user_id', 'whatsapp_enabled', 'quiet_hours_enabled', 'quiet_start', 'quiet_end',
    'daily_summary_enabled', 'daily_summary_time',
    'weekly_summary_enabled', 'weekly_summary_day', 'weekly_summary_time',
])]
class NotificationSetting extends Model
{
    /** @use HasFactory<NotificationSettingFactory> */
    use BelongsToCompany, HasFactory, HasUuids;

    protected function casts(): array
    {
        return [
            'whatsapp_enabled' => 'boolean',
            'quiet_hours_enabled' => 'boolean',
            'daily_summary_enabled' => 'boolean',
            'weekly_summary_enabled' => 'boolean',
            'weekly_summary_day' => 'integer',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
