<?php

namespace App\Http\Resources;

use App\Notifications\Settings\NotificationSettingsSnapshot;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @property NotificationSettingsSnapshot $resource
 */
class NotificationSettingsResource extends JsonResource
{
    /**
     * The response contract (§4) is `{"settings": ..., "preferences": ...}`
     * at the top level — never Laravel's default `{"data": {...}}`
     * envelope.
     */
    public static $wrap = null;

    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'settings' => [
                'whatsapp_enabled' => $this->resource->whatsappEnabled,

                'quiet_hours_enabled' => $this->resource->quietHoursEnabled,
                'quiet_start' => $this->resource->quietStart,
                'quiet_end' => $this->resource->quietEnd,

                'daily_summary_enabled' => $this->resource->dailySummaryEnabled,
                'daily_summary_time' => $this->resource->dailySummaryTime,

                'weekly_summary_enabled' => $this->resource->weeklySummaryEnabled,
                'weekly_summary_day' => $this->resource->weeklySummaryDay,
                'weekly_summary_time' => $this->resource->weeklySummaryTime,

                'timezone' => $this->resource->timezone,

                'recipient_phone' => $this->resource->recipientPhone,
                'can_enable_whatsapp' => $this->resource->canEnableWhatsapp,
            ],
            'preferences' => $this->resource->preferences,
        ];
    }
}
