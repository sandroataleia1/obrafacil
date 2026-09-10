<?php

namespace Database\Factories;

use App\Models\NotificationSetting;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<NotificationSetting>
 *
 * company_id is never set here — see NotificationEventFactory's docblock.
 */
class NotificationSettingFactory extends Factory
{
    protected $model = NotificationSetting::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'whatsapp_enabled' => false,
            'quiet_hours_enabled' => true,
            'quiet_start' => '21:00',
            'quiet_end' => '07:00',
            'daily_summary_enabled' => false,
            'daily_summary_time' => null,
        ];
    }

    public function whatsappEnabled(): static
    {
        return $this->state(['whatsapp_enabled' => true]);
    }

    public function quietHoursDisabled(): static
    {
        return $this->state(['quiet_hours_enabled' => false]);
    }
}
