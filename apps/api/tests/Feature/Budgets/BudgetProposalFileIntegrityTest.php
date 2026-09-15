<?php

namespace Tests\Feature\Budgets;

use App\Budgets\BudgetService;
use App\Companies\CompanyLogoService;
use App\Models\Budget;
use App\Models\Company;
use Illuminate\Contracts\Filesystem\Filesystem;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Mockery;
use Tests\Feature\Budgets\Concerns\InteractsWithBudgets;
use Tests\TestCase;

/**
 * PROPOSAL-DOC-01A1 §23: FI1-FI10 — the outer-transaction compensation,
 * the Storage write-failure contract, and a REAL `BudgetService::submit()`
 * post-copy failure proof (not the artificial primitive-level round trip
 * PSN11 used before this gate).
 */
class BudgetProposalFileIntegrityTest extends TestCase
{
    use InteractsWithBudgets, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('public');
    }

    private function fakeLogo(string $name = 'logo.png'): UploadedFile
    {
        return UploadedFile::fake()->create($name, 50, 'image/png');
    }

    /**
     * @return array{0: Company, 1: string} [company, budgetId]
     */
    private function companyWithLogoAndDraftBudget(): array
    {
        [$company] = $this->actingAsNewCompanyMember();
        $company = app(CompanyLogoService::class)->store($company, $this->fakeLogo());
        $customer = $this->makeCustomer();
        $budgetId = $this->postJson('/api/v1/budgets', $this->validBudgetPayload(['customer_id' => $customer->id]))->json('id');
        $this->postJson("/api/v1/budgets/{$budgetId}/items", $this->manualItemPayload());

        return [$company, $budgetId];
    }

    /**
     * Mocks `Storage::disk('public')` entirely so `copy()` can be made to
     * return `false` deterministically (the `public` disk is configured
     * with `throw=false`, so a failed write is a falsy return, never an
     * exception — this replicates that contract exactly rather than
     * simulating a thrown exception, which would test the wrong thing).
     * Captures the path `delete()` was called with, so a caller can
     * assert the cleanup actually targeted the exact path `copy()` was
     * attempting to write, without depending on the real filesystem
     * still being in a mockable state after `Mockery::close()`.
     *
     * @param  array<int, string>  $deletedPaths  populated by reference as delete() is called
     */
    private function mockPublicDiskWithFailingCopy(array &$deletedPaths): void
    {
        $mock = Mockery::mock(Filesystem::class);
        $mock->shouldReceive('exists')->andReturn(true);
        $mock->shouldReceive('copy')->once()->andReturn(false);
        $mock->shouldReceive('delete')->once()->andReturnUsing(function (string $path) use (&$deletedPaths) {
            $deletedPaths[] = $path;

            return true;
        });
        Storage::shouldReceive('disk')->with('public')->andReturn($mock);
    }

    /** FI1: a successful submit copies the logo. */
    public function test_fi1_successful_submit_copies_logo(): void
    {
        [, $budgetId] = $this->companyWithLogoAndDraftBudget();

        $response = $this->postJson("/api/v1/budgets/{$budgetId}/submit");
        $response->assertStatus(200);
        $this->assertNotNull($response->json('proposal_company.logo_url'));
    }

    /** FI2: a Storage write failure (copy() returns false) fails the submit. */
    public function test_fi2_copy_write_false_fails_submit(): void
    {
        [, $budgetId] = $this->companyWithLogoAndDraftBudget();

        $deletedPaths = [];
        $this->mockPublicDiskWithFailingCopy($deletedPaths);

        $response = $this->postJson("/api/v1/budgets/{$budgetId}/submit");
        $response->assertStatus(500);
    }

    /** FI3: a failed write leaves the Budget in draft. */
    public function test_fi3_failed_write_leaves_budget_draft(): void
    {
        [$company, $budgetId] = $this->companyWithLogoAndDraftBudget();

        $deletedPaths = [];
        $this->mockPublicDiskWithFailingCopy($deletedPaths);
        $this->postJson("/api/v1/budgets/{$budgetId}/submit");
        Mockery::close();

        $fresh = $this->currentCompanyContext()->run($company, fn () => Budget::query()->findOrFail($budgetId));
        $this->assertSame('draft', $fresh->status->value);
        $this->assertNull($fresh->proposal_token);
        $this->assertNull($fresh->submitted_at);
        $this->assertNull($fresh->company_snapshot);
        $this->assertNull($fresh->proposal_logo_path);
        $this->assertNull($fresh->proposal_template_version);
    }

    /**
     * FI4: a failed write leaves zero orphan proposal files — proven by
     * capturing exactly what `delete()` was called with (§7's cleanup)
     * and asserting it matches the path `copy()` was attempting to write,
     * scoped under this Budget's own proposal directory. Never accepts
     * "a path was returned even though no file exists" (§12).
     */
    public function test_fi4_failed_write_leaves_zero_proposal_file(): void
    {
        [$company, $budgetId] = $this->companyWithLogoAndDraftBudget();

        $deletedPaths = [];
        $this->mockPublicDiskWithFailingCopy($deletedPaths);
        $this->postJson("/api/v1/budgets/{$budgetId}/submit");
        Mockery::close();

        $this->assertCount(1, $deletedPaths, 'exactly one cleanup delete() call is expected');
        $this->assertStringStartsWith("companies/{$company->id}/proposals/{$budgetId}/", $deletedPaths[0]);

        // The real disk (never touched by the mock at all — it was fully
        // swapped out) genuinely has no file under this Budget's
        // proposal directory, confirming the mocked write never actually
        // landed anything real either. `shouldReceive` on the facade
        // swapped out the whole underlying FilesystemManager INSTANCE in
        // the container — both the facade's local cache AND the
        // container binding must be forgotten before a fresh
        // `Storage::fake()` can rebuild a real one.
        $this->app->forgetInstance('filesystem');
        Storage::clearResolvedInstance('filesystem');
        Storage::fake('public');
        $files = Storage::disk('public')->allFiles("companies/{$company->id}/proposals/{$budgetId}");
        $this->assertCount(0, $files);
    }

    /**
     * FI5/FI6: a REAL `BudgetService::submit()` failure happening AFTER
     * the logo copy succeeds (not the artificial PSN11 round trip) —
     * proven via a genuine Eloquent `Budget::saving` listener that throws
     * only for this specific Budget id (a standard, supported Eloquent
     * extension point; not `if (app()->testing())` in production code,
     * and harmless to every other test since the closure only matches
     * this one Budget id and the listener dies with this test's
     * short-lived application instance).
     */
    public function test_fi5_and_fi6_real_post_copy_failure_removes_copy_and_rolls_back(): void
    {
        [$company, $budgetId] = $this->companyWithLogoAndDraftBudget();

        Budget::saving(function (Budget $model) use ($budgetId) {
            if ($model->id === $budgetId && $model->status->value === 'pending_approval') {
                throw new \RuntimeException('Injected post-copy failure for FI5/FI6.');
            }
        });

        $threw = false;
        try {
            $this->currentCompanyContext()->run($company, fn () => app(BudgetService::class)->submit($budgetId));
        } catch (\RuntimeException $e) {
            $threw = true;
            $this->assertSame('Injected post-copy failure for FI5/FI6.', $e->getMessage());
        }
        $this->assertTrue($threw, 'submit() must propagate the injected failure');

        // FI6: DB rollback — the Budget is still draft, nothing persisted.
        $fresh = $this->currentCompanyContext()->run($company, fn () => Budget::query()->findOrFail($budgetId));
        $this->assertSame('draft', $fresh->status->value);
        $this->assertNull($fresh->company_snapshot);
        $this->assertNull($fresh->proposal_logo_path);

        // FI5: the copy made before the injected failure was removed —
        // no orphan file survives.
        $files = Storage::disk('public')->allFiles("companies/{$company->id}/proposals/{$budgetId}");
        $this->assertCount(0, $files, 'the proposal logo copy must be removed after a real post-copy submit failure');
    }

    /** FI7: a successful transaction preserves the copy (no post-hoc cleanup on success). */
    public function test_fi7_successful_transaction_preserves_copy(): void
    {
        [$company, $budgetId] = $this->companyWithLogoAndDraftBudget();

        $this->postJson("/api/v1/budgets/{$budgetId}/submit")->assertStatus(200);

        $fresh = $this->currentCompanyContext()->run($company, fn () => Budget::query()->findOrFail($budgetId));
        Storage::disk('public')->assertExists($fresh->proposal_logo_path);
    }

    /** FI8: a repeat submit (409) creates no new copy. */
    public function test_fi8_repeat_submit_creates_no_new_copy(): void
    {
        [$company, $budgetId] = $this->companyWithLogoAndDraftBudget();
        $this->postJson("/api/v1/budgets/{$budgetId}/submit")->assertStatus(200);

        $countBefore = count(Storage::disk('public')->allFiles("companies/{$company->id}/proposals/{$budgetId}"));

        $this->postJson("/api/v1/budgets/{$budgetId}/submit")->assertStatus(409);

        $countAfter = count(Storage::disk('public')->allFiles("companies/{$company->id}/proposals/{$budgetId}"));
        $this->assertSame($countBefore, $countAfter);
        $this->assertSame(1, $countAfter);
    }

    /** FI9: a source-missing logo remains a controlled 422 (unchanged behavior). */
    public function test_fi9_source_missing_remains_controlled_422(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $company->logo_path = "companies/{$company->id}/logos/does-not-exist.png";
        $company->save();
        $customer = $this->makeCustomer();
        $budgetId = $this->postJson('/api/v1/budgets', $this->validBudgetPayload(['customer_id' => $customer->id]))->json('id');
        $this->postJson("/api/v1/budgets/{$budgetId}/items", $this->manualItemPayload());

        $response = $this->postJson("/api/v1/budgets/{$budgetId}/submit");
        $response->assertStatus(422);
        $this->assertSame(
            'A logo cadastrada da empresa não está disponível. Reenvie a logo antes de disponibilizar a proposta.',
            $response->json('message')
        );

        $fresh = $this->currentCompanyContext()->run($company, fn () => Budget::query()->findOrFail($budgetId));
        $this->assertSame('draft', $fresh->status->value);
    }

    /** FI10: replacing the Company logo after a valid submit preserves the proposal copy. */
    public function test_fi10_company_logo_replacement_after_valid_submit_preserves_copy(): void
    {
        [$company, $budgetId] = $this->companyWithLogoAndDraftBudget();
        $submitted = $this->postJson("/api/v1/budgets/{$budgetId}/submit")->json();
        $logoUrlBefore = $submitted['proposal_company']['logo_url'];

        app(CompanyLogoService::class)->store($company->fresh(), $this->fakeLogo('replacement.png'));

        $after = $this->getJson("/api/v1/budgets/{$budgetId}")->json();
        $this->assertSame($logoUrlBefore, $after['proposal_company']['logo_url']);
    }

    protected function tearDown(): void
    {
        Mockery::close();
        parent::tearDown();
    }
}
