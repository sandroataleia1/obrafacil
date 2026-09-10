<?php

namespace Database\Factories;

use App\Models\NotificationEvent;
use App\Notifications\Support\NotificationEventType;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<NotificationEvent>
 *
 * company_id is never set here — App\Models\Concerns\BelongsToCompany
 * forces it from the active CurrentCompanyContext on every create(), so
 * tests must wrap usage in CurrentCompanyContext::run($company, ...).
 */
class NotificationEventFactory extends Factory
{
    protected $model = NotificationEvent::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'type' => NotificationEventType::SystemTest,
            'entity_type' => null,
            'entity_id' => null,
            'payload' => [],
            'deduplication_key' => 'test:'.fake()->uuid(),
            'occurred_at' => now(),
        ];
    }
}
