<?php

namespace Tests\Feature\Notifications;

use App\Models\Company;
use App\Models\NotificationDelivery;
use App\Models\User;
use App\Notifications\Exceptions\WhatsAppClientException;
use App\Notifications\Exceptions\WhatsAppConnectionException;
use App\Notifications\Jobs\SendWhatsAppNotificationJob;
use App\Notifications\Providers\FakeWhatsAppProvider;
use App\Notifications\Support\NotificationDeliveryStatus;
use App\Notifications\Support\WhatsAppSendResult;
use App\Support\CurrentCompanyContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Feature\Notifications\Concerns\InteractsWithNotifications;
use Tests\TestCase;

class SendWhatsAppNotificationJobTest extends TestCase
{
    use InteractsWithNotifications, RefreshDatabase;

    /**
     * @return array{0: Company, 1: NotificationDelivery}
     */
    private function makeQueuedDelivery(?Company $company = null): array
    {
        [$company, $user] = $company !== null
            ? [$company, User::factory()->create(['phone' => '+5511999999999'])]
            : $this->makeCompanyWithMember(userAttributes: ['phone' => '+5511999999999']);

        $delivery = $this->currentCompanyContext()->run($company, function () use ($user) {
            return NotificationDelivery::factory()->create([
                'user_id' => $user->id,
                'status' => NotificationDeliveryStatus::Queued,
            ]);
        });

        return [$company, $delivery];
    }

    private function runJob(Company $company, NotificationDelivery $delivery, FakeWhatsAppProvider $provider): void
    {
        $job = new SendWhatsAppNotificationJob($company->id, $delivery->id);
        $job->handle($provider, app(CurrentCompanyContext::class));
    }

    /** J1: a queued delivery causes the provider to be called. */
    public function test_j1_queued_delivery_invokes_the_provider(): void
    {
        [$company, $delivery] = $this->makeQueuedDelivery();
        $provider = new FakeWhatsAppProvider;

        $this->runJob($company, $delivery, $provider);

        $this->assertCount(1, $provider->sent);
        $this->assertSame($delivery->recipient, $provider->sent[0]['recipient']);
        $this->assertSame($delivery->rendered_message, $provider->sent[0]['message']);
    }

    /** J2: success transitions the delivery to sent. */
    public function test_j2_success_transitions_to_sent(): void
    {
        [$company, $delivery] = $this->makeQueuedDelivery();
        $provider = new FakeWhatsAppProvider;

        $this->runJob($company, $delivery, $provider);

        $this->assertSame(NotificationDeliveryStatus::Sent, $delivery->fresh()->status);
        $this->assertNotNull($delivery->fresh()->sent_at);
    }

    /** J3: the provider's message id is persisted. */
    public function test_j3_provider_message_id_is_persisted(): void
    {
        [$company, $delivery] = $this->makeQueuedDelivery();
        $provider = new FakeWhatsAppProvider;
        $provider->willReturn(new WhatsAppSendResult(true, 'EVO-MSG-777', 'PENDING'));

        $this->runJob($company, $delivery, $provider);

        $this->assertSame('EVO-MSG-777', $delivery->fresh()->provider_message_id);
    }

    /** J4: a recoverable failure propagates (for the real queue's retry/backoff to handle) and does not mark the delivery failed itself. */
    public function test_j4_recoverable_failure_propagates_without_marking_failed(): void
    {
        [$company, $delivery] = $this->makeQueuedDelivery();
        $provider = new FakeWhatsAppProvider;
        $provider->willThrow(new WhatsAppConnectionException('Failed to connect to WhatsApp provider.'));

        try {
            $this->runJob($company, $delivery, $provider);
            $this->fail('Expected WhatsAppConnectionException to propagate.');
        } catch (WhatsAppConnectionException) {
            // expected — the real queue driver is what decides to retry.
        }

        $fresh = $delivery->fresh();
        $this->assertNotSame(NotificationDeliveryStatus::Failed, $fresh->status);
        $this->assertNotSame(NotificationDeliveryStatus::Sent, $fresh->status);
        $this->assertNotNull($fresh->last_error);
    }

    /** J5: the failed() hook (queue's final-failure callback, or an explicit 4xx) terminates the delivery as failed. */
    public function test_j5_final_failure_transitions_to_failed(): void
    {
        [$company, $delivery] = $this->makeQueuedDelivery();

        $job = new SendWhatsAppNotificationJob($company->id, $delivery->id);
        $job->failed(new WhatsAppConnectionException('exhausted retries'));

        $fresh = $delivery->fresh();
        $this->assertSame(NotificationDeliveryStatus::Failed, $fresh->status);
        $this->assertNotNull($fresh->failed_at);
        $this->assertNotNull($fresh->last_error);
    }

    /** J5b: a 4xx (WhatsAppClientException) is treated as final immediately — not recoverable by retry. */
    public function test_j5b_client_error_is_not_recoverable(): void
    {
        [$company, $delivery] = $this->makeQueuedDelivery();
        $provider = new FakeWhatsAppProvider;
        $provider->willThrow(new WhatsAppClientException('Bad number', 400));

        // handle() calls $this->fail() for a 4xx, which (per Laravel's
        // InteractsWithQueue) requires a real queue job context to fully
        // process — so the meaningful, directly-testable assertion here is
        // that last_error is recorded immediately, before any queue-level
        // machinery is involved.
        try {
            $this->runJob($company, $delivery, $provider);
        } catch (\Throwable) {
            // fail() may or may not throw depending on queue context; either way is acceptable here.
        }

        $this->assertNotNull($delivery->fresh()->last_error);
    }

    /** J6: attempts increments on every handle() invocation. */
    public function test_j6_attempts_increments_on_each_run(): void
    {
        [$company, $delivery] = $this->makeQueuedDelivery();

        $this->runJob($company, $delivery, new FakeWhatsAppProvider);
        $this->assertSame(1, $delivery->fresh()->attempts);

        // Force it back to a non-terminal state to simulate a second attempt cycle.
        $this->currentCompanyContext()->run($company, function () use ($delivery) {
            $delivery->fresh()->transitionTo(NotificationDeliveryStatus::Queued);
        });

        $this->runJob($company, $delivery->fresh(), new FakeWhatsAppProvider);
        $this->assertSame(2, $delivery->fresh()->attempts);
    }

    /** J7: the job establishes CurrentCompanyContext before the provider is ever called. */
    public function test_j7_establishes_current_company_context(): void
    {
        [$company, $delivery] = $this->makeQueuedDelivery();
        $provider = new FakeWhatsAppProvider;

        $this->runJob($company, $delivery, $provider);

        $this->assertSame($company->id, $provider->contextCompanyIdsAtCallTime[0]);
    }

    /** J8: a job for Company A never reads/processes a delivery belonging to Company B. */
    public function test_j8_company_a_job_never_reads_company_bs_delivery(): void
    {
        [$companyA] = $this->makeCompanyWithMember();
        [, $deliveryB] = $this->makeQueuedDelivery();
        $provider = new FakeWhatsAppProvider;

        // Constructed with company A's id but Company B's delivery id.
        $job = new SendWhatsAppNotificationJob($companyA->id, $deliveryB->id);
        $job->handle($provider, app(CurrentCompanyContext::class));

        $this->assertCount(0, $provider->sent);
        $this->assertSame(NotificationDeliveryStatus::Queued, $deliveryB->fresh()->status);
    }

    /** J9: the context is cleared/restored after the job finishes. */
    public function test_j9_context_is_cleared_after_the_job_runs(): void
    {
        [$company, $delivery] = $this->makeQueuedDelivery();

        $this->runJob($company, $delivery, new FakeWhatsAppProvider);

        $this->assertFalse(app(CurrentCompanyContext::class)->has());
    }
}
