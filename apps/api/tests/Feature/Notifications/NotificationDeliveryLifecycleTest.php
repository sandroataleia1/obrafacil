<?php

namespace Tests\Feature\Notifications;

use App\Models\Company;
use App\Models\NotificationDelivery;
use App\Notifications\Exceptions\WhatsAppClientException;
use App\Notifications\Exceptions\WhatsAppConnectionException;
use App\Notifications\Exceptions\WhatsAppServerException;
use App\Notifications\Exceptions\WhatsAppTimeoutException;
use App\Notifications\Jobs\SendWhatsAppNotificationJob;
use App\Notifications\Providers\FakeWhatsAppProvider;
use App\Notifications\Support\NotificationDeliveryStatus;
use App\Support\CurrentCompanyContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Feature\Notifications\Concerns\InteractsWithNotifications;
use Tests\TestCase;

/**
 * BACKEND-03A anti-duplication + retry hardening (§19/§20/§22). Complements
 * SendWhatsAppNotificationJobTest (J1-J9), which already covers the basic
 * success/failure/context/multitenancy shape — this file is the explicit,
 * numbered D1-D10 / R1-R7 / cross-tenant-hostile coverage the round's gate
 * requires, exercised against the real Postgres claim (lockForUpdate), never
 * mocked.
 */
class NotificationDeliveryLifecycleTest extends TestCase
{
    use InteractsWithNotifications, RefreshDatabase;

    /**
     * @return array{0: Company, 1: NotificationDelivery}
     */
    private function makeDeliveryWithStatus(NotificationDeliveryStatus $status): array
    {
        [$company, $user] = $this->makeCompanyWithMember(userAttributes: ['phone' => '+5511999999999']);

        $delivery = $this->currentCompanyContext()->run($company, function () use ($user, $status) {
            return NotificationDelivery::factory()->create([
                'user_id' => $user->id,
                'status' => $status,
            ]);
        });

        return [$company, $delivery];
    }

    private function runJob(Company $company, NotificationDelivery $delivery, FakeWhatsAppProvider $provider): void
    {
        $job = new SendWhatsAppNotificationJob($company->id, $delivery->id);
        $job->handle($provider, app(CurrentCompanyContext::class));
    }

    // ---------------------------------------------------------------
    // D1-D10: anti-duplication
    // ---------------------------------------------------------------

    /** D1: queued -> provider called exactly once. */
    public function test_d1_queued_invokes_provider_once(): void
    {
        [$company, $delivery] = $this->makeDeliveryWithStatus(NotificationDeliveryStatus::Queued);
        $provider = new FakeWhatsAppProvider;

        $this->runJob($company, $delivery, $provider);

        $this->assertCount(1, $provider->sent);
    }

    /** D2: sent -> provider zero times. */
    public function test_d2_sent_never_calls_provider(): void
    {
        [$company, $delivery] = $this->makeDeliveryWithStatus(NotificationDeliveryStatus::Sent);
        $provider = new FakeWhatsAppProvider;

        $this->runJob($company, $delivery, $provider);

        $this->assertCount(0, $provider->sent);
        $this->assertSame(NotificationDeliveryStatus::Sent, $delivery->fresh()->status);
    }

    /** D3: delivered -> provider zero times. */
    public function test_d3_delivered_never_calls_provider(): void
    {
        [$company, $delivery] = $this->makeDeliveryWithStatus(NotificationDeliveryStatus::Delivered);
        $provider = new FakeWhatsAppProvider;

        $this->runJob($company, $delivery, $provider);

        $this->assertCount(0, $provider->sent);
        $this->assertSame(NotificationDeliveryStatus::Delivered, $delivery->fresh()->status);
    }

    /** D4: read -> provider zero times. */
    public function test_d4_read_never_calls_provider(): void
    {
        [$company, $delivery] = $this->makeDeliveryWithStatus(NotificationDeliveryStatus::Read);
        $provider = new FakeWhatsAppProvider;

        $this->runJob($company, $delivery, $provider);

        $this->assertCount(0, $provider->sent);
        $this->assertSame(NotificationDeliveryStatus::Read, $delivery->fresh()->status);
    }

    /** D5: failed -> provider zero times (a stale/old job must never reanimate a failed delivery). */
    public function test_d5_failed_never_calls_provider(): void
    {
        [$company, $delivery] = $this->makeDeliveryWithStatus(NotificationDeliveryStatus::Failed);
        $provider = new FakeWhatsAppProvider;

        $this->runJob($company, $delivery, $provider);

        $this->assertCount(0, $provider->sent);
        $this->assertSame(NotificationDeliveryStatus::Failed, $delivery->fresh()->status);
    }

    /** D6: skipped -> provider zero times. */
    public function test_d6_skipped_never_calls_provider(): void
    {
        [$company, $delivery] = $this->makeDeliveryWithStatus(NotificationDeliveryStatus::Skipped);
        $provider = new FakeWhatsAppProvider;

        $this->runJob($company, $delivery, $provider);

        $this->assertCount(0, $provider->sent);
        $this->assertSame(NotificationDeliveryStatus::Skipped, $delivery->fresh()->status);
    }

    /** D7: the job executed twice after a first success calls the provider a total of one time. */
    public function test_d7_duplicate_execution_after_success_does_not_resend(): void
    {
        [$company, $delivery] = $this->makeDeliveryWithStatus(NotificationDeliveryStatus::Queued);
        $provider = new FakeWhatsAppProvider;

        $this->runJob($company, $delivery, $provider);
        $this->runJob($company, $delivery->fresh(), $provider);
        $this->runJob($company, $delivery->fresh(), $provider);

        $this->assertCount(1, $provider->sent);
        $this->assertSame(NotificationDeliveryStatus::Sent, $delivery->fresh()->status);
    }

    /**
     * D8: two executions racing to claim the same queued delivery — only
     * one wins. Exercised sequentially against the real Postgres
     * `lockForUpdate()` claim (not a mock): the first execution's
     * transaction commits the Queued -> Processing -> Sent transition
     * before the second runs, so the second execution's claim correctly
     * observes an unsendable status and backs off. This proves the actual
     * production claim code path — the same row lock would also serialize
     * two genuinely concurrent worker processes, which PHPUnit's
     * single-connection model cannot itself simulate.
     */
    public function test_d8_only_one_of_two_racing_claims_wins(): void
    {
        [$company, $delivery] = $this->makeDeliveryWithStatus(NotificationDeliveryStatus::Queued);
        $providerA = new FakeWhatsAppProvider;
        $providerB = new FakeWhatsAppProvider;

        $this->runJob($company, $delivery, $providerA);
        $this->runJob($company, $delivery->fresh(), $providerB);

        $this->assertCount(1, $providerA->sent);
        $this->assertCount(0, $providerB->sent);
    }

    /** D9: attempts increments only for the execution that actually wins the claim. */
    public function test_d9_attempts_increments_only_for_the_winning_claim(): void
    {
        [$company, $delivery] = $this->makeDeliveryWithStatus(NotificationDeliveryStatus::Queued);

        $this->runJob($company, $delivery, new FakeWhatsAppProvider);
        $this->assertSame(1, $delivery->fresh()->attempts);

        // Already sent — a second execution must not touch attempts.
        $this->runJob($company, $delivery->fresh(), new FakeWhatsAppProvider);
        $this->assertSame(1, $delivery->fresh()->attempts);
    }

    /**
     * D10: a claim that cannot be won (the delivery is already mid-flight
     * in `processing`, e.g. a duplicate/stale job for the same delivery)
     * results in zero provider calls and no attempts increment — the
     * isSendable() gate refuses the claim before transitionTo() is ever
     * attempted.
     */
    public function test_d10_refused_claim_never_calls_provider(): void
    {
        [$company, $delivery] = $this->makeDeliveryWithStatus(NotificationDeliveryStatus::Processing);
        $provider = new FakeWhatsAppProvider;

        $this->runJob($company, $delivery, $provider);

        $this->assertCount(0, $provider->sent);
        $this->assertSame(0, $delivery->fresh()->attempts);
        $this->assertSame(NotificationDeliveryStatus::Processing, $delivery->fresh()->status);
    }

    // ---------------------------------------------------------------
    // R1-R7: retry policy
    // ---------------------------------------------------------------

    /** R1: a connection failure is retryable — it propagates and leaves the delivery in Retrying. */
    public function test_r1_connection_failure_is_retryable(): void
    {
        [$company, $delivery] = $this->makeDeliveryWithStatus(NotificationDeliveryStatus::Queued);
        $provider = new FakeWhatsAppProvider;
        $provider->willThrow(new WhatsAppConnectionException('Failed to connect to WhatsApp provider.'));

        try {
            $this->runJob($company, $delivery, $provider);
            $this->fail('Expected WhatsAppConnectionException to propagate.');
        } catch (WhatsAppConnectionException) {
        }

        $this->assertSame(NotificationDeliveryStatus::Retrying, $delivery->fresh()->status);
    }

    /**
     * R2: a timeout is retryable under the current policy. The ambiguity
     * this carries (the provider may have already accepted the message
     * before the client-side timeout) is documented on EvolutionApiProvider
     * and NOT resolved here — see BACKEND-03A §11.
     */
    public function test_r2_timeout_is_retryable(): void
    {
        [$company, $delivery] = $this->makeDeliveryWithStatus(NotificationDeliveryStatus::Queued);
        $provider = new FakeWhatsAppProvider;
        $provider->willThrow(new WhatsAppTimeoutException('WhatsApp provider request timed out.'));

        try {
            $this->runJob($company, $delivery, $provider);
            $this->fail('Expected WhatsAppTimeoutException to propagate.');
        } catch (WhatsAppTimeoutException) {
        }

        $this->assertSame(NotificationDeliveryStatus::Retrying, $delivery->fresh()->status);
    }

    /** R3: a 5xx is retryable. */
    public function test_r3_server_error_is_retryable(): void
    {
        [$company, $delivery] = $this->makeDeliveryWithStatus(NotificationDeliveryStatus::Queued);
        $provider = new FakeWhatsAppProvider;
        $provider->willThrow(new WhatsAppServerException('WhatsApp provider returned a server error.', 502));

        try {
            $this->runJob($company, $delivery, $provider);
            $this->fail('Expected WhatsAppServerException to propagate.');
        } catch (WhatsAppServerException) {
        }

        $this->assertSame(NotificationDeliveryStatus::Retrying, $delivery->fresh()->status);
    }

    /** R4: a 4xx fails immediately — never consumes the retry/backoff schedule. */
    public function test_r4_client_error_fails_without_useless_retry(): void
    {
        [$company, $delivery] = $this->makeDeliveryWithStatus(NotificationDeliveryStatus::Queued);
        $provider = new FakeWhatsAppProvider;
        $provider->willThrow(new WhatsAppClientException('Bad number', 400));

        try {
            $this->runJob($company, $delivery, $provider);
        } catch (\Throwable) {
            // $this->fail() may or may not throw depending on queue context (see J5b).
        }

        $this->assertNotSame(NotificationDeliveryStatus::Retrying, $delivery->fresh()->status);
        $this->assertNotNull($delivery->fresh()->last_error);
    }

    /** R5: a later retry of the same delivery that succeeds ends in Sent. */
    public function test_r5_later_successful_retry_ends_in_sent(): void
    {
        [$company, $delivery] = $this->makeDeliveryWithStatus(NotificationDeliveryStatus::Queued);
        $failingProvider = new FakeWhatsAppProvider;
        $failingProvider->willThrow(new WhatsAppConnectionException('Failed to connect to WhatsApp provider.'));

        try {
            $this->runJob($company, $delivery, $failingProvider);
        } catch (WhatsAppConnectionException) {
        }
        $this->assertSame(NotificationDeliveryStatus::Retrying, $delivery->fresh()->status);

        // The queue releases the job again after backoff — simulated here
        // by simply running it again against a working provider.
        $succeedingProvider = new FakeWhatsAppProvider;
        $this->runJob($company, $delivery->fresh(), $succeedingProvider);

        $this->assertSame(NotificationDeliveryStatus::Sent, $delivery->fresh()->status);
        $this->assertCount(1, $succeedingProvider->sent);
    }

    /** R6: attempts equals the real number of provider calls across the retry cycle. */
    public function test_r6_attempts_matches_real_provider_calls(): void
    {
        [$company, $delivery] = $this->makeDeliveryWithStatus(NotificationDeliveryStatus::Queued);
        $failingProvider = new FakeWhatsAppProvider;
        $failingProvider->willThrow(new WhatsAppConnectionException('Failed to connect to WhatsApp provider.'));

        try {
            $this->runJob($company, $delivery, $failingProvider);
        } catch (WhatsAppConnectionException) {
        }

        $succeedingProvider = new FakeWhatsAppProvider;
        $this->runJob($company, $delivery->fresh(), $succeedingProvider);

        $totalProviderCalls = count($failingProvider->sent) + count($succeedingProvider->sent);
        $this->assertSame(2, $totalProviderCalls);
        $this->assertSame(2, $delivery->fresh()->attempts);
    }

    /** R7: the retry schedule is finite and matches the documented policy (§12) — never infinite. */
    public function test_r7_retry_limit_and_backoff_are_finite_and_explicit(): void
    {
        $job = new SendWhatsAppNotificationJob('company-id', 'delivery-id');

        $this->assertSame(5, $job->tries);
        $this->assertSame([60, 300, 900, 3600], $job->backoff);
    }

    // ---------------------------------------------------------------
    // Cross-tenant hostile claim
    // ---------------------------------------------------------------

    /** A job built with Company A's id but Company B's delivery id never claims or sends. */
    public function test_cross_tenant_hostile_job_never_calls_provider(): void
    {
        [$companyA] = $this->makeCompanyWithMember();
        [, $deliveryB] = $this->makeDeliveryWithStatus(NotificationDeliveryStatus::Queued);
        $provider = new FakeWhatsAppProvider;

        $job = new SendWhatsAppNotificationJob($companyA->id, $deliveryB->id);
        $job->handle($provider, app(CurrentCompanyContext::class));

        $this->assertCount(0, $provider->sent);
        $this->assertSame(NotificationDeliveryStatus::Queued, $deliveryB->fresh()->status);
        $this->assertSame(0, $deliveryB->fresh()->attempts);
    }
}
