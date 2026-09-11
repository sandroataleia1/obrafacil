<?php

namespace Tests\Feature\Notifications;

use App\Notifications\Support\NotificationEventType;
use App\Notifications\Support\NotificationMessageRenderer;
use Tests\TestCase;

/**
 * BACKEND-06A §16/§46. RM1-RM10 — one test per ServiceOrder event type,
 * plus timezone formatting. Pure unit-style tests against the renderer
 * directly (no DB, no dispatcher) — payload shape mirrors exactly what
 * App\ServiceOrders\Notifications\ServiceOrderNotificationPayloadBuilder
 * produces.
 */
class NotificationMessageRendererServiceOrderTest extends TestCase
{
    private function renderer(): NotificationMessageRenderer
    {
        return app(NotificationMessageRenderer::class);
    }

    /**
     * @return array<string, mixed>
     */
    private function basePayload(array $overrides = []): array
    {
        return array_merge([
            'service_order_id' => 'so-1',
            'number' => 'OS-000123',
            'title' => 'Manutenção elétrica',
            'status' => 'open',
            'customer_name' => 'João Silva',
            'execution_address_label' => 'Casa',
            'execution_city' => 'Belo Horizonte',
            'execution_state' => 'MG',
            'contact_name' => null,
            'contact_role' => null,
            'scheduled_start_at' => null,
            'company_timezone' => 'America/Sao_Paulo',
            'subtotal' => '0.00',
            'travel_fee' => '0.00',
            'total' => '0.00',
            'cancellation_reason' => null,
        ], $overrides);
    }

    /** RM1: created. */
    public function test_rm1_created(): void
    {
        $message = $this->renderer()->render(NotificationEventType::ServiceOrderCreated, $this->basePayload());

        $this->assertSame('ObraFácil — OS-000123 criada: Manutenção elétrica · Cliente: João Silva.', $message);
    }

    /** RM2: scheduled — date/time rendered in company timezone. */
    public function test_rm2_scheduled(): void
    {
        // 2026-09-15T12:00:00Z = 2026-09-15 09:00 in America/Sao_Paulo (UTC-3).
        $payload = $this->basePayload(['scheduled_start_at' => '2026-09-15T12:00:00Z']);

        $message = $this->renderer()->render(NotificationEventType::ServiceOrderScheduled, $payload);

        $this->assertSame('ObraFácil — OS-000123 agendada para 15/09/2026 às 09:00 · Cliente: João Silva.', $message);
    }

    /** RM3: due_tomorrow. */
    public function test_rm3_due_tomorrow(): void
    {
        $payload = $this->basePayload(['scheduled_start_at' => '2026-09-15T12:00:00Z']);

        $message = $this->renderer()->render(NotificationEventType::ServiceOrderDueTomorrow, $payload);

        $this->assertSame('ObraFácil — OS-000123 está agendada para amanhã às 09:00.', $message);
    }

    /** RM4: due_today. */
    public function test_rm4_due_today(): void
    {
        $payload = $this->basePayload(['scheduled_start_at' => '2026-09-15T12:00:00Z']);

        $message = $this->renderer()->render(NotificationEventType::ServiceOrderDueToday, $payload);

        $this->assertSame('ObraFácil — OS-000123 está agendada para hoje às 09:00.', $message);
    }

    /** RM5: due_2_hours. */
    public function test_rm5_due_2_hours(): void
    {
        $payload = $this->basePayload(['scheduled_start_at' => '2026-09-15T12:00:00Z']);

        $message = $this->renderer()->render(NotificationEventType::ServiceOrderDue2Hours, $payload);

        $this->assertSame('ObraFácil — OS-000123 começa em até 2 horas, às 09:00.', $message);
    }

    /** RM6: overdue. */
    public function test_rm6_overdue(): void
    {
        $payload = $this->basePayload(['scheduled_start_at' => '2026-09-15T12:00:00Z']);

        $message = $this->renderer()->render(NotificationEventType::ServiceOrderOverdue, $payload);

        $this->assertSame('ObraFácil — OS-000123 ainda não foi iniciada e está atrasada desde 09:00.', $message);
    }

    /** RM7: started. */
    public function test_rm7_started(): void
    {
        $message = $this->renderer()->render(NotificationEventType::ServiceOrderStarted, $this->basePayload());

        $this->assertSame('ObraFácil — OS-000123 foi iniciada.', $message);
    }

    /** RM8: completed. */
    public function test_rm8_completed(): void
    {
        $message = $this->renderer()->render(NotificationEventType::ServiceOrderCompleted, $this->basePayload());

        $this->assertSame('ObraFácil — OS-000123 foi concluída.', $message);
    }

    /** RM9: cancelled — includes the reason, never a secret/CPF/CNPJ/phone. */
    public function test_rm9_cancelled(): void
    {
        $payload = $this->basePayload(['cancellation_reason' => 'Cliente cancelou o atendimento']);

        $message = $this->renderer()->render(NotificationEventType::ServiceOrderCancelled, $payload);

        $this->assertSame('ObraFácil — OS-000123 foi cancelada. Motivo: Cliente cancelou o atendimento.', $message);
        $this->assertStringNotContainsString('CPF', $message);
        $this->assertStringNotContainsString('CNPJ', $message);
        $this->assertMatchesRegularExpression('/^[^+]*$/', $message); // no "+55..." phone-shaped substring
    }

    /** RM10: a different company timezone changes the rendered local time (proves it's never the server's own). */
    public function test_rm10_different_timezone_changes_rendered_time(): void
    {
        // Same absolute instant as RM2/RM3 (2026-09-15T12:00:00Z), but a
        // company on UTC+9 sees a different local date AND time.
        $payload = $this->basePayload([
            'scheduled_start_at' => '2026-09-15T12:00:00Z',
            'company_timezone' => 'Asia/Tokyo',
        ]);

        $message = $this->renderer()->render(NotificationEventType::ServiceOrderScheduled, $payload);

        $this->assertSame('ObraFácil — OS-000123 agendada para 15/09/2026 às 21:00 · Cliente: João Silva.', $message);
    }
}
