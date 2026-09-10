<?php

namespace Database\Factories;

use App\Models\NotificationDelivery;
use App\Models\NotificationEvent;
use App\Notifications\Support\NotificationChannel;
use App\Notifications\Support\NotificationDeliveryStatus;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<NotificationDelivery>
 *
 * company_id is never set here — see NotificationEventFactory's docblock.
 */
class NotificationDeliveryFactory extends Factory
{
    protected $model = NotificationDelivery::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'notification_event_id' => NotificationEvent::factory(),
            'user_id' => null,
            'channel' => NotificationChannel::WhatsApp,
            'provider' => 'evolution',
            'recipient' => '+5511999999999',
            'rendered_message' => 'ObraFácil — mensagem de teste',
            'status' => NotificationDeliveryStatus::Queued,
            'idempotency_key' => 'test:'.fake()->uuid(),
            'attempts' => 0,
            'queued_at' => now(),
        ];
    }
}
