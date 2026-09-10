<?php

namespace Tests\Feature\Notifications;

use App\Models\NotificationDelivery;
use App\Notifications\Support\NotificationDeliveryStatus;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Feature\Notifications\Concerns\InteractsWithNotifications;
use Tests\TestCase;

class EvolutionWebhookTest extends TestCase
{
    use InteractsWithNotifications, RefreshDatabase;

    private const WEBHOOK_SECRET = 'test-webhook-secret-fixture';

    protected function setUp(): void
    {
        parent::setUp();

        config(['evolution.webhook_secret' => self::WEBHOOK_SECRET]);
    }

    private function makeSentDelivery(): NotificationDelivery
    {
        [$company, $user] = $this->makeCompanyWithMember(userAttributes: ['phone' => '+5511999999999']);

        return $this->currentCompanyContext()->run($company, function () use ($user) {
            return NotificationDelivery::factory()->create([
                'user_id' => $user->id,
                'status' => NotificationDeliveryStatus::Sent,
                'provider_message_id' => 'EVO-KNOWN-ID',
                'sent_at' => now(),
            ]);
        });
    }

    private function callWebhook(array $payload, ?string $secret = self::WEBHOOK_SECRET)
    {
        $headers = $secret !== null ? ['X-ObraFacil-Webhook-Secret' => $secret] : [];

        return $this->postJson('/api/v1/webhooks/evolution', $payload, $headers);
    }

    /** W1: no secret header -> rejected. */
    public function test_w1_missing_secret_is_rejected(): void
    {
        $this->callWebhook(['data' => ['key' => ['id' => 'X'], 'status' => 'DELIVERY_ACK']], secret: null)
            ->assertStatus(401);
    }

    /** W2: wrong secret -> rejected. */
    public function test_w2_wrong_secret_is_rejected(): void
    {
        $this->callWebhook(['data' => ['key' => ['id' => 'X'], 'status' => 'DELIVERY_ACK']], secret: 'not-the-real-secret')
            ->assertStatus(401);
    }

    /** W3: correct secret -> accepted. */
    public function test_w3_correct_secret_is_accepted(): void
    {
        $delivery = $this->makeSentDelivery();

        $this->callWebhook([
            'event' => 'MESSAGES_UPDATE',
            'data' => ['key' => ['id' => $delivery->provider_message_id], 'status' => 'DELIVERY_ACK'],
        ])->assertOk();
    }

    /** W4: a known provider_message_id updates the delivery's status. */
    public function test_w4_known_message_id_updates_status(): void
    {
        $delivery = $this->makeSentDelivery();

        $this->callWebhook([
            'data' => ['key' => ['id' => $delivery->provider_message_id], 'status' => 'DELIVERY_ACK'],
        ])->assertOk();

        $fresh = $delivery->fresh();
        $this->assertSame(NotificationDeliveryStatus::Delivered, $fresh->status);
        $this->assertNotNull($fresh->delivered_at);
    }

    /** W5: the exact same callback delivered twice stays idempotent. */
    public function test_w5_duplicate_callback_is_idempotent(): void
    {
        $delivery = $this->makeSentDelivery();
        $payload = ['data' => ['key' => ['id' => $delivery->provider_message_id], 'status' => 'DELIVERY_ACK']];

        $this->callWebhook($payload)->assertOk();
        $this->callWebhook($payload)->assertOk();

        $fresh = $delivery->fresh();
        $this->assertSame(NotificationDeliveryStatus::Delivered, $fresh->status);
    }

    /** W6: a status that arrives out of order/late never regresses the delivery. */
    public function test_w6_late_status_does_not_regress_state(): void
    {
        $delivery = $this->makeSentDelivery();

        // Delivery jumps straight to "read" first...
        $this->callWebhook([
            'data' => ['key' => ['id' => $delivery->provider_message_id], 'status' => 'READ'],
        ])->assertOk();
        $this->assertSame(NotificationDeliveryStatus::Read, $delivery->fresh()->status);

        // ...then a late "delivered" (server_ack-level) callback for the
        // same message arrives. It must not move the delivery backward.
        $this->callWebhook([
            'data' => ['key' => ['id' => $delivery->provider_message_id], 'status' => 'DELIVERY_ACK'],
        ])->assertOk();
        $this->assertSame(NotificationDeliveryStatus::Read, $delivery->fresh()->status);
    }

    /** W7: an unknown provider_message_id is a controlled response, never an error. */
    public function test_w7_unknown_message_id_is_controlled(): void
    {
        $this->callWebhook([
            'data' => ['key' => ['id' => 'NEVER-SEEN-BEFORE'], 'status' => 'DELIVERY_ACK'],
        ])->assertStatus(200);
    }

    /** W8: an empty/malformed payload is a controlled 4xx, never a raw exception. */
    public function test_w8_invalid_payload_is_controlled(): void
    {
        $this->callWebhook([])->assertStatus(422);
    }
}
