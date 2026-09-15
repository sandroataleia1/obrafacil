<?php

namespace Tests\Feature\Budgets;

use App\Budgets\Exceptions\ProposalDocumentInvariantException;
use App\Budgets\Proposal\ProposalDocumentDataBuilder;
use App\Companies\CompanyLogoService;
use App\Models\Budget;
use App\Models\Company;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\Feature\Budgets\Concerns\InteractsWithBudgets;
use Tests\TestCase;

/**
 * PROPOSAL-DOC-01A1 §24: IV1-IV6 — `ProposalDocumentDataBuilder::forSubmitted()`
 * must fail loudly (never `?? []`/`?? 1`) when a submitted Budget's
 * historical proposal data is structurally invalid.
 */
class ProposalDocumentInvariantTest extends TestCase
{
    use InteractsWithBudgets, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('public');
    }

    /**
     * @return array{0: Company, 1: string} [company, budgetId]
     */
    private function submittedBudget(): array
    {
        [$company] = $this->actingAsNewCompanyMember();
        $customer = $this->makeCustomer();
        $budgetId = $this->postJson('/api/v1/budgets', $this->validBudgetPayload(['customer_id' => $customer->id]))->json('id');
        $this->postJson("/api/v1/budgets/{$budgetId}/items", $this->manualItemPayload());
        $this->postJson("/api/v1/budgets/{$budgetId}/submit");

        return [$company, $budgetId];
    }

    /** IV1: a submitted Budget with a null company_snapshot fails to build a document. */
    public function test_iv1_submitted_snapshot_null_fails(): void
    {
        [$company, $budgetId] = $this->submittedBudget();

        // Simulates historical corruption — a real submit() never leaves
        // this null, so this is only reachable via direct DB tampering.
        $this->currentCompanyContext()->run($company, function () use ($budgetId) {
            Budget::withoutCompanyScope()->whereKey($budgetId)->update(['company_snapshot' => null]);
        });

        $budget = $this->currentCompanyContext()->run($company, fn () => Budget::query()->with('items')->findOrFail($budgetId));

        $this->expectException(ProposalDocumentInvariantException::class);
        app(ProposalDocumentDataBuilder::class)->forSubmitted($budget);
    }

    /** IV2: a submitted Budget with a null proposal_template_version fails to build a document. */
    public function test_iv2_submitted_template_version_null_fails(): void
    {
        [$company, $budgetId] = $this->submittedBudget();

        $this->currentCompanyContext()->run($company, function () use ($budgetId) {
            Budget::withoutCompanyScope()->whereKey($budgetId)->update(['proposal_template_version' => null]);
        });

        $budget = $this->currentCompanyContext()->run($company, fn () => Budget::query()->with('items')->findOrFail($budgetId));

        $this->expectException(ProposalDocumentInvariantException::class);
        app(ProposalDocumentDataBuilder::class)->forSubmitted($budget);
    }

    /** IV3: an unknown proposal_template_version fails, never falls back to "latest". */
    public function test_iv3_unknown_template_version_fails(): void
    {
        [$company, $budgetId] = $this->submittedBudget();

        $this->currentCompanyContext()->run($company, function () use ($budgetId) {
            Budget::withoutCompanyScope()->whereKey($budgetId)->update(['proposal_template_version' => 99]);
        });

        $budget = $this->currentCompanyContext()->run($company, fn () => Budget::query()->with('items')->findOrFail($budgetId));

        $this->expectException(ProposalDocumentInvariantException::class);
        $this->expectExceptionMessage('Unsupported proposal template version: 99');
        app(ProposalDocumentDataBuilder::class)->forSubmitted($budget);
    }

    /** IV4: a submitted Budget whose proposal_logo_path file has disappeared fails PDF render — never silently renders without a logo. */
    public function test_iv4_submitted_logo_missing_fails_render(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $company = app(CompanyLogoService::class)->store($company, UploadedFile::fake()->create('logo.png', 50, 'image/png'));
        $customer = $this->makeCustomer();
        $budgetId = $this->postJson('/api/v1/budgets', $this->validBudgetPayload(['customer_id' => $customer->id]))->json('id');
        $this->postJson("/api/v1/budgets/{$budgetId}/items", $this->manualItemPayload());
        $submitted = $this->postJson("/api/v1/budgets/{$budgetId}/submit")->json();
        $this->assertNotNull($submitted['proposal_company']['logo_url']);

        $budget = $this->currentCompanyContext()->run($company, fn () => Budget::query()->with('items')->findOrFail($budgetId));
        // The frozen copy disappears from disk — historical data corruption.
        Storage::disk('public')->delete($budget->proposal_logo_path);

        $this->expectException(ProposalDocumentInvariantException::class);
        app(ProposalDocumentDataBuilder::class)->forSubmitted($budget);
    }

    /** IV5: a draft preview still works with no logo at all (never an invariant failure — this is a normal, allowed state). */
    public function test_iv5_draft_preview_still_works_with_no_logo(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $customer = $this->makeCustomer();
        $budgetId = $this->postJson('/api/v1/budgets', $this->validBudgetPayload(['customer_id' => $customer->id]))->json('id');

        $response = $this->get("/api/v1/budgets/{$budgetId}/proposal-preview.pdf");
        $response->assertOk();
        $this->assertStringStartsWith('%PDF-', $response->getContent());
    }

    /** IV6: a genuinely valid submitted document renders unchanged (no regression from the new checks). */
    public function test_iv6_valid_submitted_document_unchanged(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $company = app(CompanyLogoService::class)->store($company, UploadedFile::fake()->create('logo.png', 50, 'image/png'));
        $customer = $this->makeCustomer();
        $budgetId = $this->postJson('/api/v1/budgets', $this->validBudgetPayload(['customer_id' => $customer->id]))->json('id');
        $this->postJson("/api/v1/budgets/{$budgetId}/items", $this->manualItemPayload());
        $token = $this->postJson("/api/v1/budgets/{$budgetId}/submit")->json('proposal_token');

        $response = $this->get("/api/v1/proposals/{$token}/pdf");
        $response->assertOk();
        $this->assertStringStartsWith('%PDF-', $response->getContent());
    }
}
