<?php

namespace Database\Factories;

use App\Models\NotificationPreference;
use App\Models\User;
use App\Notifications\Support\NotificationChannel;
use App\Notifications\Support\NotificationEventType;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<NotificationPreference>
 *
 * company_id is never set here — see NotificationEventFactory's docblock.
 */
class NotificationPreferenceFactory extends Factory
{
    protected $model = NotificationPreference::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'event_type' => NotificationEventType::SystemTest,
            'channel' => NotificationChannel::WhatsApp,
            'enabled' => true,
        ];
    }

    public function disabled(): static
    {
        return $this->state(['enabled' => false]);
    }
}
