<?php

namespace Tests\Feature\MultiTenant;

use App\Models\Company;
use App\Support\CurrentCompanyContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use RuntimeException;
use Tests\Fixtures\FixtureWidget;
use Tests\TestCase;

class CompanyScopeTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->artisan('migrate', [
            '--path' => 'tests/Fixtures/migrations',
            '--realpath' => false,
        ]);
    }

    /** T7: Without a CurrentCompanyContext, a tenant-scoped query fails explicitly instead of returning everything. */
    public function test_query_without_context_throws(): void
    {
        $this->expectException(RuntimeException::class);

        FixtureWidget::query()->get();
    }

    /** T8: company_id cannot be spoofed during create, even if passed explicitly. */
    public function test_company_id_cannot_be_spoofed_on_create(): void
    {
        $companyA = Company::factory()->create();
        $companyB = Company::factory()->create();

        $context = app(CurrentCompanyContext::class);

        $widget = $context->run($companyA, function () use ($companyB) {
            return FixtureWidget::create([
                'name' => 'Spoofed',
                'company_id' => $companyB->id,
            ]);
        });

        $this->assertSame($companyA->id, $widget->fresh()?->company_id ?? $widget->company_id);
        $this->assertNotSame($companyB->id, $widget->company_id);
    }

    /** T5 + T6: Company A's context returns only A's data; Company B's rows never appear in it. */
    public function test_context_scopes_query_to_the_active_company_only(): void
    {
        $companyA = Company::factory()->create();
        $companyB = Company::factory()->create();

        $context = app(CurrentCompanyContext::class);

        $context->run($companyA, function () {
            FixtureWidget::create(['name' => 'A-1']);
            FixtureWidget::create(['name' => 'A-2']);
        });

        $context->run($companyB, function () {
            FixtureWidget::create(['name' => 'B-1']);
        });

        $namesForA = $context->run($companyA, fn () => FixtureWidget::query()->pluck('name')->sort()->values()->all());

        $this->assertSame(['A-1', 'A-2'], $namesForA);
    }

    /** T9: Explicit run() usage (the required entry point for console/tests/jobs) works. */
    public function test_run_sets_and_restores_previous_context(): void
    {
        $companyA = Company::factory()->create();
        $companyB = Company::factory()->create();

        $context = app(CurrentCompanyContext::class);

        $context->run($companyA, function () use ($context, $companyA, $companyB) {
            $this->assertSame($companyA->id, $context->id());

            $context->run($companyB, function () use ($context, $companyB) {
                $this->assertSame($companyB->id, $context->id());
            });

            $this->assertSame($companyA->id, $context->id());
        });

        $this->assertFalse($context->has());
    }

    /** T10: Switching context from A to B returns B's corresponding set, not A's. */
    public function test_switching_context_from_a_to_b_returns_bs_data(): void
    {
        $companyA = Company::factory()->create();
        $companyB = Company::factory()->create();

        $context = app(CurrentCompanyContext::class);

        $context->run($companyA, fn () => FixtureWidget::create(['name' => 'A-only']));
        $context->run($companyB, fn () => FixtureWidget::create(['name' => 'B-only']));

        $seenByA = $context->run($companyA, fn () => FixtureWidget::query()->pluck('name')->all());
        $seenByB = $context->run($companyB, fn () => FixtureWidget::query()->pluck('name')->all());

        $this->assertSame(['A-only'], $seenByA);
        $this->assertSame(['B-only'], $seenByB);
    }

    /** run() restores the previous company even when the callback throws. */
    public function test_run_restores_previous_context_after_exception(): void
    {
        $companyA = Company::factory()->create();
        $companyB = Company::factory()->create();

        $context = app(CurrentCompanyContext::class);

        $context->run($companyA, function () use ($context, $companyA, $companyB): void {
            try {
                $context->run($companyB, function (): void {
                    throw new RuntimeException('boom');
                });
                $this->fail('Expected exception was not thrown.');
            } catch (RuntimeException $e) {
                $this->assertSame('boom', $e->getMessage());
            }

            $this->assertSame($companyA->id, $context->id());
        });

        $this->assertFalse($context->has());
    }

    /** run() restores "no context" (not some stale company) when there was nothing set before it. */
    public function test_run_restores_empty_context_after_exception_with_no_prior_company(): void
    {
        $companyA = Company::factory()->create();

        $context = app(CurrentCompanyContext::class);
        $context->clear();

        try {
            $context->run($companyA, function (): void {
                throw new RuntimeException('boom');
            });
            $this->fail('Expected exception was not thrown.');
        } catch (RuntimeException) {
            // expected
        }

        $this->assertFalse($context->has());
    }
}
